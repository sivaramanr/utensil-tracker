import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {
  loadCustomersWithInitialSync,
  loadSessionCustomersWithInitialSync,
  refreshCustomersFromApi,
  syncSessionCustomersFromApi,
} from '../services/customers';
import { formatIsoDateForDisplay } from '../../../core/utils/date';

export default function CustomersScreen({ navigation, route }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const sessionName = route?.params?.sessionName;
  const titleText = sessionName || 'Session';
  
  const getSubtitleText = () => {
    const dateText = formatIsoDateForDisplay(selectedDate, 'No date selected');
    if (!selectedDate) return dateText;
    
    const date = new Date(selectedDate + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return dateText;
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dateText} | ${dayName}`;
  };
  
  const subtitleText = getSubtitleText();

  const showFetchErrorToast = useCallback(() => {
    const message = 'Unable to fetch customers data. Please check your internet connection and try again.';

    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
      return;
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      // Keep customer master cache ready so address fields are available in cards.
      await loadCustomersWithInitialSync();

      const result = await loadSessionCustomersWithInitialSync({
        orderDate: selectedDate,
        sessionId,
      });
      setCustomers(result.customers);
      setLastSyncAt(result.syncedAt);
    } catch (error) {
      console.log('Load customers error:', error);
      showFetchErrorToast();
      setCustomers([]);
      setLastSyncAt(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, sessionId, showFetchErrorToast]);

  const handleMenuSync = useCallback(async () => {
    setRefreshing(true);

    try {
      const result = await syncSessionCustomersFromApi({
        orderDate: selectedDate,
        sessionId,
      });
      setCustomers(result.customers);
      setLastSyncAt(result.syncedAt);
    } catch (error) {
      console.log('Refresh customers error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [selectedDate, sessionId, showFetchErrorToast]);

  const handleCustomerSync = useCallback(async () => {
    setRefreshing(true);

    try {
      await refreshCustomersFromApi();

      const result = await loadSessionCustomersWithInitialSync({
        orderDate: selectedDate,
        sessionId,
      });
      setCustomers(result.customers);
      setLastSyncAt(result.syncedAt);
    } catch (error) {
      console.log('Refresh customer master error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [selectedDate, sessionId, showFetchErrorToast]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert('Customer Options', 'Choose an action', [
      {
        text: 'Sync-up Menu',
        onPress: () => {
          handleMenuSync();
        },
      },
      {
        text: 'Sync-up Customer',
        onPress: () => {
          handleCustomerSync();
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleCustomerSync, handleMenuSync]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [navigation, openOptionsMenu]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const getCustomerColor = (index) => {
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

  const renderCustomerItem = ({ item, index }) => {
    const colors = getCustomerColor(index);
    return (
      <Pressable
        onPress={() =>
          navigation.navigate('Movement', {
            customerId: item.id,
            customerCode: item.code,
            customerName: item.name,
            selectedDate,
            sessionId,
            sessionName,
          })
        }
      >
        <View style={[styles.customerCard, { backgroundColor: colors.background }]}>
          <View style={styles.customerCardGlow} />
          <View style={[styles.customerIconWrap, { backgroundColor: colors.icon }]}>
            <Ionicons name="business" size={24} color="#fff" />
          </View>
          <View style={styles.customerContent}>
            <View style={styles.customerTopRow}>
              <Text style={styles.customerCode} numberOfLines={1}>
                {item.code || 'N/A'}
              </Text>
              <View style={styles.customerCodeBadge}>
                <Text style={styles.customerCodeBadgeText}>Customer</Text>
              </View>
            </View>
            <Text style={styles.customerNameSubtitle} numberOfLines={2}>
              {item.name}
            </Text>
            {/* <Text style={styles.customerCaption}>Open movements and utensil tracking</Text> */}
          </View>
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={18} color="#475569" />
          </View>
        </View>
      </Pressable>
    );
  };

  const renderListFooter = () => {
    if (!lastSyncAt) {
      return <Text style={styles.listFooterText}>Last sync: Not synced yet</Text>;
    }

    const parsedDate = new Date(lastSyncAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return <Text style={styles.listFooterText}>Last sync: Not synced yet</Text>;
    }

    return (
      <Text style={styles.listFooterText}>Last sync: {parsedDate.toLocaleString()}</Text>
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
                source={require('../../../../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{titleText}</Text>
              <Text style={styles.title}>Customers</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="people-outline" size={14} color="#0f766e" />
            <Text style={styles.heroBadgeText}>{customers.length}</Text>
          </View>
        </View>
        {!!subtitleText && <Text style={styles.subtitle}>{subtitleText}</Text>}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No customers available.</Text>}
          ListFooterComponent={renderListFooter}
          refreshing={refreshing}
          onRefresh={handleMenuSync}
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f4ecde',
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
    bottom: 100,
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
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  customerCardGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  customerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerContent: {
    flex: 1,
  },
  customerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  customerCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  customerCodeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  customerCodeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  customerNameSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 6,
  },
  customerCaption: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },
  cardBody: {
    width: '100%',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 1,
  },
  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#6b7280',
  },
  listFooterText: {
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },
});
