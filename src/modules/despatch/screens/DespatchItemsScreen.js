import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import {
  getSessionCustomerCombos,
  getSessionCustomerItems,
  syncSessionCustomersFromApi,
} from '../../../platform/services/sessionData';
import { getDespatchItems, refreshDespatchItems } from '../services/despatch';

const THEME = '#059669';

const ITEM_COLORS = [
  { icon: '#059669', background: '#f0fdf4' },
  { icon: '#0891b2', background: '#ecfeff' },
  { icon: '#7c3aed', background: '#f5f3ff' },
  { icon: '#db2777', background: '#fdf2f8' },
  { icon: '#d97706', background: '#fffbeb' },
  { icon: '#2563eb', background: '#eff6ff' },
];

const COMBO_COLORS = [
  { bg: '#dcfce7', paxColor: '#166534', labelColor: '#4ade80' },
  { bg: '#dbeafe', paxColor: '#1e40af', labelColor: '#60a5fa' },
  { bg: '#fef3c7', paxColor: '#92400e', labelColor: '#fbbf24' },
  { bg: '#fae8ff', paxColor: '#6b21a8', labelColor: '#c084fc' },
  { bg: '#ffe4e6', paxColor: '#9f1239', labelColor: '#fb7185' },
  { bg: '#ccfbf1', paxColor: '#134e4a', labelColor: '#2dd4bf' },
];

const STATUS_STYLE = {
  CREATED:   { color: '#166534', bg: '#dcfce7' },
  SUBMITTED: { color: '#92400e', bg: '#fef3c7' },
  APPROVED:  { color: '#065f46', bg: '#ccfbf1' },
};

function getStatusStyle(status) {
  return STATUS_STYLE[status] ?? { color: '#374151', bg: '#f3f4f6' };
}

function formatQty(value) {
  const n = Math.round(Number(value ?? 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export default function DespatchItemsScreen({ navigation, route }) {
  const {
    customerId, customerCode, customerName,
    selectedDate, sessionId, sessionName,
    tripNo = 1,
  } = route.params ?? {};

  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [combos, setCombos] = useState([]);
  const [despatchMap, setDespatchMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  // ── Animated header ──────────────────────────────────────────────────────
  const headerAnim   = useRef(new Animated.Value(1)).current;
  const lastScrollY  = useRef(0);
  const headerOpen   = useRef(true);

  const handleScroll = useCallback(({ nativeEvent }) => {
    const y  = nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;

    if (y <= 0 && !headerOpen.current) {
      headerOpen.current = true;
      Animated.timing(headerAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start();
      return;
    }
    if (dy > 6 && headerOpen.current) {
      headerOpen.current = false;
      Animated.timing(headerAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    } else if (dy < -6 && !headerOpen.current) {
      headerOpen.current = true;
      Animated.timing(headerAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start();
    }
  }, [headerAnim]);

  const heroPaddingV   = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 20] });
  const collapsibleH   = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] });
  const collapsibleOp  = headerAnim;
  // ─────────────────────────────────────────────────────────────────────────

  const subtitle = [
    formatIsoDateForDisplay(selectedDate),
    selectedDate
      ? (() => {
          const d = new Date(selectedDate + 'T00:00:00');
          return Number.isNaN(d.getTime())
            ? null
            : d.toLocaleDateString('en-US', { weekday: 'long' });
        })()
      : null,
    sessionName || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const showToast = useCallback((message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
      return;
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const buildDespatchMap = (entries) =>
    Object.fromEntries(entries.map((e) => [String(e.itemId), e]));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rawItems, rawCombos, despatchEntries] = await Promise.all([
        getSessionCustomerItems({ orderDate: selectedDate, sessionId, customerId }),
        getSessionCustomerCombos({ orderDate: selectedDate, sessionId, customerId }),
        getDespatchItems({ despatchDate: selectedDate, sessionId, customerId, tripNo }),
      ]);
      setItems(rawItems.filter((item) => Number(item.quantity ?? 0) > 0));
      setCombos(rawCombos);
      setDespatchMap(buildDespatchMap(despatchEntries));
    } catch (error) {
      console.error('DespatchItems load error:', error);
      showToast('Unable to load items. Please check your connection and try again.');
      setItems([]);
      setCombos([]);
      setDespatchMap({});
    } finally {
      setLoading(false);
    }
  }, [selectedDate, sessionId, customerId, tripNo, showToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncSessionCustomersFromApi({ orderDate: selectedDate, sessionId });
      const [rawItems, rawCombos, despatchEntries] = await Promise.all([
        getSessionCustomerItems({ orderDate: selectedDate, sessionId, customerId }),
        getSessionCustomerCombos({ orderDate: selectedDate, sessionId, customerId }),
        refreshDespatchItems({ despatchDate: selectedDate, sessionId, customerId, tripNo }),
      ]);
      setItems(rawItems.filter((item) => Number(item.quantity ?? 0) > 0));
      setCombos(rawCombos);
      setDespatchMap(buildDespatchMap(despatchEntries));
    } catch (error) {
      console.error('DespatchItems refresh error:', error);
      showToast('Unable to refresh. Please check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  }, [selectedDate, sessionId, customerId, tripNo, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadData());
    return unsub;
  }, [navigation, loadData]);

  const renderItem = ({ item, index }) => {
    const colors = ITEM_COLORS[index % ITEM_COLORS.length];
    const d = despatchMap[String(item.id)];
    const statusStyle = d?.status ? getStatusStyle(d.status) : null;

    return (
      <View style={[styles.itemCard, { backgroundColor: colors.background }]}>
        <View style={styles.itemCardGlow} />
        <View style={styles.itemCardHeader}>
          <View style={[styles.itemIconWrap, { backgroundColor: colors.icon }]}>
            <Ionicons name="restaurant" size={20} color="#fff" />
          </View>
          <View style={styles.itemContentWrap}>
            <View style={styles.itemNameRow}>
              <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>
                  {formatQty(item.quantity)}{item.uomName ? ` ${item.uomName}` : ''}
                </Text>
              </View>
            </View>
            {!!item.comboNamesLabel && (
              <Text style={styles.comboLabel} numberOfLines={1}>{item.comboNamesLabel}</Text>
            )}
          </View>
        </View>

        {!!d && (
          <View style={styles.despatchRow}>
            <View style={styles.despatchMetric}>
              <Text style={styles.despatchValue}>{formatQty(d.despatched)}</Text>
              <Text style={styles.despatchLabel}>Despatched</Text>
            </View>
            <View style={styles.despatchDivider} />
            <View style={styles.despatchMetric}>
              <Text style={styles.despatchValue}>{formatQty(d.dcQuantity)}</Text>
              <Text style={styles.despatchLabel}>DC Qty</Text>
            </View>
            <View style={styles.despatchDivider} />
            <View style={styles.despatchMetric}>
              <Text style={styles.despatchValue}>{formatQty(d.returned)}</Text>
              <Text style={styles.despatchLabel}>Returned</Text>
            </View>
            {!!statusStyle && (
              <>
                <View style={styles.despatchDivider} />
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.color }]}>
                    {d.status}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  const hasActiveCombos = combos.some((c) => c.totalPax > 0);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBlobTop} />
      <View style={styles.backgroundBlobBottom} />

      {/* ── Animated hero card ── */}
      <Animated.View style={[styles.heroCard, { paddingVertical: heroPaddingV }]}>
        {/* Always visible top row */}
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
              <Text style={styles.heroEyebrow} numberOfLines={1}>
                {customerCode || customerName || 'Customer'}
              </Text>
              <Text style={styles.title}>Items</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="cube-outline" size={14} color={THEME} />
            <Text style={styles.heroBadgeText}>{items.length}</Text>
          </View>
        </View>

        {/* Collapsible: subtitle + combo strip */}
        <Animated.View style={{ opacity: collapsibleOp, maxHeight: collapsibleH, overflow: 'hidden' }}>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {hasActiveCombos && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.comboStrip}
              contentContainerStyle={styles.comboStripContent}
            >
              {combos.filter((c) => c.totalPax > 0).map((combo, index) => {
                const c = COMBO_COLORS[index % COMBO_COLORS.length];
                return (
                  <View key={combo.id} style={[styles.comboCard, { backgroundColor: c.bg }]}>
                    <Text style={[styles.comboPax, { color: c.paxColor }]}>
                      {formatQty(combo.totalPax)}
                    </Text>
                    <Text style={[styles.comboName, { color: c.paxColor }]} numberOfLines={2}>
                      {combo.name}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </Animated.View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No items available for this session.</Text>}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}

      {/* DC Challan footer button */}
      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <Pressable
          style={styles.challanBtn}
          onPress={() =>
            navigation.navigate('DCChallan', {
              customerId, customerCode, customerName,
              selectedDate, sessionId, sessionName, tripNo,
            })
          }
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.challanBtnText}>Generate DC Challan</Text>
        </Pressable>
      </View>

      {!!toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4', padding: 16, paddingTop: 34 },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#059669', opacity: 0.10,
  },
  backgroundBlobBottom: {
    position: 'absolute', bottom: 80, left: -50,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#10b981', opacity: 0.07,
  },
  heroCard: {
    backgroundColor: '#f7fffe',
    borderRadius: 28,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(5, 150, 105, 0.12)',
    shadowColor: '#065f46', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  heroBrandWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  heroLogoCard: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroLogo: { width: 28, height: 28 },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#065f46', marginBottom: 2,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 999, backgroundColor: '#dcfce7',
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700', color: THEME },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 10 },
  comboStrip: { marginTop: 14, marginHorizontal: -4 },
  comboStripContent: { gap: 10, paddingHorizontal: 4, paddingBottom: 2 },
  comboCard: {
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 90, alignItems: 'center',
  },
  comboPax: { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  comboName: {
    fontSize: 11, fontWeight: '700', textAlign: 'center',
    marginTop: 4, maxWidth: 100,
  },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 90, gap: 10 },
  itemCard: {
    borderRadius: 24, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  },
  itemCardGlow: {
    position: 'absolute', top: -18, right: -18,
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  itemCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  itemIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemContentWrap: { flex: 1, justifyContent: 'center', gap: 4 },
  itemNameRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8,
  },
  itemName: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  qtyBadge: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, flexShrink: 0,
  },
  qtyBadgeText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  comboLabel: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  despatchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 4,
  },
  despatchMetric: { flex: 1, alignItems: 'center' },
  despatchValue: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  despatchLabel: { fontSize: 10, fontWeight: '600', color: '#6b7280', marginTop: 2 },
  despatchDivider: { width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.08)' },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, marginLeft: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyText: { marginTop: 24, textAlign: 'center', color: '#6b7280' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#f0fdf4',
    borderTopWidth: 1, borderTopColor: 'rgba(5, 150, 105, 0.12)',
  },
  challanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: THEME,
  },
  challanBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toast: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    backgroundColor: '#111827', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  toastText: { color: '#ffffff', fontSize: 13, textAlign: 'center' },
});
