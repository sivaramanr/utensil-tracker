import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { loadContactsWithInitialSync, refreshContactsFromApi } from '../services/contacts';

const THEME = '#7c3aed';

function contactDisplayName(contact) {
  const parts = [contact.title, contact.firstname, contact.lastname].filter(Boolean);
  return parts.join(' ') || 'Unknown';
}

export default function FeedbackContactsScreen({ navigation, route }) {
  const { customerId, customerCode, customerName, selectedDate, sessionId, sessionName } = route.params ?? {};
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
      return;
    }
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadContactsWithInitialSync({ customerId });
      setContacts(result);
    } catch (error) {
      console.error('FeedbackContacts load error:', error);
      showToast('Unable to load contacts. Check your connection and try again.');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, showToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await refreshContactsFromApi({ customerId });
      setContacts(result);
    } catch (error) {
      console.error('FeedbackContacts refresh error:', error);
      showToast('Unable to refresh contacts. Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  }, [customerId, showToast]);

  useEffect(() => { load(); }, [load]);

  const openContactQR = (contact) => {
    navigation.navigate('FeedbackQR', {
      customerId,
      orderDate: selectedDate,
      sessionId,
      customerName,
      contact,
    });
  };

  const handleCall = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number.replace(/\s+/g, '')}`).catch(() =>
      showToast('Could not open dialler.')
    );
  };

  const openWhatsApp = (number) => {
    const cleaned = number?.replace(/[\s\-()]/g, '')?.replace('+', '');
    if (!cleaned) return;
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() =>
      showToast('WhatsApp is not installed.')
    );
  };

  const getContactColor = (index) => {
    const colors = [
      { icon: '#7c3aed', background: '#f5f3ff' },
      { icon: '#2563eb', background: '#eff6ff' },
      { icon: '#059669', background: '#f0fdf4' },
      { icon: '#d97706', background: '#fffbeb' },
      { icon: '#db2777', background: '#fdf2f8' },
      { icon: '#0891b2', background: '#ecfdff' },
    ];
    return colors[index % colors.length];
  };

  const renderContact = ({ item, index }) => {
    const colors = getContactColor(index);
    const name = contactDisplayName(item);
    const initials = [item.firstname?.[0], item.lastname?.[0]].filter(Boolean).join('').toUpperCase() || '?';
    const hasPhone = !!(item.mobileNo1 || item.mobileNo2);

    return (
      <Pressable
        style={[styles.contactCard, { backgroundColor: colors.background }]}
        onPress={() => openContactQR(item)}
      >
        <View style={styles.contactCardGlow} />

        <View style={styles.contactMain}>
          <View style={[styles.avatarWrap, { backgroundColor: colors.icon }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.contactContent}>
            <View style={styles.contactTopRow}>
              <Text style={styles.contactName} numberOfLines={1}>{name}</Text>
              {/* QR tap hint */}
              <View style={styles.qrHint}>
                <Ionicons name="qr-code-outline" size={16} color={colors.icon} />
              </View>
            </View>
            {!!item.designation && (
              <Text style={styles.contactDesignation} numberOfLines={1}>{item.designation}</Text>
            )}
            {!!item.description && (
              <Text style={styles.contactDescription} numberOfLines={2}>{item.description}</Text>
            )}
          </View>
        </View>

        {/* Phone + WhatsApp quick actions */}
        {hasPhone && (
          <View style={styles.quickActions}>
            {item.mobileNo1 && (
              <>
                <Pressable
                  style={styles.phoneChip}
                  onPress={(e) => { e.stopPropagation(); handleCall(item.mobileNo1); }}
                  hitSlop={6}
                >
                  <Ionicons name="call-outline" size={13} color={colors.icon} />
                  <Text style={[styles.phoneText, { color: colors.icon }]}>{item.mobileNo1}</Text>
                </Pressable>
                <Pressable
                  style={styles.whatsappChip}
                  onPress={(e) => { e.stopPropagation(); openWhatsApp(item.mobileNo1); }}
                  hitSlop={6}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#25d366" />
                </Pressable>
              </>
            )}
            {item.mobileNo2 && (
              <Pressable
                style={styles.phoneChip}
                onPress={(e) => { e.stopPropagation(); handleCall(item.mobileNo2); }}
                hitSlop={6}
              >
                <Ionicons name="call-outline" size={13} color={colors.icon} />
                <Text style={[styles.phoneText, { color: colors.icon }]}>{item.mobileNo2}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
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
              <Text style={styles.heroEyebrow} numberOfLines={1}>
                {customerName || customerCode || 'Customer'}
              </Text>
              <Text style={styles.title}>Contacts</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="people-outline" size={14} color={THEME} />
            <Text style={styles.heroBadgeText}>{contacts.length}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {formatIsoDateForDisplay(selectedDate, '')}
          {sessionName ? ` · ${sessionName}` : ''}
        </Text>
        <Text style={styles.tapHint}>
          <Ionicons name="qr-code-outline" size={12} color="#9ca3af" /> Tap a contact to generate their QR code
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.contactId}
          renderItem={renderContact}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <Pressable
              style={styles.customerQrCard}
              onPress={() =>
                navigation.navigate('FeedbackQR', {
                  customerId,
                  orderDate: selectedDate,
                  sessionId,
                  customerName,
                  contact: null,
                })
              }
            >
              <View style={styles.customerQrIconWrap}>
                <Ionicons name="qr-code-outline" size={28} color={THEME} />
              </View>
              <View style={styles.customerQrTextWrap}>
                <Text style={styles.customerQrLabel}>Customer QR Code</Text>
                <Text style={styles.customerQrName} numberOfLines={1}>
                  {customerName || customerCode || 'Customer'}
                </Text>
                <Text style={styles.customerQrCaption}>No contact details in URL</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME} />
            </Pressable>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No contacts found for this customer.</Text>
              <Pressable style={styles.emptyRefreshBtn} onPress={handleRefresh}>
                <Text style={styles.emptyRefreshText}>Tap to refresh</Text>
              </Pressable>
            </View>
          }
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {!!toastMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff', paddingTop: 34 },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#8b5cf6', opacity: 0.12,
  },
  heroCard: {
    backgroundColor: '#fdfcff', borderRadius: 28,
    padding: 20, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.12)',
    shadowColor: '#4c1d95', shadowOffset: { width: 0, height: 6 },
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
    textTransform: 'uppercase', color: '#5b21b6', marginBottom: 2,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: '#ede9fe',
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700', color: THEME },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  tapHint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  contactCard: {
    padding: 16, borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.7)',
    gap: 12,
  },
  contactCardGlow: {
    position: 'absolute', top: -18, right: -18,
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  contactMain: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  contactContent: { flex: 1 },
  contactTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contactName: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1 },
  qrHint: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  contactDesignation: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 2 },
  contactDescription: { fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 17 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  phoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  phoneText: { fontSize: 12, fontWeight: '600' },
  whatsappChip: {
    width: 32, height: 32, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  customerQrCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 8, padding: 18, borderRadius: 24,
    backgroundColor: '#fdfcff',
    borderWidth: 2, borderColor: THEME, borderStyle: 'dashed',
  },
  customerQrIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ede9fe', flexShrink: 0,
  },
  customerQrTextWrap: { flex: 1, gap: 2 },
  customerQrLabel: { fontSize: 11, fontWeight: '700', color: THEME, textTransform: 'uppercase', letterSpacing: 0.6 },
  customerQrName: { fontSize: 16, fontWeight: '800', color: '#1e1b4b' },
  customerQrCaption: { fontSize: 12, color: '#9ca3af' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { textAlign: 'center', color: '#6b7280', fontSize: 14 },
  emptyRefreshBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#ede9fe',
  },
  emptyRefreshText: { color: THEME, fontWeight: '700', fontSize: 14 },
  toastContainer: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    backgroundColor: '#111827', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  toastText: { color: '#ffffff', fontSize: 13, textAlign: 'center' },
});
