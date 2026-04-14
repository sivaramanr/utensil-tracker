import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatIsoDateForDisplay } from '../utils/date';
import {
  getUtensilMovementRows,
  loadUtensilMovementSummaryWithInitialSync,
  utensilMovementSyncStatus,
} from '../utils/utensilMovements';
import { getUtensilsByIds } from '../utils/utensils';

export default function DespatchedUtensilsScreen({ route }) {
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const customerId = route?.params?.customerId;
  const sessionName = route?.params?.sessionName;
  const customerName = route?.params?.customerName;
  const tripNo = route?.params?.tripNo ?? 1;
  const subtitle = [formatIsoDateForDisplay(selectedDate), sessionName, customerName]
    .filter(Boolean)
    .join(' | ');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      await loadUtensilMovementSummaryWithInitialSync(context);
      const movementRows = await getUtensilMovementRows(context);
      const rowsByUtensilId = new Map();

      movementRows.forEach((row) => {
        const utensilId = row?.utensilId != null ? String(row.utensilId) : null;
        const despatchedQuantity = Number(row?.despatchedQuantity ?? 0) || 0;

        if (!utensilId || despatchedQuantity <= 0) {
          return;
        }

        const existingRow = rowsByUtensilId.get(utensilId);

        if (!existingRow) {
          rowsByUtensilId.set(utensilId, {
            id: utensilId,
            count: despatchedQuantity,
            syncStatus: row?.syncStatus ?? utensilMovementSyncStatus.SERVER_UNCHANGED,
          });
          return;
        }

        existingRow.count += despatchedQuantity;

        if (row?.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY) {
          existingRow.syncStatus = utensilMovementSyncStatus.LOCAL_ONLY;
        } else if (
          row?.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED &&
          existingRow.syncStatus !== utensilMovementSyncStatus.LOCAL_ONLY
        ) {
          existingRow.syncStatus = utensilMovementSyncStatus.SERVER_MODIFIED;
        }
      });

      const ids = Array.from(rowsByUtensilId.keys());

      if (ids.length === 0) {
        setRows([]);
        setTotal(0);
        return;
      }

      const utensils = await getUtensilsByIds(ids);
      const utensilMap = {};
      utensils.forEach((u) => {
        utensilMap[u.id] = u;
      });

      const resolved = ids.map((id) => {
        const aggregatedRow = rowsByUtensilId.get(id);

        return {
          id,
          name: utensilMap[id]?.name ?? `Utensil ${id}`,
          utensilTypeName: utensilMap[id]?.utensilTypeName ?? null,
          count: Number(aggregatedRow?.count ?? 0),
          syncStatus:
            aggregatedRow?.syncStatus ?? utensilMovementSyncStatus.SERVER_UNCHANGED,
        };
      });

      resolved.sort((a, b) => a.name.localeCompare(b.name));

      const grandTotal = resolved.reduce((sum, r) => sum + r.count, 0);
      setRows(resolved);
      setTotal(grandTotal);
    } catch (error) {
      console.log('Load despatched utensils error:', error);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [customerId, selectedDate, sessionId, tripNo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderItem = ({ item }) => {
    const isLocalOnly = item.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;
    const isChanged = item.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
    const statusLabel = isLocalOnly ? 'Created' : isChanged ? 'Changed' : 'Submitted';

    return (
      <View style={styles.rowItem}>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          {!!item.utensilTypeName && (
            <Text style={styles.rowSubtitle}>{item.utensilTypeName}</Text>
          )}
          <View
            style={[
              styles.statusBadge,
              isLocalOnly ? styles.statusBadgeLocalOnly : null,
              isChanged ? styles.statusBadgeChanged : null,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isLocalOnly ? styles.statusBadgeTextLocalOnly : null,
                isChanged ? styles.statusBadgeTextChanged : null,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <View
            style={[
              styles.countBadge,
              isLocalOnly ? styles.countBadgeLocalOnly : null,
              isChanged ? styles.countBadgeChanged : null,
            ]}
          >
            <Text
              style={[
                styles.countText,
                isLocalOnly ? styles.countTextLocalOnly : null,
                isChanged ? styles.countTextChanged : null,
              ]}
            >
              {item.count}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No utensils despatched yet.</Text>
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalLabel}>Total Despatched</Text>
          <Text style={styles.totalValue}>{total}</Text>
        </View>
      )}

      {!loading && (
        <Pressable style={styles.submitButton} onPress={() => console.log('Submit despatched utensils')}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </Pressable>
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
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 16,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  rowTextWrap: {
    width: '80%',
    marginRight: 12,
  },
  rowRight: {
    width: '20%',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
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
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countBadgeLocalOnly: {
    backgroundColor: '#dcfce7',
  },
  countBadgeChanged: {
    backgroundColor: '#fef3c7',
  },
  countText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  countTextLocalOnly: {
    color: '#166534',
  },
  countTextChanged: {
    color: '#92400e',
  },
  statusBadgeLocalOnly: {
    backgroundColor: '#bbf7d0',
  },
  statusBadgeChanged: {
    backgroundColor: '#fde68a',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  statusBadgeTextLocalOnly: {
    color: '#166534',
  },
  statusBadgeTextChanged: {
    color: '#92400e',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  totalBar: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
