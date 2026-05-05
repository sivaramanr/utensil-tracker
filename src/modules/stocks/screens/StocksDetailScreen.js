import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { getLastDayClosed, getRawMaterials, saveStockItem } from '../services/stocks';

const THEME = '#4f46e5';
const THEME_BG = '#f5f3ff';

function formatPrice(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return '—';
  return `₹${n.toFixed(2)}`;
}

function formatQty(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return '—';
  return String(parseFloat(n.toFixed(3)));
}

// ─── Raw material item card ──────────────────────────────────────────────────

function RawMaterialCard({ item, isLocked, onSave, isSaving }) {
  const [text, setText] = useState(
    item.manualQuantity != null ? String(parseFloat(item.manualQuantity.toFixed(3))) : ''
  );
  const committedRef = useRef(item.manualQuantity);

  useEffect(() => {
    const fresh = item.manualQuantity != null
      ? String(parseFloat(item.manualQuantity.toFixed(3)))
      : '';
    setText(fresh);
    committedRef.current = item.manualQuantity;
  }, [item.manualQuantity]);

  const handleEndEditing = () => {
    const n = parseFloat(text);
    const value = Number.isNaN(n) ? null : Math.max(0, n);
    if (value === committedRef.current) return;
    committedRef.current = value;
    onSave(item, value ?? 0);
  };

  const hasManual = text !== '';
  const diffFlag =
    hasManual &&
    item.systemQuantity != null &&
    parseFloat(text) !== parseFloat(item.systemQuantity.toFixed(3));

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemRow}>
        <View style={styles.itemNameWrap}>
          <Text style={styles.itemName} numberOfLines={2}>{item.rawMaterialName}</Text>
          <View style={styles.itemMeta}>
            {!!item.uomName && (
              <View style={styles.uomChip}>
                <Text style={styles.uomText}>{item.uomName}</Text>
              </View>
            )}
            {item.isEssential && (
              <View style={styles.essentialChip}>
                <Text style={styles.essentialText}>Essential</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            style={[
              styles.qtyInput,
              isLocked && styles.qtyInputLocked,
              diffFlag && !isLocked && styles.qtyInputDiff,
            ]}
            value={text}
            onChangeText={setText}
            onEndEditing={handleEndEditing}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor="#9ca3af"
            editable={!isLocked}
            selectTextOnFocus
            returnKeyType="done"
          />
          {isSaving && <ActivityIndicator size="small" color={THEME} style={styles.savingSpinner} />}
          {isLocked && (
            <Ionicons name="lock-closed-outline" size={13} color="#9ca3af" style={styles.lockIcon} />
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>LPP</Text>
          <Text style={styles.statValue}>{formatPrice(item.lastPurchasedPrice)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>System Qty</Text>
          <Text style={styles.statValue}>{formatQty(item.systemQuantity)}</Text>
        </View>
        {diffFlag && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: '#ef4444' }]}>Diff</Text>
              <Text style={[styles.statValue, { color: '#ef4444' }]}>
                {parseFloat((parseFloat(text) - (item.systemQuantity ?? 0)).toFixed(3))}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Category card ───────────────────────────────────────────────────────────

function CategoryCard({ title, count, onPress }) {
  return (
    <Pressable style={styles.categoryCard} onPress={onPress}>
      <View style={styles.categoryIconWrap}>
        <Ionicons name="grid-outline" size={20} color={THEME} />
      </View>
      <Text style={styles.categoryName} numberOfLines={1}>{title}</Text>
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryBadgeText}>{count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StocksDetailScreen({ navigation, route }) {
  const { selectedDate, stockUpdateId, stockStatus } = route.params ?? {};
  const insets = useSafeAreaInsets();

  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [essentialOnly, setEssentialOnly] = useState(true);
  const [savingMap, setSavingMap] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isPullRefresh = false) => {
    if (!stockUpdateId) { setLoading(false); return; }
    if (isPullRefresh) setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    try {
      const [items, lastClosed] = await Promise.all([
        getRawMaterials({ stockUpdateId, forceRefresh: isPullRefresh }),
        getLastDayClosed(),
      ]);
      setAllItems(items);
      const closedOn = lastClosed?.closedOn ?? null;
      setIsLocked(!!closedOn && selectedDate <= closedOn);
    } catch (error) {
      console.error('[STOCKS] Detail load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [stockUpdateId, selectedDate]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(false));
    return unsub;
  }, [navigation, load]);

  // When filter changes, go back to category list so counts update visibly
  useEffect(() => { setSelectedCategory(null); }, [essentialOnly]);

  const handleSave = useCallback(async (item, value) => {
    setSavingMap((prev) => ({ ...prev, [item.rawMaterialId]: true }));
    try {
      await saveStockItem({
        stockUpdateId,
        rawMaterialId: item.rawMaterialId,
        updatedQuantity: value,
        systemQuantity: item.systemQuantity ?? 0,
      });
      setAllItems((prev) =>
        prev.map((i) =>
          i.rawMaterialId === item.rawMaterialId ? { ...i, manualQuantity: value } : i
        )
      );
    } catch (error) {
      console.warn('[STOCKS] Save item failed:', error.message);
    } finally {
      setSavingMap((prev) => ({ ...prev, [item.rawMaterialId]: false }));
    }
  }, [stockUpdateId]);

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      navigation.goBack();
    }
  };

  // Build category sections sorted by categoryOrder
  const filteredItems = essentialOnly ? allItems.filter((i) => i.isEssential) : allItems;
  const sectionMap = {};
  for (const item of filteredItems) {
    const key = item.categoryName;
    if (!sectionMap[key]) {
      sectionMap[key] = { title: key, order: item.categoryOrder ?? 9999, data: [] };
    }
    sectionMap[key].data.push(item);
  }
  const sections = Object.values(sectionMap).sort((a, b) => a.order - b.order);

  // Keep selectedCategory's items in sync with allItems (e.g. after save)
  const categoryItems = selectedCategory
    ? filteredItems.filter((i) => i.categoryName === selectedCategory.title)
    : [];

  const STATUS_COLORS = {
    COMPLETED: { color: '#065f46', bg: '#dcfce7' },
    NEW:       { color: '#92400e', bg: '#fef3c7' },
  };
  const statusStyle = stockStatus ? STATUS_COLORS[stockStatus] : null;

  const renderItem = ({ item }) => (
    <RawMaterialCard
      item={item}
      isLocked={isLocked}
      onSave={handleSave}
      isSaving={!!savingMap[item.rawMaterialId]}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top || 34 }]}>
      <View style={styles.backgroundBlobTop} />

      {/* Header — eyebrow/title change based on drill-down level */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color="#374151" />
          </Pressable>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroEyebrow}>
              {selectedCategory
                ? formatIsoDateForDisplay(selectedDate, selectedDate)
                : 'STOCK UPDATE'}
            </Text>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {selectedCategory ? selectedCategory.title : formatIsoDateForDisplay(selectedDate, selectedDate)}
            </Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              style={[styles.filterChip, essentialOnly && styles.filterChipActive]}
              onPress={() => setEssentialOnly((v) => !v)}
            >
              <Ionicons
                name={essentialOnly ? 'star' : 'star-outline'}
                size={13}
                color={essentialOnly ? THEME : '#6b7280'}
              />
              <Text style={[styles.filterChipText, essentialOnly && styles.filterChipTextActive]}>
                Essential
              </Text>
            </Pressable>
            <View style={[styles.countBadge, { backgroundColor: '#e0e7ff' }]}>
              <Ionicons name="layers-outline" size={13} color={THEME} />
              <Text style={[styles.countBadgeText, { color: THEME }]}>
                {selectedCategory ? categoryItems.length : filteredItems.length}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.heroSubRow}>
          {isLocked && (
            <View style={[styles.statusChip, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="lock-closed-outline" size={12} color="#b91c1c" />
              <Text style={[styles.statusChipText, { color: '#b91c1c' }]}>Period Closed</Text>
            </View>
          )}
          {!!statusStyle && (
            <View style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusChipText, { color: statusStyle.color }]}>{stockStatus}</Text>
            </View>
          )}
        </View>
      </View>

      {/* No stock update for this date */}
      {!stockUpdateId && !loading && (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: '#e0e7ff' }]}>
            <Ionicons name="layers-outline" size={40} color={THEME} />
          </View>
          <Text style={styles.emptyTitle}>No Stock Entry</Text>
          <Text style={styles.emptySubtitle}>No stock update has been created for this date.</Text>
        </View>
      )}

      {stockUpdateId && loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      )}

      {/* Category list */}
      {stockUpdateId && !loading && !selectedCategory && (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          renderItem={({ item: section }) => (
            <CategoryCard
              title={section.title}
              count={section.data.length}
              onPress={() => setSelectedCategory(section)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: (insets.bottom || 16) + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[THEME]}
              tintColor={THEME}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {essentialOnly ? 'No essential raw materials found.' : 'No raw materials found.'}
            </Text>
          }
        />
      )}

      {/* Items filtered by selected category */}
      {stockUpdateId && !loading && !!selectedCategory && (
        <FlatList
          data={categoryItems}
          keyExtractor={(item) => item.rawMaterialId}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: (insets.bottom || 16) + 24 }]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>No items in this category.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME_BG },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#818cf8', opacity: 0.12,
  },

  heroCard: {
    backgroundColor: '#fafafe', borderRadius: 28, padding: 18, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.12)',
    shadowColor: '#3730a3', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 38, height: 38, borderRadius: 14,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0,
  },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#3730a3', marginBottom: 2,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#e0e7ff', borderColor: 'rgba(79,70,229,0.3)' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  filterChipTextActive: { color: THEME },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700' },
  heroSubRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 8 },

  // Category cards
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fafafe', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.09)',
  },
  categoryIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  categoryName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  categoryBadge: {
    backgroundColor: '#e0e7ff', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0,
  },
  categoryBadgeText: { fontSize: 14, fontWeight: '800', color: THEME },

  // Item cards
  itemCard: {
    backgroundColor: '#fafafe', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.09)',
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  itemNameWrap: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  itemMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  uomChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#e0e7ff' },
  uomText: { fontSize: 11, fontWeight: '600', color: '#3730a3' },
  essentialChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#fef3c7' },
  essentialText: { fontSize: 11, fontWeight: '600', color: '#92400e' },

  inputWrap: { alignItems: 'center', gap: 4 },
  qtyInput: {
    width: 90, textAlign: 'right',
    borderWidth: 1.5, borderColor: 'rgba(79, 70, 229, 0.3)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 16, fontWeight: '700', color: THEME, backgroundColor: '#fff',
  },
  qtyInputLocked: { backgroundColor: '#f8fafc', borderColor: 'rgba(0,0,0,0.08)', color: '#94a3b8' },
  qtyInputDiff: { borderColor: '#ef4444', color: '#ef4444' },
  savingSpinner: { marginTop: 2 },
  lockIcon: { marginTop: 2 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  statDivider: { width: 1, height: 28, backgroundColor: '#e2e8f0' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontWeight: '500', color: '#94a3b8', textAlign: 'center', lineHeight: 22 },
  emptyText: { marginTop: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 },
});
