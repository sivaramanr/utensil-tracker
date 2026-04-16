import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { getSessionCustomerItems } from '../utils/customers';
import { formatIsoDateForDisplay } from '../utils/date';
import {
  clearContextMovements,
  getUtensilMovementRows,
  loadUtensilMovementSummaryWithInitialSync as loadMovementSummary,
  loadUtensilMovementSummaryWithInitialSync,
  refreshUtensilMovementsFromApi,
  utensilMovementSyncStatus,
} from '../utils/utensilMovements';
import { getUtensilsByIds } from '../utils/utensils';

export default function MovementScreen({ route, navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatchedTotal, setDispatchedTotal] = useState(0);
  const [returnedTotal, setReturnedTotal] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const customerName = route?.params?.customerName;
  const customerId = route?.params?.customerId;
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const sessionName = route?.params?.sessionName;
  const tripNo = route?.params?.tripNo ?? 1;
  const toastTimerRef = useRef(null);
  const title = customerName || 'Customer';
  const subtitle = [formatIsoDateForDisplay(selectedDate), sessionName].filter(Boolean).join(' | ');

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
        });
        movementRowsByItemId.set(itemId, existingRows);
      });

      const nextItems = storedItems.map((item) => ({
        ...item,
        utensilTags: movementRowsByItemId.get(String(item.id)) ?? [],
      }));

      setItems(nextItems);
    } catch (error) {
      console.log('Load movement items error:', error);
      setItems([]);
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

  const loadSummary = useCallback(async () => {
    try {
      const summary = await loadUtensilMovementSummaryWithInitialSync({
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      });
      setDispatchedTotal(summary.dispatchedTotal);
      setReturnedTotal(summary.returnedTotal);
    } catch (error) {
      console.log('Load utensil movement summary error:', error);
      setDispatchedTotal(0);
      setReturnedTotal(0);
    }
  }, [customerId, selectedDate, sessionId, tripNo]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

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
      await Promise.all([loadItems(), loadSummary()]);
    } catch (error) {
      console.log('Refresh utensil movement error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [customerId, loadItems, loadSummary, selectedDate, sessionId, showFetchErrorToast, tripNo]);

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
          await handleRefresh();
          await AsyncStorage.removeItem('justSubmitted');
        } else {
          await Promise.all([loadItems(), loadSummary()]);
        }
      } catch (error) {
        console.log('Reload utensil movement summary error:', error);
      }
    });

    return unsubscribe;
  }, [handleRefresh, loadItems, loadSummary, navigation]);

  const renderUtensilTag = useCallback(
    (utensil) => {
      const isLocalOnly = utensil.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;
      const isChanged = utensil.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
      const tagStyle = [
        styles.utensilTag,
        isLocalOnly ? styles.utensilTagLocalOnly : null,
        isChanged ? styles.utensilTagChanged : null,
      ];
      const tagMetaStyle = [
        styles.utensilTagMeta,
        isLocalOnly ? styles.utensilTagMetaLocalOnly : null,
        isChanged ? styles.utensilTagMetaChanged : null,
      ];
      const statusLabel = isLocalOnly ? 'Created' : isChanged ? 'Changed' : 'Submitted';

      return (
        <View key={utensil.id} style={tagStyle}>
          <Text style={styles.utensilTagName} numberOfLines={1}>
            {utensil.name}
          </Text>
          <Text style={tagMetaStyle}>
            {`D ${formatQuantity(utensil.despatchedQuantity)} | R ${formatQuantity(utensil.returnedQuantity)}`}
          </Text>
          <View
            style={[
              styles.utensilTagBadge,
              isLocalOnly ? styles.utensilTagBadgeLocalOnly : null,
              isChanged ? styles.utensilTagBadgeChanged : null,
            ]}
          >
            <Text
              style={[
                styles.utensilTagBadgeText,
                isLocalOnly ? styles.utensilTagBadgeTextLocalOnly : null,
                isChanged ? styles.utensilTagBadgeTextChanged : null,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      );
    },
    [formatQuantity]
  );

  const renderItem = ({ item }) => (
    <Pressable
      style={{ width: '100%' }}
      onPress={() =>
        navigation.navigate('Utensil', {
          itemId: item.id,
          itemDespatchItemId: item.despatchItemId,
          itemName: item.name,
          itemQuantity: item.quantity,
          itemUomName: item.uomName,
          itemComboNamesLabel: item.comboNamesLabel,
          itemGroupId: item.groupId,
          itemGroupName: item.groupName,
          sessionId,
          customerId,
          selectedDate,
          sessionName,
          customerName,
          tripNo,
        })
      }
    >
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemQuantity}>
            {`${formatQuantity(item.quantity)}${item.uomName ? ` ${item.uomName}` : ''}`}
          </Text>
        </View>
        {!!item.comboNamesLabel && <Text style={styles.itemMeta}>{item.comboNamesLabel}</Text>}
        {!!item.utensilTags?.length && (
          <View style={styles.utensilTagsWrap}>{item.utensilTags.map(renderUtensilTag)}</View>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id}-${item.utensilTags.length}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No items available.</Text>}
          refreshing={refreshing}
          onRefresh={handleRefresh}
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
              tripNo,
            })
          }
        >
          <Text style={styles.summaryLabel}>Despatched Utensil</Text>
          <Text style={styles.summaryValue}>{dispatchedTotal}</Text>
        </Pressable>
        <View style={styles.summaryDivider} />
        <View style={[styles.summaryBlock, styles.summaryBlockRight]}>
          <Text style={styles.summaryLabel}>Retruned Utensil</Text>
          <Text style={styles.summaryValue}>{returnedTotal}</Text>
        </View>
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
    backgroundColor: '#fff',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 12,
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
  },
  itemCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
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
    marginTop: 2,
  },
  utensilTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  utensilTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  summaryCard: {
    marginTop: 8,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryBlock: {
    flex: 1,
    paddingVertical: 12,
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
    fontWeight: '500',
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 20,
    color: '#111827',
    fontWeight: '700',
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
