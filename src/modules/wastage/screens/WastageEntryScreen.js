import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { getSessionCustomerItems } from '../../../platform/services/sessionData';
import { getWastageEntries, setWastedQuantity, submitWastageEntries } from '../services/wastage';

const THEME = '#d97706';

const STATUS_LABELS = {
  LOCAL_ONLY: { label: 'Created', color: '#166534', bg: '#dcfce7' },
  CHANGED:    { label: 'Changed', color: '#1e40af', bg: '#dbeafe' },
  SUBMITTED:  { label: 'Submitted', color: '#d97706', bg: '#fef3c7' },
  APPROVED:   { label: 'Approved', color: '#059669', bg: '#d1fae5' },
};

export default function WastageEntryScreen({ navigation, route }) {
  const { customerId, customerCode, customerName, selectedDate, sessionId, sessionName } = route.params ?? {};
  const [items, setItems] = useState([]);
  const [wastageMap, setWastageMap] = useState({});
  const [reasonMap, setReasonMap] = useState({});
  const [statusMap, setStatusMap] = useState({});
  const [savedWastageMap, setSavedWastageMap] = useState({});
  const [savedReasonMap, setSavedReasonMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [menuItems, savedEntries] = await Promise.all([
        getSessionCustomerItems({ orderDate: selectedDate, sessionId, customerId }),
        getWastageEntries({ orderDate: selectedDate, sessionId, customerId }),
      ]);
      setItems(menuItems);
      const qty = {};
      const reasons = {};
      const statuses = {};
      for (const entry of savedEntries) {
        qty[entry.itemId] = entry.wastedQuantity;
        reasons[entry.itemId] = entry.reason ?? '';
        statuses[entry.itemId] = entry.syncStatus;
      }
      setWastageMap(qty);
      setReasonMap(reasons);
      setStatusMap(statuses);
      setSavedWastageMap({ ...qty });
      setSavedReasonMap({ ...reasons });
    } catch (error) {
      console.error('WastageEntry load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, sessionId, customerId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => { load(true); }, [load]);

  const adjustQty = (itemId, delta) => {
    setWastageMap((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Number((prev[itemId] ?? 0) + delta)),
    }));
  };

  const handleSave = async (silent = false) => {
    setSaving(true);
    try {
      for (const item of items) {
        const qty = wastageMap[item.id] ?? 0;
        if (qty > 0 || wastageMap[item.id] !== undefined) {
          await setWastedQuantity({
            orderDate: selectedDate,
            sessionId,
            customerId,
            itemId: item.id,
            menuPlanItemId: item.despatchItemId,
            itemName: item.name,
            quantity: qty,
            reason: reasonMap[item.id] ?? null,
          });
        }
      }
      // Mirror what the DB did: flip SUBMITTED → CHANGED if values differ, keep LOCAL_ONLY otherwise
      setStatusMap((prev) => {
        const next = { ...prev };
        for (const item of items) {
          const qty = wastageMap[item.id] ?? 0;
          if (qty > 0 || wastageMap[item.id] !== undefined) {
            const prevStatus = prev[item.id];
            if (prevStatus === 'SUBMITTED' || prevStatus === 'APPROVED') {
              const qtyDiff = qty !== (savedWastageMap[item.id] ?? 0);
              const reasonDiff = (reasonMap[item.id] ?? '') !== (savedReasonMap[item.id] ?? '');
              if (qtyDiff || reasonDiff) next[item.id] = 'CHANGED';
            } else if (!prevStatus) {
              next[item.id] = 'LOCAL_ONLY';
            }
          }
        }
        return next;
      });
      setSavedWastageMap((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (wastageMap[item.id] !== undefined) next[item.id] = wastageMap[item.id] ?? 0;
        }
        return next;
      });
      setSavedReasonMap((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (wastageMap[item.id] !== undefined) next[item.id] = reasonMap[item.id] ?? '';
        }
        return next;
      });
      if (!silent) Alert.alert('Saved', 'Wastage entries saved locally.');
    } catch (error) {
      console.error('Save wastage error:', error);
      Alert.alert('Error', 'Could not save entries. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const hasEligible = items.some((item) => {
      const dbStatus = statusMap[item.id];
      if (!dbStatus && (wastageMap[item.id] ?? 0) > 0) return true;
      if (dbStatus === 'LOCAL_ONLY' || dbStatus === 'CHANGED') return true;
      if (dbStatus === 'SUBMITTED') {
        const qtyDiff = (wastageMap[item.id] ?? 0) !== (savedWastageMap[item.id] ?? 0);
        const reasonDiff = (reasonMap[item.id] ?? '') !== (savedReasonMap[item.id] ?? '');
        return qtyDiff || reasonDiff;
      }
      return false;
    });
    if (!hasEligible) {
      Alert.alert('Nothing to Submit', 'There are no new or changed entries to submit.');
      return;
    }
    Alert.alert('Submit for Approval', 'Submit all Created and Changed wastage entries for approval?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        onPress: async () => {
          setSaving(true);
          try {
            await handleSave(true);
            await submitWastageEntries({ orderDate: selectedDate, sessionId, customerId });
            Alert.alert('Submitted', 'Wastage entries submitted for approval.', [
              { text: 'OK', onPress: () => load() },
            ]);
          } catch (error) {
            console.error('Submit wastage error:', error);
            Alert.alert('Error', 'Could not submit. Please try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const qty = wastageMap[item.id] ?? 0;
    const dbStatus = statusMap[item.id];
    let effectiveStatus = dbStatus;
    if (dbStatus === 'SUBMITTED') {
      const qtyDiff = qty !== (savedWastageMap[item.id] ?? 0);
      const reasonDiff = (reasonMap[item.id] ?? '') !== (savedReasonMap[item.id] ?? '');
      if (qtyDiff || reasonDiff) effectiveStatus = 'CHANGED';
    }
    const statusStyle = effectiveStatus ? STATUS_LABELS[effectiveStatus] : null;
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
            {!!item.groupName && <Text style={styles.itemGroup}>{item.groupName}</Text>}
          </View>
          <View style={styles.itemHeaderRight}>
            <Text style={styles.itemQtyLabel}>Ordered: {item.quantity} {item.uomName}</Text>
            {!!statusStyle && (
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.wasteRow}>
          <Text style={styles.wasteLabel}>Wasted:</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => adjustQty(item.id, -1)} hitSlop={8}>
              <Ionicons name="remove" size={18} color={qty > 0 ? THEME : '#9ca3af'} />
            </Pressable>
            <Text style={styles.stepValue}>{qty}</Text>
            <Pressable style={styles.stepBtn} onPress={() => adjustQty(item.id, 1)} hitSlop={8}>
              <Ionicons name="add" size={18} color={THEME} />
            </Pressable>
          </View>
        </View>
        {qty > 0 && (
          <TextInput
            style={styles.reasonInput}
            placeholder="Reason (optional)"
            placeholderTextColor="#9ca3af"
            value={reasonMap[item.id] ?? ''}
            onChangeText={(text) => setReasonMap((prev) => ({ ...prev, [item.id]: text }))}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBlobTop} />
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
              <Text style={styles.heroEyebrow}>{customerName || customerCode || 'Customer'}</Text>
              <Text style={styles.title}>Wastage Entry</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <View style={[styles.heroBadge, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="analytics-outline" size={14} color={THEME} />
              <Text style={[styles.heroBadgeText, { color: THEME }]}>{items.length}</Text>
            </View>
            <Pressable
              style={styles.heroActionBtn}
              onPress={() => navigation.navigate('WastageApproval')}
              hitSlop={10}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#374151" />
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {formatIsoDateForDisplay(selectedDate, 'No date')} {sessionName ? `· ${sessionName}` : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={<Text style={styles.emptyText}>No menu items available for this session.</Text>}
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.footerBtnText}>Save</Text>
        </Pressable>
        <Pressable style={[styles.submitBtn, { backgroundColor: THEME }]} onPress={handleSubmit} disabled={saving}>
          <Ionicons name="send-outline" size={18} color="#fff" />
          <Text style={styles.footerBtnText}>Submit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb', paddingTop: 34 },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#f59e0b', opacity: 0.12,
  },
  heroCard: {
    backgroundColor: '#fffef5', borderRadius: 28, padding: 20, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.12)',
    shadowColor: '#92400e', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
  },
  heroBrandWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  heroLogoCard: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroLogo: { width: 32, height: 32 },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#92400e', marginBottom: 2,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999,
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 12 },
  itemCard: {
    backgroundColor: '#fffef5', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.10)',
  },
  itemHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  itemInfo: { flex: 1, marginRight: 8 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  itemGroup: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  itemHeaderRight: { alignItems: 'flex-end', gap: 6 },
  itemQtyLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroActionBtn: {
    width: 38, height: 38, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  wasteRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  wasteLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.2)',
  },
  stepValue: { fontSize: 18, fontWeight: '800', color: '#0f172a', minWidth: 28, textAlign: 'center' },
  reasonInput: {
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.25)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: '#374151', backgroundColor: '#fff',
  },
  emptyText: { marginTop: 32, textAlign: 'center', color: '#6b7280' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1, borderTopColor: 'rgba(217, 119, 6, 0.12)',
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: '#6b7280',
  },
  submitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
  },
  footerBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
