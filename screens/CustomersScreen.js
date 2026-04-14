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
  const titleText = formatIsoDateForDisplay(selectedDate, 'No date selected');

  const formatLastSync = useCallback((value) => {
    if (!value) {
      return 'Last sync: Not synced yet';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return 'Last sync: Not synced yet';
    }

    return `Last sync: ${parsedDate.toLocaleString()}`;
  }, []);
  const subtitleText = [sessionName, formatLastSync(lastSyncAt)].filter(Boolean).join(' | ');

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

  const renderCustomerItem = ({ item }) => (
    <Pressable
      onPress={() =>
        navigation.navigate('Movement', {
          customerId: item.id,
          customerName: item.name,
          selectedDate,
          sessionId,
          sessionName,
        })
      }
    >
      <View style={styles.card}>
        <View style={styles.cardBody}>
          <Text style={styles.customerName} numberOfLines={2}>{item.name}</Text>
          {!!item.companyAddress?.line1 && (
            <Text style={styles.addressText} numberOfLines={1}>{item.companyAddress.line1}</Text>
          )}
          {!!item.companyAddress?.line2 && (
            <Text style={styles.addressText} numberOfLines={1}>{item.companyAddress.line2}</Text>
          )}
          {!!item.companyAddress?.city && (
            <Text style={styles.addressText} numberOfLines={1}>{item.companyAddress.city}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  const renderListFooter = () => (
    <Text style={styles.listFooterText}>Offline cache by selected date and session.</Text>
  );

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