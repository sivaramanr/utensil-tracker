import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatIsoDateForDisplay } from '../utils/date';
import {
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
  const tripNo = route?.params?.tripNo ?? 1;
  const subtitle = [formatIsoDateForDisplay(selectedDate), sessionName, customerName]
    .filter(Boolean)
    .join(' | ');
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
      const summary = await loadUtensilMovementSummaryWithInitialSync(context);
      setUtensils(matchedUtensils);
      setCountsByUtensilId(summary.countsByUtensilId);
      setDispatchedTotal(summary.dispatchedTotal);
    } catch (error) {
      console.log('Load utensils for item error:', error);
      setUtensils([]);
      setCountsByUtensilId({});
      setDispatchedTotal(0);
    } finally {
      setLoading(false);
    }
  }, [customerId, itemGroupId, selectedDate, sessionId, tripNo]);

  useEffect(() => {
    loadUtensils();
  }, [loadUtensils]);

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

  const renderUtensilItem = ({ item }) => {
    const count = Number(countsByUtensilId[item.id] ?? 0);

    return (
      <View style={styles.rowItem}>
        <View style={styles.rowContent}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            {!!item.utensilTypeName && <Text style={styles.rowSubtitle}>{item.utensilTypeName}</Text>}
          </View>

          <View style={styles.counterWrap}>
            <Pressable style={styles.counterButton} onPress={() => updateCount(item.id, -1)}>
              <Text style={styles.counterButtonText}>-</Text>
            </Pressable>
            <Text style={styles.counterValue}>{count}</Text>
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
      <Text style={styles.title}>{itemName}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

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
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 16,
  },
  rowItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
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
  },
  counterButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
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
  counterValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
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
