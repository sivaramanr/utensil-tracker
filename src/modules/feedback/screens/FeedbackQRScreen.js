import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { getTokens, getUserFromIdToken, getWorkInfo } from '../../../core/auth';

const THEME = '#7c3aed';
const BASE_FORM_URL = 'https://amrutha.cookerp.com/feedbackform/generate';

function buildFeedbackUrl({ customerId, orderDate, sessionId, firstname, lastname, designation, username, userLastname, unitId }) {
  const params = new URLSearchParams();
  if (customerId)   params.set('customerId',   String(customerId));
  if (orderDate)    params.set('orderDate',     String(orderDate));
  if (sessionId)    params.set('sessionId',     String(sessionId));
  if (firstname)    params.set('firstname',     String(firstname));
  if (lastname)     params.set('lastname',      String(lastname));
  if (designation)  params.set('designation',   String(designation));
  if (username)     params.set('username',      String(username));
  if (userLastname) params.set('userLastname',  String(userLastname));
  if (unitId)       params.set('unitId',        String(unitId));
  return `${BASE_FORM_URL}?${params.toString()}`;
}

function normalisePhone(raw) {
  if (!raw) return null;
  return raw.replace(/[\s\-()]/g, '');
}

export default function FeedbackQRScreen({ route }) {
  const { customerId, orderDate, sessionId, contact, customerName } = route.params ?? {};
  const viewShotRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [username, setUsername] = useState(null);
  const [userLastname, setUserLastname] = useState(null);
  const [unitId, setUnitId] = useState(null);

  useEffect(() => {
    Promise.all([getTokens(), getWorkInfo()])
      .then(([{ idToken }, workInfo]) => {
        const user = getUserFromIdToken(idToken);
        setUsername(user?.preferred_username ?? null);
        setUserLastname(user?.family_name ?? null);
        setUnitId(workInfo?.companyId ? String(workInfo.companyId) : null);
      })
      .catch(() => {});
  }, []);

  const qrUrl = buildFeedbackUrl({
    customerId,
    orderDate,
    sessionId,
    firstname:    contact?.firstname,
    lastname:     contact?.lastname,
    designation:  contact?.designation,
    username,
    userLastname,
    unitId,
  });

  const contactName = [contact?.title, contact?.firstname, contact?.lastname]
    .filter(Boolean).join(' ');

  const showToast = (message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    }
  };

  const captureQR = async () => {
    if (!viewShotRef.current) return null;
    try {
      const uri = await viewShotRef.current.capture();
      return uri;
    } catch (error) {
      console.error('ViewShot capture error:', error);
      return null;
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const uri = await captureQR();
      if (!uri) {
        showToast('Could not capture QR code.');
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share QR Code',
        });
      } else {
        await Share.share({ message: qrUrl, title: 'Feedback QR' });
      }
    } catch (error) {
      console.error('Share error:', error);
    } finally {
      setSharing(false);
    }
  };

  const handleWhatsApp = async (phone) => {
    setSharing(true);
    try {
      const uri = await captureQR();
      const cleaned = normalisePhone(phone);

      // Try to share the image file first (native share sheet, user picks WhatsApp)
      const canShare = await Sharing.isAvailableAsync();
      if (uri && canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share QR via WhatsApp with ${contactName || cleaned}`,
        });
      } else {
        // Fall back to opening WhatsApp chat with the number
        const waUrl = `https://wa.me/${cleaned?.replace('+', '')}`;
        const supported = await Linking.canOpenURL(waUrl);
        if (supported) {
          await Linking.openURL(waUrl);
        } else {
          showToast('WhatsApp is not installed.');
        }
      }
    } catch (error) {
      console.error('WhatsApp share error:', error);
    } finally {
      setSharing(false);
    }
  };

  const openWhatsAppChat = async (phone) => {
    const cleaned = normalisePhone(phone)?.replace('+', '');
    if (!cleaned) return;
    const url = `https://wa.me/${cleaned}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      showToast('WhatsApp is not installed.');
    }
  };

  const hasPhone = !!(contact?.mobileNo1 || contact?.mobileNo2);
  const primaryPhone = contact?.mobileNo1 || contact?.mobileNo2;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.heroCard}>
          <View style={styles.heroBrandRow}>
            <View style={styles.heroLogoCard}>
              <Image
                source={require('../../../../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>Feedback QR Code</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {contactName || customerName || 'Customer'}
              </Text>
            </View>
          </View>
          {!!contact?.designation && (
            <Text style={styles.heroDesignation}>{contact.designation}</Text>
          )}
          {!!orderDate && (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color={THEME} />
              <Text style={styles.metaChipText}>{orderDate}</Text>
            </View>
          )}
        </View>

        {/* QR Code card — captured by ViewShot */}
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }} style={styles.qrShot}>
          <View style={styles.qrCard}>
            <View style={styles.qrBrandRow}>
              <Image
                source={require('../../../../assets/images/cookerp-small.png')}
                style={styles.qrBrandLogo}
                resizeMode="contain"
              />
              <Text style={styles.qrBrandName}>CookERP Feedback</Text>
            </View>

            <View style={styles.qrWrap}>
              <QRCode
                value={qrUrl}
                size={220}
                color="#1e1b4b"
                backgroundColor="#ffffff"
                enableLinearGradient={false}
              />
            </View>

            {!!contactName && (
              <Text style={styles.qrContactName}>{contactName}</Text>
            )}
            {!!contact?.designation && (
              <Text style={styles.qrDesignation}>{contact.designation}</Text>
            )}
            <Text style={styles.qrInstruction}>Scan to share your feedback</Text>
          </View>
        </ViewShot>

        {/* Action buttons */}
        <View style={styles.actionsSection}>
          {/* Share button */}
          <Pressable style={styles.shareBtn} onPress={handleShare} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.shareBtnText}>Share QR Image</Text>
              </>
            )}
          </Pressable>

          {/* WhatsApp shortcut row (shown only if contact has a phone number) */}
          {hasPhone && (
            <View style={styles.whatsappRow}>
              <Pressable
                style={styles.whatsappShareBtn}
                onPress={() => handleWhatsApp(primaryPhone)}
                disabled={sharing}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.whatsappBtnText}>Share on WhatsApp</Text>
              </Pressable>
              <Pressable
                style={styles.whatsappChatBtn}
                onPress={() => openWhatsAppChat(primaryPhone)}
                hitSlop={6}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#25d366" />
              </Pressable>
            </View>
          )}

          {/* Phone numbers */}
          {hasPhone && (
            <View style={styles.phonesRow}>
              {contact?.mobileNo1 && (
                <Pressable
                  style={styles.phoneChip}
                  onPress={() => Linking.openURL(`tel:${normalisePhone(contact.mobileNo1)}`)}
                >
                  <Ionicons name="call-outline" size={14} color={THEME} />
                  <Text style={styles.phoneChipText}>{contact.mobileNo1}</Text>
                </Pressable>
              )}
              {contact?.mobileNo2 && (
                <Pressable
                  style={styles.phoneChip}
                  onPress={() => Linking.openURL(`tel:${normalisePhone(contact.mobileNo2)}`)}
                >
                  <Ionicons name="call-outline" size={14} color={THEME} />
                  <Text style={styles.phoneChipText}>{contact.mobileNo2}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* URL preview */}
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>QR URL</Text>
          <Text style={styles.urlText} selectable>{qrUrl}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#f5f3ff' },
  scroll: { padding: 16, paddingTop: 34, paddingBottom: 40, gap: 16 },

  heroCard: {
    backgroundColor: '#fdfcff', borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.12)',
    shadowColor: '#4c1d95', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
    gap: 8,
  },
  heroBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroLogoCard: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroLogo: { width: 30, height: 30 },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#5b21b6', marginBottom: 2,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  heroDesignation: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#ede9fe',
  },
  metaChipText: { fontSize: 12, fontWeight: '700', color: THEME },

  // ViewShot wrapper — must have a solid background for PNG capture
  qrShot: { borderRadius: 28, overflow: 'hidden' },

  qrCard: {
    backgroundColor: '#ffffff', borderRadius: 28,
    padding: 24, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.10)',
    shadowColor: '#4c1d95', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 5,
  },
  qrBrandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'flex-start',
  },
  qrBrandLogo: { width: 28, height: 28 },
  qrBrandName: { fontSize: 14, fontWeight: '800', color: '#1e1b4b' },
  qrWrap: {
    padding: 16, borderRadius: 20,
    backgroundColor: '#ffffff',
    shadowColor: '#4c1d95', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  qrContactName: { fontSize: 18, fontWeight: '800', color: '#1e1b4b', textAlign: 'center' },
  qrDesignation: { fontSize: 13, color: '#6b7280', fontWeight: '600', textAlign: 'center' },
  qrInstruction: {
    fontSize: 12, color: '#9ca3af', textAlign: 'center',
    marginTop: 4, fontStyle: 'italic',
  },

  actionsSection: { gap: 12 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 15, borderRadius: 18,
    backgroundColor: THEME,
    shadowColor: THEME, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  whatsappRow: { flexDirection: 'row', gap: 10 },
  whatsappShareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 18,
    backgroundColor: '#25d366',
    shadowColor: '#25d366', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  whatsappBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  whatsappChatBtn: {
    width: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#dcfce7',
    borderWidth: 1, borderColor: '#bbf7d0',
  },

  phonesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  phoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#ede9fe',
  },
  phoneChipText: { fontSize: 13, fontWeight: '600', color: THEME },

  urlCard: {
    backgroundColor: '#fdfcff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.10)', gap: 6,
  },
  urlLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6 },
  urlText: { fontSize: 11, color: '#6b7280', lineHeight: 16 },
});
