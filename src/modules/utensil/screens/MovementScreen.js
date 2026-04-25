import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { getSessionCustomerItems } from '../services/customers';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import {
  clearContextMovements,
  getUtensilMovementRows,
  loadUtensilMovementSummaryWithInitialSync as loadMovementSummary,
  refreshUtensilMovementsFromApi,
  utensilMovementSyncStatus
} from '../services/movements';
import { getUtensilsByIds } from '../services/utensils';

export default function MovementScreen({ route, navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatchedTotal, setDispatchedTotal] = useState(0);
  const [returnedTotal, setReturnedTotal] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const listRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);
  const customerName = route?.params?.customerName;
  const customerCode = route?.params?.customerCode;
  const customerId = route?.params?.customerId;
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const sessionName = route?.params?.sessionName;
  const tripNo = route?.params?.tripNo ?? 1;
  const toastTimerRef = useRef(null);
  const title = customerCode || customerName || 'Customer';
  
  const getSubtitle = () => {
    const parts = [];
    parts.push(formatIsoDateForDisplay(selectedDate));
    
    if (selectedDate) {
      const date = new Date(selectedDate + 'T00:00:00');
      if (!Number.isNaN(date.getTime())) {
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        parts.push(dayName);
      }
    }
    
    if (sessionName) {
      parts.push(sessionName);
    }
    
    return parts.filter(Boolean).join(' | ');
  };
  
  const subtitle = getSubtitle();

  const showFetchErrorToast = useCallback(() => {
    const message =
      'Unable to fetch utensil movement data. Please check your internet connection and try again.';

    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
      return;
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const formatQuantity = useCallback((value) => {
    const numericValue = Number(value ?? 0);

    if (!Number.isFinite(numericValue)) {
      return '0';
    }

    const roundedValue = Math.round(numericValue * 100) / 100;

    if (Number.isInteger(roundedValue)) {
      return String(roundedValue);
    }

    return roundedValue.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const movementContext = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      const [storedItems, movementSummary] = await Promise.all([
        getSessionCustomerItems({
          orderDate: selectedDate,
          sessionId,
          customerId,
        }),
        loadMovementSummary(movementContext),
      ]);
      const movementRows = await getUtensilMovementRows(movementContext);
      const movementRowsByItemId = new Map();
      const cachedUtensilIds = [
        ...new Set(
          movementRows
            .map((row) => (row?.utensilId != null ? String(row.utensilId) : null))
            .filter(Boolean)
        ),
      ];
      const cachedUtensils = cachedUtensilIds.length > 0 ? await getUtensilsByIds(cachedUtensilIds) : [];
      const utensilNameById = {};

      cachedUtensils.forEach((utensil) => {
        utensilNameById[utensil.id] = utensil.name;
      });

      movementRows.forEach((row) => {
        const itemId =
          row?.itemId != null
            ? String(row.itemId)
            : row?.despatchItemId != null
              ? String(row.despatchItemId)
              : null;
        const utensilId = row?.utensilId != null ? String(row.utensilId) : null;

        if (!itemId || !utensilId) {
          return;
        }

        const existingRows = movementRowsByItemId.get(itemId) ?? [];
        existingRows.push({
          id: row.id,
          utensilId,
          name: utensilNameById[utensilId] ?? `Utensil ${utensilId}`,
          despatchedQuantity: Number(row.despatchedQuantity ?? 0),
          returnedQuantity: Number(row.returnedQuantity ?? 0),
          syncStatus: row.syncStatus,
          despatchApproved: Boolean(row.despatchApproved),
        });
        movementRowsByItemId.set(itemId, existingRows);
      });

      const nextItems = storedItems.map((item) => ({
        ...item,
        utensilTags: movementRowsByItemId.get(String(item.id)) ?? [],
      }));

      setItems(nextItems);
      setDispatchedTotal(movementSummary.dispatchedTotal);
      setReturnedTotal(movementSummary.returnedTotal);
    } catch (error) {
      console.log('Load movement items error:', error);
      setItems([]);
      setDispatchedTotal(0);
      setReturnedTotal(0);
    } finally {
      setLoading(false);
    }
  }, [customerId, selectedDate, sessionId, tripNo]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      await clearContextMovements(context);
      await refreshUtensilMovementsFromApi(context);
      await loadItems();
    } catch (error) {
      console.log('Refresh utensil movement error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [customerId, loadItems, selectedDate, sessionId, showFetchErrorToast, tripNo]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert('Movement Options', 'Choose an action', [
      {
        text: 'Refresh',
        onPress: () => {
          handleRefresh();
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleRefresh]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [navigation, openOptionsMenu]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      try {
        const justSubmitted = await AsyncStorage.getItem('justSubmitted');
        if (justSubmitted) {
          shouldRestoreScrollRef.current = false;
          await handleRefresh();
          await AsyncStorage.removeItem('justSubmitted');
        } else {
          await loadItems();
        }
      } catch (error) {
        console.log('Reload utensil movement summary error:', error);
      }
    });

    return unsubscribe;
  }, [handleRefresh, loadItems, navigation]);

  useEffect(() => {
    if (loading || !shouldRestoreScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: scrollOffsetRef.current,
        animated: false,
      });
      shouldRestoreScrollRef.current = false;
    });
  }, [items, loading]);

  const renderUtensilTag = useCallback(
    (utensil) => {
      const isLocalOnly = utensil.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;
      const isChanged = utensil.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
      const isApproved = utensil.despatchApproved;
      const tagStyle = [
        styles.utensilTag,
        isLocalOnly ? styles.utensilTagLocalOnly : null,
        isChanged ? styles.utensilTagChanged : null,
        isApproved ? styles.utensilTagApproved : null,
      ];
      const tagMetaStyle = [
        styles.utensilTagMeta,
        isLocalOnly ? styles.utensilTagMetaLocalOnly : null,
        isChanged ? styles.utensilTagMetaChanged : null,
      ];
      const statusLabel = isLocalOnly ? 'Created' : isChanged ? 'Changed' : 'Submitted';

      return (
        <View key={utensil.id} style={tagStyle}>
          <View style={styles.utensilTagHeader}>
            <Text style={styles.utensilTagName} numberOfLines={1}>
              {utensil.name}
            </Text>
            {isApproved && (
              <View style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              </View>
            )}
          </View>
          <Text style={tagMetaStyle}>
            {`D ${formatQuantity(utensil.despatchedQuantity)} | R ${formatQuantity(utensil.returnedQuantity)}`}
          </Text>
          <View
            style={[
              styles.utensilTagBadge,
              isLocalOnly ? styles.utensilTagBadgeLocalOnly : null,
              isChanged ? styles.utensilTagBadgeChanged : null,
              isApproved ? styles.utensilTagBadgeApproved : null,
            ]}
          >
            <Text
              style={[
                styles.utensilTagBadgeText,
                isLocalOnly ? styles.utensilTagBadgeTextLocalOnly : null,
                isChanged ? styles.utensilTagBadgeTextChanged : null,
                isApproved ? styles.utensilTagBadgeTextApproved : null,
              ]}
            >
              {isApproved ? '✓ Approved' : statusLabel}
            </Text>
          </View>
        </View>
      );
    },
    [formatQuantity]
  );

  const getItemColor = (index) => {
    const colors = [
      { icon: '#3b82f6', background: '#eff6ff' }, // Blue
      { icon: '#f59e0b', background: '#fffbeb' }, // Amber
      { icon: '#10b981', background: '#f0fdf4' }, // Green
      { icon: '#8b5cf6', background: '#faf5ff' }, // Purple
      { icon: '#ec4899', background: '#fdf2f8' }, // Pink
      { icon: '#06b6d4', background: '#ecfdfd' }, // Cyan
    ];
    return colors[index % colors.length];
  };

  const renderItem = ({ item, index }) => {
    const colors = getItemColor(index);
    return (
    <Pressable
      style={{ width: '100%' }}
      onPress={() => {
        shouldRestoreScrollRef.current = true;
        navigation.navigate('Utensil', {
          itemId: item.id,
          itemDespatchItemId: item.despatchItemId,
          itemName: item.name,
          itemQuantity: item.quantity,
          itemUomName: item.uomName,
          itemComboNamesLabel: item.comboNamesLabel,
          itemGroupId: item.groupId,
          itemGroupName: item.groupName,
          recipeId: item.recipeId,
          sessionId,
          customerId,
          selectedDate,
          sessionName,
          customerName,
          customerCode,
          tripNo,
        });
      }}
    >
      <View style={[styles.itemCard, { backgroundColor: colors.background }]}>
        <View style={styles.itemCardGlow} />
        <View style={styles.itemCardHeader}>
          <View style={[styles.itemIconWrap, { backgroundColor: colors.icon }]}>
            <Ionicons name="restaurant" size={20} color="#fff" />
          </View>
          <View style={styles.itemContentWrap}>
            <View style={styles.itemNameRow}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemQuantityInline}>
                {`${formatQuantity(item.quantity)}${item.uomName ? ` ${item.uomName}` : ''}`}
              </Text>
            </View>
            {!!item.comboNamesLabel && <Text style={styles.itemMeta}>{item.comboNamesLabel}</Text>}
          </View>
        </View>
        {!!item.utensilTags?.length && (
          <View style={styles.utensilTagsWrap}>{item.utensilTags.map(renderUtensilTag)}</View>
        )}
      </View>
    </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBlobTop} />
      <View style={styles.backgroundBlobBottom} />
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBrandWrap}>
            <View style={styles.heroLogoCard}>
              <Image
                source={require('../../../../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{title}</Text>
              <Text style={styles.title}>Items</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="swap-horizontal-outline" size={14} color="#0f766e" />
            <Text style={styles.heroBadgeText}>{items.length}</Text>
          </View>
        </View>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items.filter(item => Number(item.quantity ?? 0) > 0)}
          keyExtractor={(item, index) => `${item.id}-${item.utensilTags.length}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No items available.</Text>}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        />
      )}

      <View style={styles.summaryCard}>
        <Pressable
          style={[styles.summaryBlock, styles.summaryBlockLeft]}
          onPress={() =>
            navigation.navigate('DespatchedUtensils', {
              selectedDate,
              sessionId,
              customerId,
              sessionName,
              customerName,
              customerCode,
              tripNo,
            })
          }
        >
          <Text style={styles.summaryLabel}>Despatched Utensil</Text>
          <Text style={styles.summaryValue}>{dispatchedTotal}</Text>
        </Pressable>
        <View style={styles.summaryDivider} />
        <Pressable
          style={[styles.summaryBlock, styles.summaryBlockRight]}
          onPress={() =>
            navigation.navigate('ReturnedUtensils', {
              selectedDate,
              sessionId,
              customerId,
              sessionName,
              customerName,
              customerCode,
              tripNo,
            })
          }
        >
          <Text style={styles.summaryLabel}>Returned Utensil</Text>
          <Text style={styles.summaryValue}>{returnedTotal}</Text>
        </Pressable>
      </View>

      {!!toastMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4ecde',
    padding: 16,
    paddingTop: 34,
  },
  backgroundBlobTop: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#f59e0b',
    opacity: 0.12,
  },
  backgroundBlobBottom: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0f766e',
    opacity: 0.08,
  },
  heroCard: {
    backgroundColor: '#fffaf2',
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.10)',
    shadowColor: '#7c2d12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroLogoCard: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: {
    width: 38,
    height: 38,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#b45309',
    marginBottom: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e6fffb',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    width: '100%',
    paddingBottom: 16,
    gap: 8,
  },
  itemCard: {
    width: '100%',
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  itemCardGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemQuantityInline: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  itemQuantityText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  itemQuantityBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQuantityValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  itemUomName: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemQuantity: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'right',
  },
  itemMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  utensilTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  utensilTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  utensilTagLocalOnly: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  utensilTagChanged: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  utensilTagName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    maxWidth: 140,
  },
  utensilTagMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  utensilTagMetaLocalOnly: {
    color: '#15803d',
  },
  utensilTagMetaChanged: {
    color: '#b45309',
  },
  utensilTagBadge: {
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  utensilTagBadgeLocalOnly: {
    backgroundColor: '#bbf7d0',
  },
  utensilTagBadgeChanged: {
    backgroundColor: '#fde68a',
  },
  utensilTagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  utensilTagBadgeTextLocalOnly: {
    color: '#166534',
  },
  utensilTagBadgeTextChanged: {
    color: '#92400e',
  },
  utensilTagApproved: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  utensilTagBadgeApproved: {
    backgroundColor: '#bbf7d0',
  },
  utensilTagBadgeTextApproved: {
    color: '#166534',
  },
  utensilTagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  summaryCard: {
    marginTop: 8,
    flexDirection: 'row',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.10)',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  summaryBlock: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBlockLeft: {
    backgroundColor: '#eff6ff',
  },
  summaryBlockRight: {
    backgroundColor: '#f0fdf4',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#d1d5db',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 24,
    color: '#111827',
    fontWeight: '800',
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },
});
