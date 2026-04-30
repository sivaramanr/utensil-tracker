import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { getSessionCustomerItems } from '../../../platform/services/sessionData';
import { getDespatchItems } from '../../despatch/services/despatch';
import { getWastageEntries, setWastedQuantity, submitWastageEntries } from '../services/wastage';

const THEME = '#d97706';

const STATUS_LABELS = {
  LOCAL_ONLY: { label: 'Created',   color: '#166534', bg: '#dcfce7' },
  CHANGED:    { label: 'Changed',   color: '#1e40af', bg: '#dbeafe' },
  SUBMITTED:  { label: 'Submitted', color: '#d97706', bg: '#fef3c7' },
  APPROVED:   { label: 'Approved',  color: '#059669', bg: '#d1fae5' },
};

function formatQty(value) {
  const n = parseFloat(Number(value ?? 0).toFixed(2));
  return String(n);
}

export default function WastageEntryScreen({ navigation, route }) {
  const { customerId, customerCode, customerName, selectedDate, sessionId, sessionName } = route.params ?? {};
  const insets = useSafeAreaInsets();
  const dialogInputRef  = useRef(null);
  const hasLoadedRef    = useRef(false);

  const [items, setItems] = useState([]);
  const [wastageMap, setWastageMap] = useState({});
  const [reasonMap, setReasonMap] = useState({});
  const [statusMap, setStatusMap] = useState({});
  const [savedWastageMap, setSavedWastageMap] = useState({});
  const [savedReasonMap, setSavedReasonMap] = useState({});
  const [despatchMap, setDespatchMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [editingItem, setEditingItem] = useState(null);
  const [dialogText, setDialogText] = useState('');

  // isPullRefresh → show pull-refresh indicator
  // forceSync     → skip cache, hit API (used on pull-refresh, after submit/approve)
  const load = useCallback(async (isPullRefresh = false, forceSync = false) => {
    if (isPullRefresh) setRefreshing(true);
    else if (!hasLoadedRef.current || forceSync) setLoading(true);
    try {
      const [menuItems, savedEntries, despatchEntries] = await Promise.all([
        getSessionCustomerItems({ orderDate: selectedDate, sessionId, customerId }),
        getWastageEntries({ orderDate: selectedDate, sessionId, customerId, forceRefresh: forceSync }),
        getDespatchItems({ despatchDate: selectedDate, sessionId, customerId, tripNo: 1, forceRefresh: forceSync }).catch(() => []),
      ]);
      setItems(menuItems);
      const qty = {};
      const reasons = {};
      const statuses = {};
      for (const entry of savedEntries) {
        qty[entry.itemId]      = entry.wastedQuantity;
        reasons[entry.itemId]  = entry.reason ?? '';
        statuses[entry.itemId] = entry.syncStatus;
      }
      setWastageMap(qty);
      setReasonMap(reasons);
      setStatusMap(statuses);
      setSavedWastageMap({ ...qty });
      setSavedReasonMap({ ...reasons });
      const dmap = {};
      for (const entry of despatchEntries) {
        dmap[String(entry.itemId)] = Number(entry.despatched ?? 0);
      }
      setDespatchMap(dmap);
    } catch (error) {
      console.error('WastageEntry load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, sessionId, customerId]);

  // First visit: full loader + API. Return from another screen: silent cache read.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      const isFirstVisit = !hasLoadedRef.current;
      load(false, isFirstVisit);
      hasLoadedRef.current = true;
    });
    return unsub;
  }, [navigation, load]);

  // Pull-to-refresh always forces API sync
  const handleRefresh = useCallback(() => { load(true, true); }, [load]);

  // ── Dialog ────────────────────────────────────────────────────────────────
  const openDialog = (item) => {
    const current = wastageMap[item.id] ?? 0;
    setDialogText(current > 0 ? String(current) : '');
    setEditingItem(item);
  };

  const closeDialog = () => {
    setEditingItem(null);
    setDialogText('');
  };

  const saveDialog = () => {
    if (!editingItem) return;
    const n = parseFloat(dialogText);
    const qty = Number.isNaN(n) ? 0 : Math.max(0, n);
    setWastageMap((prev) => ({ ...prev, [editingItem.id]: qty }));
    closeDialog();
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleSave = async (silent = false) => {
    setSaving(true);
    try {
      for (const item of items) {
        const qty = wastageMap[item.id] ?? 0;
        if (qty > 0 || wastageMap[item.id] !== undefined) {
          await setWastedQuantity({
            orderDate: selectedDate, sessionId, customerId,
            itemId: item.id, menuPlanItemId: item.despatchItemId,
            itemName: item.name, quantity: qty,
            reason: reasonMap[item.id] ?? null,
          });
        }
      }
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
              { text: 'OK', onPress: () => load(false, true) },
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
    const despatched = despatchMap[String(item.id)];

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={2}>{item.changeRecipeName}</Text>
            {!!item.groupName && <Text style={styles.itemGroup}>{item.groupName}</Text>}
          </View>
          <View style={styles.itemHeaderRight}>
            <Text style={styles.itemQtyLabel}>
              {despatched !== undefined
                ? `Despatched: ${formatQty(despatched)}${item.uomName ? ` ${item.uomName}` : ''}`
                : `Ordered: ${item.quantity}${item.uomName ? ` ${item.uomName}` : ''}`}
            </Text>
            {!!statusStyle && (
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          style={[styles.wasteFakeInput, effectiveStatus === 'APPROVED' && styles.wasteFakeInputLocked]}
          onPress={effectiveStatus === 'APPROVED' ? undefined : () => openDialog(item)}
          disabled={effectiveStatus === 'APPROVED'}
        >
          <Text style={qty > 0 ? styles.wasteFakeInputValue : styles.wasteFakeInputPlaceholder}>
            {qty > 0 ? formatQty(qty) : 'Tap to enter wasted quantity'}
          </Text>
          {effectiveStatus === 'APPROVED' && (
            <Ionicons name="lock-closed-outline" size={14} color="#6b7280" style={styles.lockIcon} />
          )}
        </Pressable>
      </View>
    );
  };

  const dialogDespatched = editingItem ? despatchMap[String(editingItem.id)] : undefined;
  const footerPaddingBottom = Math.max(16, insets.bottom + 8);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBlobTop} />

      {/* Header */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBrandWrap}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{customerCode || customerName || 'Customer'}</Text>
              <Text style={styles.title}>Wastages</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <View style={[styles.heroBadge, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="analytics-outline" size={14} color={THEME} />
              <Text style={[styles.heroBadgeText, { color: THEME }]}>{items.length}</Text>
            </View>
            <Pressable
              style={styles.heroActionBtn}
              onPress={() => navigation.navigate('WastageApproval', {
                orderDate: selectedDate, sessionId, customerId,
                sessionName, customerName, customerCode,
              })}
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

      {/* List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: footerPaddingBottom + 72 }]}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>No menu items available for this session.</Text>}
        />
      )}

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.footerBtnText}>Save</Text></>}
        </Pressable>
        <Pressable style={[styles.submitBtn, { backgroundColor: THEME }]} onPress={handleSubmit} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="send-outline" size={18} color="#fff" /><Text style={styles.footerBtnText}>Submit</Text></>}
        </Pressable>
      </View>

      {/* Wasted quantity dialog */}
      <Modal
        visible={!!editingItem}
        transparent
        animationType="fade"
        onRequestClose={closeDialog}
        onShow={() => dialogInputRef.current?.focus()}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeDialog}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable style={styles.dialogCard} onPress={() => {}}>
              <Text style={styles.dialogTitle} numberOfLines={2}>{editingItem?.name}</Text>
              <Text style={styles.dialogSub}>
                {[
                  dialogDespatched !== undefined && `Despatched: ${formatQty(dialogDespatched)}`,
                  editingItem?.uomName,
                ].filter(Boolean).join('  ·  ')}
              </Text>
              <TextInput
                ref={dialogInputRef}
                style={styles.dialogInput}
                value={dialogText}
                onChangeText={setDialogText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#9ca3af"
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={saveDialog}
              />
              <View style={styles.dialogActions}>
                <Pressable style={styles.dialogCancelBtn} onPress={closeDialog}>
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.dialogSaveBtn} onPress={saveDialog}>
                  <Text style={styles.dialogSaveText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroActionBtn: {
    width: 38, height: 38, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
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
  wasteFakeInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 6,
    borderWidth: 1.5, borderColor: 'rgba(217, 119, 6, 0.35)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#fff',
  },
  wasteFakeInputLocked: {
    backgroundColor: '#f9fafb',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  wasteFakeInputValue: {
    fontSize: 16, fontWeight: '700', color: THEME, textAlign: 'right', flex: 1,
  },
  wasteFakeInputPlaceholder: {
    fontSize: 14, fontWeight: '400', color: '#9ca3af', textAlign: 'right', flex: 1,
  },
  lockIcon: { flexShrink: 0 },
  emptyText: { marginTop: 32, textAlign: 'center', color: '#6b7280' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1, borderTopColor: 'rgba(217, 119, 6, 0.12)',
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: '#6b7280',
  },
  submitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
  },
  footerBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Dialog ──────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalKAV: { width: '100%', alignItems: 'center' },
  dialogCard: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 24, width: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 10,
  },
  dialogTitle: {
    fontSize: 16, fontWeight: '800', color: '#0f172a',
    marginBottom: 4, textAlign: 'center',
  },
  dialogSub: {
    fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20,
  },
  dialogInput: {
    borderWidth: 1.5, borderColor: 'rgba(217, 119, 6, 0.4)',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 32, fontWeight: '800', color: '#0f172a',
    textAlign: 'center', backgroundColor: '#fffef5', marginBottom: 20,
  },
  dialogActions: { flexDirection: 'row', gap: 12 },
  dialogCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 14,
    backgroundColor: '#f3f4f6', alignItems: 'center',
  },
  dialogCancelText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  dialogSaveBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 14,
    backgroundColor: THEME, alignItems: 'center',
  },
  dialogSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
