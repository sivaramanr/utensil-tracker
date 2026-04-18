import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
} from '../utils/customers';
import { formatIsoDateForDisplay } from '../utils/date';

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
          <View style={[styles.customerIconWrap, { backgroundColor: colors.icon }]}>
            <Ionicons name="business" size={24} color="#fff" />
          </View>
          <View style={styles.customerContent}>
            <Text style={styles.customerCode} numberOfLines={1}>
              {item.code || 'N/A'}
            </Text>
            <Text style={styles.customerNameSubtitle} numberOfLines={2}>
              {item.name}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
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
      <Text style={styles.title}>{titleText}</Text>
      {!!subtitleText && <Text style={styles.subtitle}>{subtitleText}</Text>}

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
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  customerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerContent: {
    flex: 1,
  },
  customerCode: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  customerNameSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
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