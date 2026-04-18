import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { formatIsoDateForDisplay } from '../utils/date';
import {
    approveReturnedUtensilMovements,
    getUtensilMovementRows,
    loadUtensilMovementSummaryWithInitialSync,
    refreshUtensilMovementsFromApi,
    submitReturnedUtensilMovements,
    updateReturnedQuantity,
    utensilMovementSyncStatus,
} from '../utils/utensilMovements';
import { getUtensilsByIds } from '../utils/utensils';

export default function ReturnedUtensilsScreen({ route, navigation }) {
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const customerId = route?.params?.customerId;
  const sessionName = route?.params?.sessionName;
  const customerCode = route?.params?.customerCode;
  const customerName = route?.params?.customerName;
  const tripNo = route?.params?.tripNo ?? 1;
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

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isApproverMode, setIsApproverMode] = useState(false);
  const [selectedForApproval, setSelectedForApproval] = useState(new Set());
  const [quantities, setQuantities] = useState({});
  const [utensilItemMapping, setUtensilItemMapping] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setSelectedForApproval(new Set());

    try {
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      await loadUtensilMovementSummaryWithInitialSync(context);
      let movementRows = await getUtensilMovementRows(context);

      // Filter rows based on mode for approval - only show items with returnedQuantity that haven't been changed
      if (isApproverMode) {
        movementRows = movementRows.filter(
          (row) =>
            Number(row?.returnedQuantity ?? 0) > 0 &&
            row?.syncStatus === utensilMovementSyncStatus.SERVER_UNCHANGED &&
            !Boolean(row?.returnApproved)
        );
      }

      const rowsByUtensilId = new Map();
      const quantitiesMap = {};
      const itemMappingMap = {};

      movementRows.forEach((row) => {
        const utensilId = row?.utensilId != null ? String(row.utensilId) : null;
        const itemId = row?.itemId != null ? String(row.itemId) : null;
        const returnedQuantity = Number(row?.returnedQuantity ?? 0) || 0;
        const despatchedQuantity = Number(row?.despatchedQuantity ?? 0) || 0;
        const isChanged = row?.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
        const isLocalOnly = row?.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;

        if (!utensilId) {
          return;
        }

        // Skip rows with no despatched quantity unless they are Created items
        if (despatchedQuantity <= 0 && !isLocalOnly) {
          return;
        }

        quantitiesMap[utensilId] = returnedQuantity;
        if (!itemMappingMap[utensilId]) {
          // Use itemId if available, otherwise fall back to despatchItemId
          const itemIdToUse = itemId || row?.despatchItemId;
          if (itemIdToUse) {
            itemMappingMap[utensilId] = String(itemIdToUse);
          }
        }

        const existingRow = rowsByUtensilId.get(utensilId);

        if (!existingRow) {
          rowsByUtensilId.set(utensilId, {
            id: utensilId,
            returnedCount: returnedQuantity,
            despatchedCount: despatchedQuantity,
            syncStatus: row?.syncStatus ?? utensilMovementSyncStatus.SERVER_UNCHANGED,
            returnApproved: Boolean(row?.returnApproved),
          });
          return;
        }

        existingRow.returnedCount += returnedQuantity;
        existingRow.despatchedCount += despatchedQuantity;

        if (isLocalOnly) {
          existingRow.syncStatus = utensilMovementSyncStatus.LOCAL_ONLY;
        } else if (
          isChanged &&
          existingRow.syncStatus !== utensilMovementSyncStatus.LOCAL_ONLY
        ) {
          existingRow.syncStatus = utensilMovementSyncStatus.SERVER_MODIFIED;
        }

        // If any row is approved, mark the aggregated row as approved
        if (row?.returnApproved) {
          existingRow.returnApproved = true;
        }
      });

      const ids = Array.from(rowsByUtensilId.keys());

      if (ids.length === 0) {
        setRows([]);
        setTotal(0);
        setQuantities({});
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
          returnedCount: Number(aggregatedRow?.returnedCount ?? 0),
          despatchedCount: Number(aggregatedRow?.despatchedCount ?? 0),
          syncStatus:
            aggregatedRow?.syncStatus ?? utensilMovementSyncStatus.SERVER_UNCHANGED,
          returnApproved: Boolean(aggregatedRow?.returnApproved),
        };
      });

      resolved.sort((a, b) => a.name.localeCompare(b.name));

      const grandTotal = resolved.reduce((sum, r) => sum + r.returnedCount, 0);
      console.log('[ReturnedUtensilsScreen] loadData completed:', { 
        rowCount: resolved.length,
        grandTotal,
        itemMappingMap 
      });
      
      setRows(resolved);
      setTotal(grandTotal);
      setQuantities(quantitiesMap);
      setUtensilItemMapping(itemMappingMap);
    } catch (error) {
      console.log('Load returned utensils error:', error);
      setRows([]);
      setTotal(0);
      setQuantities({});
      setUtensilItemMapping({});
    } finally {
      setLoading(false);
    }
  }, [customerId, isApproverMode, selectedDate, sessionId, tripNo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedForApproval(new Set());
  }, [isApproverMode]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);

    try {
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      const result = await submitReturnedUtensilMovements(context);

      if (result.createdCount === 0 && result.changedCount === 0) {
        Alert.alert('Submit', 'No utensil movements to submit.');
        setSubmitting(false);
        return;
      }

      await refreshUtensilMovementsFromApi(context);
      await loadData();
      const messages = [];
      if (result.createdCount > 0) messages.push(`${result.createdCount} created`);
      if (result.changedCount > 0) messages.push(`${result.changedCount} updated`);
      Alert.alert('Submit', `${messages.join(' and ')} returned utensil movement(s) submitted successfully.`, [
        {
          text: 'OK',
          onPress: () => {
            AsyncStorage.setItem('justSubmitted', 'true');
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      console.log('Submit returned utensils error:', error);
      Alert.alert(
        'Submit Failed',
        error?.message || 'Unable to submit utensil movements. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [customerId, loadData, navigation, selectedDate, sessionId, tripNo]);

  const handleApprove = useCallback(async () => {
    if (selectedForApproval.size === 0) {
      Alert.alert('No Selection', 'Please select at least one item to approve.');
      return;
    }

    setApproving(true);

    try {
      const context = {
        orderDate: selectedDate,
        sessionId,
        customerId,
        tripNo,
      };
      const selectedUtensilIds = Array.from(selectedForApproval);
      const result = await approveReturnedUtensilMovements(context, selectedUtensilIds);

      if (result.approvedCount === 0) {
        Alert.alert('Approve', 'No utensil movements to approve.');
        setApproving(false);
        return;
      }

      await refreshUtensilMovementsFromApi(context);
      await loadData();
      setSelectedForApproval(new Set());
      Alert.alert('Approve', `${result.approvedCount} utensil movement(s) approved successfully.`, [
        {
          text: 'OK',
          onPress: () => {
            setApproving(false);
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      console.log('Approve returned utensils error:', error);
      Alert.alert(
        'Approve Failed',
        error?.message || 'Unable to approve utensil movements. Please try again.'
      );
      setApproving(false);
    }
  }, [customerId, loadData, navigation, selectedDate, sessionId, tripNo, selectedForApproval]);

  const toggleItemSelection = useCallback((itemId) => {
    setSelectedForApproval((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const updateQuantity = useCallback(
    async (utensilId, newQuantity) => {
      if (newQuantity < 0) return;

      console.log('[ReturnedUtensilsScreen] updateQuantity called:', { utensilId, newQuantity });
      console.log('[ReturnedUtensilsScreen] utensilItemMapping:', utensilItemMapping);

      setQuantities((prev) => ({
        ...prev,
        [utensilId]: newQuantity,
      }));

      // Save to database
      try {
        const context = {
          orderDate: selectedDate,
          sessionId,
          customerId,
          tripNo,
        };
        const itemId = utensilItemMapping[utensilId];
        console.log('[ReturnedUtensilsScreen] Resolved itemId:', itemId);
        
        if (itemId) {
          console.log('[ReturnedUtensilsScreen] Calling updateReturnedQuantity');
          await updateReturnedQuantity(context, utensilId, itemId, newQuantity);
        } else {
          console.log('[ReturnedUtensilsScreen] WARNING: itemId not found in mapping for utensilId:', utensilId);
        }
      } catch (error) {
        console.log('Update returned quantity error:', error);
      }
    },
    [customerId, selectedDate, sessionId, tripNo, utensilItemMapping]
  );

  const getRowColor = (index) => {
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
    const isLocalOnly = item.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;
    const isChanged = item.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
    const isApproved = item.returnApproved;
    const shouldShowCheckbox = isApproverMode && (!isApproved || isChanged);
    const isSelected = selectedForApproval.has(item.id);
    const returnedQty = quantities[item.id] ?? item.returnedCount;
    const statusLabel = isLocalOnly ? 'Created' : isChanged ? 'Changed' : isApproved ? 'Approved' : 'Submitted';
    const colors = getRowColor(index);

    return (
      <Pressable onPress={() => shouldShowCheckbox && toggleItemSelection(item.id)}>
        <View style={[styles.rowItem, { backgroundColor: colors.background }, isApproved ? styles.rowItemApproved : null]}>
          <View style={styles.rowContent}>
            {shouldShowCheckbox && (
              <View style={styles.checkboxWrap}>
                <View style={[styles.checkbox, isSelected ? styles.checkboxChecked : null]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </View>
            )}
            <View style={[styles.rowIconWrap, { backgroundColor: colors.icon }]}>
              <Ionicons name="basket" size={20} color="#fff" />
            </View>
            <View style={styles.rowTextWrap}>
              <View style={styles.rowTitleWrap}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                {isApproved && (
                  <View style={styles.rowApprovedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  </View>
                )}
              </View>
              {!!item.utensilTypeName && (
                <Text style={styles.rowSubtitle}>{item.utensilTypeName}</Text>
              )}
              <View
                style={[
                  styles.statusBadge,
                  isLocalOnly ? styles.statusBadgeLocalOnly : null,
                  isChanged ? styles.statusBadgeChanged : null,
                  isApproved ? styles.statusBadgeApproved : null,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isLocalOnly ? styles.statusBadgeTextLocalOnly : null,
                    isChanged ? styles.statusBadgeTextChanged : null,
                    isApproved ? styles.statusBadgeTextApproved : null,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
              <Text style={styles.despatchedLabel}>
                Despatched: {item.despatchedCount}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <View style={styles.quantityControl}>
                <Pressable
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, returnedQty - 1)}
                  disabled={isApproverMode}
                >
                  <Ionicons name="remove" size={18} color={isApproverMode ? '#d1d5db' : '#1d4ed8'} />
                </Pressable>
                <Text style={styles.quantityValue}>{returnedQty}</Text>
                <Pressable
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, returnedQty + 1)}
                  disabled={isApproverMode || returnedQty >= item.despatchedCount}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={
                      isApproverMode || returnedQty >= item.despatchedCount
                        ? '#d1d5db'
                        : '#1d4ed8'
                    }
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

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
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {isApproverMode ? 'No returned utensils to approve.' : 'No utensils returned yet.'}
            </Text>
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalLabel}>
            {isApproverMode ? 'Total Approved' : 'Total Returned'}
          </Text>
          <Text style={styles.totalValue}>
            {rows.reduce((sum, row) => sum + (quantities[row.id] ?? row.returnedCount), 0)}
          </Text>
        </View>
      )}

      {!loading && (
        <View style={styles.modeContainer}>
          <Text style={styles.modeLabel}>Submitter</Text>
          <Switch
            value={isApproverMode}
            onValueChange={setIsApproverMode}
            trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
            thumbColor={isApproverMode ? '#1d4ed8' : '#f3f4f6'}
          />
          <Text style={styles.modeLabel}>Approver</Text>
        </View>
      )}

      {!loading && (
        <Pressable
          style={[
            styles.submitButton,
            isApproverMode && selectedForApproval.size === 0 ? styles.submitButtonDisabled : null,
          ]}
          onPress={isApproverMode ? handleApprove : handleSubmit}
          disabled={isApproverMode ? approving || selectedForApproval.size === 0 : submitting}
        >
          <Text
            style={[
              styles.submitButtonText,
              isApproverMode && selectedForApproval.size === 0 ? styles.submitButtonTextDisabled : null,
            ]}
          >
            {isApproverMode
              ? approving
                ? 'Approving...'
                : selectedForApproval.size === 0
                ? 'Select items to approve'
                : `Approve (${selectedForApproval.size})`
              : submitting
              ? 'Submitting...'
              : 'Submit'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 4,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  rowItem: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  checkboxWrap: {
    paddingRight: 8,
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  despatchedLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  rowApprovedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeLocalOnly: {
    backgroundColor: '#bbf7d0',
  },
  statusBadgeChanged: {
    backgroundColor: '#fde68a',
  },
  statusBadgeApproved: {
    backgroundColor: '#bbf7d0',
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
  statusBadgeTextApproved: {
    color: '#166534',
  },
  rowRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  quantityButton: {
    padding: 4,
  },
  quantityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    minWidth: 30,
    textAlign: 'center',
  },
  rowItemApproved: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 32,
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
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  submitButtonTextDisabled: {
    color: '#d1d5db',
  },
  modeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});
