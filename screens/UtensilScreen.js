import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getUtensilMovementRows,
  loadUtensilMovementSummaryWithInitialSync,
  setUtensilMovementQuantity,
} from '../utils/utensilMovements';
import { loadUtensilTypesByItemGroupWithInitialSync } from '../utils/utensilTypes';
import { loadUtensilsByTypeIdsWithInitialSync } from '../utils/utensils';

export default function UtensilScreen({ route, navigation }) {
  const itemName = route?.params?.itemName ?? 'Item';
  const itemGroupId = route?.params?.itemGroupId;
  const itemId = route?.params?.itemId;
  const itemDespatchItemId = route?.params?.itemDespatchItemId;
  const sessionId = route?.params?.sessionId;
  const customerId = route?.params?.customerId;
  const selectedDate = route?.params?.selectedDate;
  const sessionName = route?.params?.sessionName;
  const customerName = route?.params?.customerName;
  const customerCode = route?.params?.customerCode;
  const recipeId = route?.params?.recipeId;
  const tripNo = route?.params?.tripNo ?? 1;
  const subtitle = [sessionName, customerCode].filter(Boolean).join(' | ');
  const [utensils, setUtensils] = useState([]);
  const [countsByUtensilId, setCountsByUtensilId] = useState({});
  const [dispatchedTotal, setDispatchedTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUtensils = useCallback(async () => {
    setLoading(true);

    try {
      if (!itemGroupId) {
        setUtensils([]);
        return;
      }

      const utensilTypes = await loadUtensilTypesByItemGroupWithInitialSync(itemGroupId);
      const utensilTypeIds = utensilTypes.map((type) => type.id).filter(Boolean);
      const matchedUtensils = await loadUtensilsByTypeIdsWithInitialSync(utensilTypeIds);
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      await loadUtensilMovementSummaryWithInitialSync(context);
      const movementRows = await getUtensilMovementRows(context);
      const normalizedItemId = itemId != null ? String(itemId) : null;
      const normalizedDespatchItemId =
        itemDespatchItemId != null ? String(itemDespatchItemId) : normalizedItemId;
      const countsByUtensilId = {};

      movementRows.forEach((row) => {
        const rowUtensilId = row?.utensilId != null ? String(row.utensilId) : null;
        const rowItemId = row?.itemId != null ? String(row.itemId) : null;
        const rowDespatchItemId =
          row?.despatchItemId != null ? String(row.despatchItemId) : rowItemId;

        if (!rowUtensilId) {
          return;
        }

        if (
          rowItemId !== normalizedItemId &&
          rowDespatchItemId !== normalizedDespatchItemId &&
          rowDespatchItemId !== normalizedItemId
        ) {
          return;
        }

        countsByUtensilId[rowUtensilId] =
          (countsByUtensilId[rowUtensilId] ?? 0) + (Number(row?.despatchedQuantity ?? 0) || 0);
      });

      const totalDespatched = Object.values(countsByUtensilId).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      );

      setUtensils(matchedUtensils);
      setCountsByUtensilId(countsByUtensilId);
      setDispatchedTotal(totalDespatched);
    } catch (error) {
      console.log('Load utensils for item error:', error);
      setUtensils([]);
      setCountsByUtensilId({});
      setDispatchedTotal(0);
    } finally {
      setLoading(false);
    }
  }, [customerId, itemGroupId, selectedDate, sessionId, tripNo, recipeId]);

  useEffect(() => {
    loadUtensils();
  }, [loadUtensils]);

  const getUtensilColor = (index) => {
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

  const updateCount = useCallback(
    async (utensilId, delta) => {
      const currentCount = Number(countsByUtensilId[utensilId] ?? 0);
      const nextCount = Math.max(0, currentCount + delta);
      const nextCounts = { ...countsByUtensilId };

      if (nextCount === 0) {
        delete nextCounts[utensilId];
      } else {
        nextCounts[utensilId] = nextCount;
      }

      const nextTotal = Object.values(nextCounts).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      );

      setCountsByUtensilId(nextCounts);
      setDispatchedTotal(nextTotal);

      try {
        const context = {
          orderDate: selectedDate,
          sessionId,
          customerId,
          tripNo,
        };
        await setUtensilMovementQuantity(context, utensilId, nextCount, {
          itemId,
          despatchItemId: itemDespatchItemId,
        });
      } catch (error) {
        console.log('Save utensil movement quantity error:', error);
      }
    },
    [countsByUtensilId, customerId, itemDespatchItemId, itemId, selectedDate, sessionId, tripNo]
  );

  const renderUtensilItem = ({ item, index }) => {
    const count = Number(countsByUtensilId[item.id] ?? 0);
    const colors = getUtensilColor(index);

    return (
      <View style={[styles.rowItem, { backgroundColor: colors.background }]}>
        <View style={styles.rowItemGlow} />
        <View style={styles.rowContent}>
          <View style={[styles.utensilIconWrap, { backgroundColor: colors.icon }]}>
            <Ionicons name="basket" size={20} color="#fff" />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            {!!item.utensilTypeName && <Text style={styles.rowSubtitle}>{item.utensilTypeName}</Text>}
          </View>

          <View style={styles.counterWrap}>
            <Pressable style={styles.counterButton} onPress={() => updateCount(item.id, -1)}>
              <Text style={styles.counterButtonText}>-</Text>
            </Pressable>
            <View style={[styles.counterValueWrap, count > 0 && styles.counterValueWrapActive]}>
              <Text style={[styles.counterValue, count > 0 && styles.counterValueActive]}>
                {count}
              </Text>
            </View>
            <Pressable style={styles.counterButton} onPress={() => updateCount(item.id, 1)}>
              <Text style={styles.counterButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
                source={require('../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{itemName}</Text>
              <Text style={styles.title}>Utensils</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="basket-outline" size={14} color="#0f766e" />
            <Text style={styles.heroBadgeText}>{dispatchedTotal}</Text>
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
          data={utensils}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderUtensilItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No utensils available.</Text>}
        />
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
    bottom: 100,
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
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 16,
    gap: 8,
  },
  rowItem: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  rowItemGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  utensilIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  counterButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  counterButtonText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
  },
  counterValueWrap: {
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValueWrapActive: {
    backgroundColor: '#3b82f6',
  },
  counterValue: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  counterValueActive: {
    color: '#fff',
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
});
