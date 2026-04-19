import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { getSessionCustomerItems } from '../utils/customers';
import { formatIsoDateForDisplay } from '../utils/date';
import {
  approveDespatchedUtensilMovements,
  getUtensilMovementRows,
  loadUtensilMovementSummaryWithInitialSync,
  refreshUtensilMovementsFromApi,
  submitCreatedUtensilMovements,
  utensilMovementSyncStatus,
} from '../utils/utensilMovements';
import { getUtensilsByIds } from '../utils/utensils';

export default function DespatchedUtensilsScreen({ route, navigation }) {
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
      
      // Filter rows based on mode
      if (isApproverMode) {
        // In approver mode, only show Submitted items (SERVER_UNCHANGED status)
        movementRows = movementRows.filter(
          (row) => row?.syncStatus === utensilMovementSyncStatus.SERVER_UNCHANGED
        );
      }
      
      // Filter rows: keep only valid ones
      const validRows = movementRows.filter((row) => {
        const utensilId = row?.utensilId != null ? String(row.utensilId) : null;
        const despatchedQuantity = Number(row?.despatchedQuantity ?? 0) || 0;
        const isChanged = row?.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;

        if (!utensilId) {
          return false;
        }

        // Skip rows with 0 quantity unless they are Changed items
        if (despatchedQuantity <= 0 && !isChanged) {
          return false;
        }

        return true;
      });

      if (validRows.length === 0) {
        setRows([]);
        setTotal(0);
        return;
      }

      // Get all utensil IDs from valid rows
      const utensilIds = validRows.map((row) => String(row.utensilId));
      const utensils = await getUtensilsByIds(utensilIds);
      const utensilMap = {};
      utensils.forEach((u) => {
        utensilMap[u.id] = u;
      });

      // Get session customer items to fetch recipe names
      const sessionItems = await getSessionCustomerItems({
        orderDate: selectedDate,
        sessionId,
        customerId,
      });
      
      // Build recipe map from recipeId to recipeName
      const recipeMap = {};
      sessionItems.forEach((item) => {
        if (item.recipeId && item.recipeName) {
          recipeMap[item.recipeId] = item.recipeName;
        }
      });

      // Map each movement row to a display item (no grouping)
      const resolved = validRows.map((row, index) => {
        const utensilId = String(row.utensilId);
        const recipeId = row?.recipeId;
        return {
          id: row?.id != null ? String(row.id) : `${utensilId}-${index}`,
          originalId: row?.id != null ? String(row.id) : null,
          itemId: row?.itemId != null ? String(row.itemId) : null,
          despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
          utensilId,
          name: utensilMap[utensilId]?.name ?? `Utensil ${utensilId}`,
          utensilTypeName: utensilMap[utensilId]?.utensilTypeName ?? null,
          recipeName: recipeId ? recipeMap[recipeId] || recipeId : null,
          count: Number(row?.despatchedQuantity ?? 0),
          syncStatus: row?.syncStatus ?? utensilMovementSyncStatus.SERVER_UNCHANGED,
          despatchApproved: Boolean(row?.despatchApproved),
        };
      });

      resolved.sort((a, b) => {
        // Sort by recipe name first, then by utensil name
        const recipeCompare = (a.recipeName || '').localeCompare(b.recipeName || '');
        if (recipeCompare !== 0) return recipeCompare;
        return a.name.localeCompare(b.name);
      });

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
      const result = await submitCreatedUtensilMovements(context);

      if (result.submittedCount === 0) {
        Alert.alert('Submit', 'No utensil movements to submit.');
        return;
      }

      await refreshUtensilMovementsFromApi(context);
      await loadData();
      const messages = [];
      if (result.createdCount > 0) messages.push(`${result.createdCount} created`);
      if (result.changedCount > 0) messages.push(`${result.changedCount} updated`);
      Alert.alert('Submit', `${messages.join(' and ')} utensil movement(s) submitted successfully.`, [
        {
          text: 'OK',
          onPress: () => {
            AsyncStorage.setItem('justSubmitted', 'true');
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      console.log('Submit despatched utensils error:', error);
      Alert.alert(
        'Submit Failed',
        error?.message || 'Unable to submit utensil movements. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [customerId, loadData, selectedDate, sessionId, tripNo]);

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
      const selectedMovements = rows
        .filter((row) => selectedForApproval.has(row.id))
        .map((row) => ({
          id: row.id,
          utensilId: row.utensilId,
          itemId: row.itemId,
          despatchItemId: row.despatchItemId,
        }));
      const result = await approveDespatchedUtensilMovements(context, selectedMovements);

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
      console.log('Approve despatched utensils error:', error);
      Alert.alert(
        'Approve Failed',
        error?.message || 'Unable to approve utensil movements. Please try again.'
      );
      setApproving(false);
    }
  }, [customerId, loadData, navigation, selectedDate, sessionId, tripNo, selectedForApproval]);

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

  const renderItem = ({ item, index }) => {
    const isLocalOnly = item.syncStatus === utensilMovementSyncStatus.LOCAL_ONLY;
    const isChanged = item.syncStatus === utensilMovementSyncStatus.SERVER_MODIFIED;
    const isApproved = item.despatchApproved;
    const shouldShowCheckbox = isApproverMode && (!isApproved || isChanged);
    const isSelected = selectedForApproval.has(item.id);
    const statusLabel = isLocalOnly ? 'Created' : isChanged ? 'Changed' : isApproved ? 'Approved' : 'Submitted';
    const colors = getRowColor(index);

    return (
      <Pressable onPress={() => shouldShowCheckbox && toggleItemSelection(item.id)}>
        <View style={[styles.rowItem, { backgroundColor: colors.background }, isApproved ? styles.rowItemApproved : null]}>
          <View style={styles.rowItemGlow} />
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
              {!!item.recipeName && (
                <Text style={styles.rowRecipeName}>{item.recipeName}</Text>
              )}
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
            </View>
            <View style={styles.rowRight}>
              <View
                style={[
                  styles.countBadge,
                  isLocalOnly ? styles.countBadgeLocalOnly : null,
                  isChanged ? styles.countBadgeChanged : null,
                  isApproved ? styles.countBadgeApproved : null,
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    isLocalOnly ? styles.countTextLocalOnly : null,
                    isChanged ? styles.countTextChanged : null,
                    isApproved ? styles.countTextApproved : null,
                  ]}
                >
                  {item.count}
                </Text>
              </View>
            </View>
          </View>
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
                source={require('../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{title}</Text>
              <Text style={styles.title}>Despatched</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="cube-outline" size={14} color="#0f766e" />
            <Text style={styles.heroBadgeText}>{rows.length}</Text>
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
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {isApproverMode ? 'No submitted utensils to approve.' : 'No utensils despatched yet.'}
            </Text>
          }
        />
      )}

      {/* {!loading && rows.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalLabel}>
            {isApproverMode ? 'Total Approved' : 'Total Despatched'}
          </Text>
          <Text style={styles.totalValue}>
            {rows.reduce((sum, row) => sum + row.count, 0)}
          </Text>
        </View>
      )} */}

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
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 16,
    gap: 8,
  },
  rowItem: {
    width: '100%',
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
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
    alignItems: 'flex-start',
    gap: 12,
  },
  rowIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  rowRecipeName: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '500',
    marginTop: 4,
  },
  rowSubtitle: {
    fontSize: 13,
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
    minWidth: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
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
  statusBadgeApproved: {
    backgroundColor: '#bbf7d0',
  },
  statusBadgeTextApproved: {
    color: '#166534',
  },
  countBadgeApproved: {
    backgroundColor: '#bbf7d0',
  },
  countTextApproved: {
    color: '#166534',
  },
  rowItemApproved: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowApprovedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxWrap: {
    paddingRight: 8,
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
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
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#1d4ed8',
    borderRadius: 18,
    paddingVertical: 16,
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
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});
