import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccessToken, getWorkInfo } from '../../../core/auth';
import { BASE_URL } from '../../../core/api/endpoints';
import { formatIsoDateForDisplay } from '../../../core/utils/date';
import { getSessionCustomerCombos } from '../../../platform/services/sessionData';

const THEME = '#059669';

export default function DCChallanScreen({ navigation, route }) {
  const {
    customerId, customerCode, customerName,
    selectedDate, sessionId, sessionName,
    tripNo = 1,
  } = route.params ?? {};

  const [combos, setCombos] = useState([]);
  const [selectedCombos, setSelectedCombos] = useState(new Set());
  const [includeOrderQty, setIncludeOrderQty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      try {
        const result = await getSessionCustomerCombos({ orderDate: selectedDate, sessionId, customerId });
        setCombos(result);
        setSelectedCombos(new Set(result.map((c) => c.id)));
      } catch (e) {
        console.error('DCChallan load combos error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate, sessionId, customerId]);

  const toggleCombo = (id) => {
    setSelectedCombos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
      const unitId = String(workInfo?.companyId ?? '');

      const params = new URLSearchParams({
        despatchDate:         selectedDate,
        sessionId:            String(sessionId),
        tripNo:               String(tripNo),
        unitId,
        includeOrderQuantity: String(includeOrderQty),
      });
      // Append includeCombos raw (URLSearchParams encodes commas as %2C which breaks the API)
      let url = `${BASE_URL}/despatch/report/${customerId}?${params.toString()}`;
      if (selectedCombos.size > 0) {
        url += `&includeCombos=${Array.from(selectedCombos).join(',')}`;
      }
      console.log('[DCChallan] Download URL:', url);

      // Use fetch directly (mirrors web: axios with responseType arraybuffer → new Blob([response]))
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, unitId },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error('[DCChallan] Server error body:', errorBody);
        throw new Error(`Server returned status ${response.status}`);
      }

      // Get binary data as blob, convert to base64 for file system
      const blob = await response.blob();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.replace(/^data:.+;base64,/, ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const fileName = `dc_challan_${customerCode || customerId}_${selectedDate}.pdf`;
      const localUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(localUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(localUri, {
        mimeType:    'application/pdf',
        dialogTitle: 'DC Challan',
        UTI:         'com.adobe.pdf',
      });
    } catch (error) {
      console.error('DC Challan download error:', error);
      Alert.alert('Download Failed', 'Could not generate the DC Challan. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [
    customerId, customerCode, selectedDate,
    sessionId, tripNo, includeOrderQty, selectedCombos,
  ]);

  const renderComboItem = ({ item }) => {
    const checked = selectedCombos.has(item.id);
    return (
      <Pressable style={styles.checkRow} onPress={() => toggleCombo(item.id)}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkLabel} numberOfLines={2}>
          Include {item.name}
        </Text>
      </Pressable>
    );
  };

  const footer = (
    <Pressable
      style={[styles.checkRow, styles.checkRowLast]}
      onPress={() => setIncludeOrderQty((v) => !v)}
    >
      <View style={[styles.checkbox, includeOrderQty && styles.checkboxOn]}>
        {includeOrderQty && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.checkLabel}>Include ordered quantity</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.backgroundBlobTop} />

      {/* Header */}
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
                {customerCode || customerName || 'Customer'}
              </Text>
              <Text style={styles.title}>DC Challan</Text>
            </View>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {formatIsoDateForDisplay(selectedDate, 'No date')}
          {sessionName ? ` · ${sessionName}` : ''}
        </Text>
      </View>

      {/* Combo checklist */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={THEME} />
        </View>
      ) : (
        <FlatList
          data={combos}
          keyExtractor={(item) => item.id}
          renderItem={renderComboItem}
          ListFooterComponent={footer}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No combos found for this session.</Text>
          }
        />
      )}

      {/* Download button */}
      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <Pressable
          style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
          onPress={handleDownload}
          disabled={downloading}
        >
          <Ionicons name="download-outline" size={20} color="#fff" />
          <Text style={styles.downloadBtnText}>Download</Text>
        </Pressable>
      </View>

      {/* Generating overlay */}
      <Modal visible={downloading} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={THEME} style={styles.overlaySpinner} />
            <Text style={styles.overlayTitle}>Generating DC Challan</Text>
            <Text style={styles.overlaySubtitle}>
              Please wait, this may take a moment…
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4', paddingTop: 34 },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#059669', opacity: 0.10,
  },
  heroCard: {
    backgroundColor: '#f7fffe', borderRadius: 28, padding: 20, margin: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(5, 150, 105, 0.12)',
    shadowColor: '#065f46', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
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
    textTransform: 'uppercase', color: '#065f46', marginBottom: 2,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#f7fffe', borderRadius: 16, padding: 16,
    marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(5, 150, 105, 0.10)',
  },
  checkRowLast: {
    borderStyle: 'dashed', borderColor: 'rgba(5, 150, 105, 0.25)',
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 8,
    borderWidth: 2, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxOn: { backgroundColor: THEME, borderColor: THEME },
  checkLabel: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  emptyText: { marginTop: 32, textAlign: 'center', color: '#6b7280' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#f0fdf4',
    borderTopWidth: 1, borderTopColor: 'rgba(5, 150, 105, 0.12)',
  },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: THEME,
  },
  downloadBtnDisabled: { opacity: 0.5 },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 32, alignItems: 'center', marginHorizontal: 40,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  overlaySpinner: { marginBottom: 16 },
  overlayTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  overlaySubtitle: {
    marginTop: 8, fontSize: 13, color: '#6b7280',
    textAlign: 'center', lineHeight: 20,
  },
});
