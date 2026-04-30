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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { getSessionCustomerItems } from '../../../platform/services/sessionData';
import { approveWastageEntries, getAllWastageEntries, getWastageEntries } from '../services/wastage';

const THEME = '#d97706';

const STATUS_LABELS = {
  LOCAL_ONLY: { label: 'Created',   color: '#166534', bg: '#dcfce7' },
  CHANGED:    { label: 'Changed',   color: '#1e40af', bg: '#dbeafe' },
  SUBMITTED:  { label: 'Submitted', color: '#d97706', bg: '#fef3c7' },
  APPROVED:   { label: 'Approved',  color: '#059669', bg: '#d1fae5' },
};

export default function WastageApprovalScreen({ navigation, route }) {
  const { orderDate, sessionId, customerId, sessionName, customerName, customerCode } = route.params ?? {};
  const hasContext = !!(orderDate && sessionId && customerId);
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = hasContext
        ? await getWastageEntries({ orderDate, sessionId, customerId })
        : await getAllWastageEntries();

      const submitted = all.filter((e) => e.wastedQuantity > 0 && e.syncStatus === 'SUBMITTED');

      // Build itemId → name map from SessionDataItems (same source as WastageEntryScreen)
      const seen = new Set();
      const contexts = [];
      for (const e of submitted) {
        const key = `${e.orderDate}|${e.sessionId}|${e.customerId}`;
        if (!seen.has(key)) {
          seen.add(key);
          contexts.push({ orderDate: e.orderDate, sessionId: e.sessionId, customerId: e.customerId });
        }
      }
      const itemNameMap = {};
      await Promise.all(
        contexts.map(async (ctx) => {
          const items = await getSessionCustomerItems(ctx).catch(() => []);
          for (const item of items) itemNameMap[String(item.id)] = item.changeRecipeName;
        })
      );

      // Attach resolved name to each entry
      setEntries(
        submitted.map((e) => ({
          ...e,
          itemName: itemNameMap[String(e.itemId)] || e.itemName || '—',
        }))
      );
    } catch (error) {
      console.error('WastageApproval load error:', error);
    } finally {
      setLoading(false);
    }
  }, [hasContext, orderDate, sessionId, customerId]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(entries.map((e) => e.id)));
  };

  const handleApprove = () => {
    if (!selected.size) {
      Alert.alert('Nothing selected', 'Select submitted entries to approve.');
      return;
    }
    Alert.alert('Approve Entries', `Approve ${selected.size} selected entries?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setApproving(true);
          try {
            await approveWastageEntries(Array.from(selected));
            setSelected(new Set());
            await load();
            Alert.alert('Done', 'Selected entries approved.');
          } catch (error) {
            console.error('Approve error:', error);
            Alert.alert('Error', 'Could not approve. Please try again.');
          } finally {
            setApproving(false);
          }
        },
      },
    ]);
  };

  const renderEntry = ({ item }) => {
    const isSelected = selected.has(item.id);
    const status = STATUS_LABELS[item.syncStatus] ?? STATUS_LABELS.SUBMITTED;
    return (
      <Pressable
        style={[styles.entryCard, isSelected && styles.entryCardSelected]}
        onPress={() => toggleSelect(item.id)}
      >
        <View style={styles.entryRow}>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <View style={styles.entryContent}>
            <Text style={styles.entryName} numberOfLines={1}>{item.itemName || '—'}</Text>
            <Text style={styles.entryMeta}>
              {formatIsoDateForDisplay(item.orderDate, '')} · Qty: {item.wastedQuantity}
            </Text>
            {!!item.reason && <Text style={styles.entryReason}>Reason: {item.reason}</Text>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const eyebrow = hasContext
    ? (customerCode || customerName || 'Customer')
    : 'Wastage Tracker';

  const footerPaddingBottom = Math.max(16, insets.bottom + 8);

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
              <Text style={styles.heroEyebrow} numberOfLines={1}>{eyebrow}</Text>
              <Text style={styles.title}>Approvals</Text>
            </View>
          </View>
          <View style={[styles.heroBadge, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="time-outline" size={14} color={THEME} />
            <Text style={[styles.heroBadgeText, { color: THEME }]}>{entries.length}</Text>
          </View>
        </View>
        {hasContext && (
          <Text style={styles.subtitle}>
            {formatIsoDateForDisplay(orderDate, '')}
            {sessionName ? ` · ${sessionName}` : ''}
          </Text>
        )}
        {entries.length > 0 && (
          <Pressable style={styles.selectAllBtn} onPress={selectAll}>
            <Text style={styles.selectAllText}>Select all ({entries.length})</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={[
            styles.listContent,
            entries.length > 0 && { paddingBottom: footerPaddingBottom + 70 },
          ]}
          ListEmptyComponent={<Text style={styles.emptyText}>No entries pending approval.</Text>}
        />
      )}

      {entries.length > 0 && (
        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          <Pressable
            style={[styles.approveBtn, { backgroundColor: THEME }, approving && styles.btnDisabled]}
            onPress={handleApprove}
            disabled={approving}
          >
            {approving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.approveBtnText}>
                  {selected.size > 0 ? `Approve (${selected.size})` : 'Approve Selected'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
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
  selectAllBtn: { marginTop: 12 },
  selectAllText: { fontSize: 13, color: THEME, fontWeight: '600' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 10 },
  entryCard: {
    backgroundColor: '#fffef5', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.10)',
  },
  entryCardSelected: { borderColor: THEME, backgroundColor: '#fef3c7' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 2,
    borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: THEME, borderColor: THEME },
  entryContent: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  entryMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  entryReason: { fontSize: 12, color: '#92400e', marginTop: 2, fontStyle: 'italic' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyText: { marginTop: 32, textAlign: 'center', color: '#6b7280' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 16,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1, borderTopColor: 'rgba(217, 119, 6, 0.12)',
  },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
  },
  btnDisabled: { opacity: 0.6 },
  approveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
