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
  import { formatIsoDateForDisplay } from '../utils/date';
import { loadSessionsWithInitialSync, refreshSessionsFromApi } from '../utils/sessions';

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function SessionScreen({ navigation, route }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);
  const selectedDateFromRoute = route?.params?.selectedDate;
  const currentDate = parseIsoDate(selectedDateFromRoute);
  const displayedDate = formatIsoDateForDisplay(
    currentDate ? formatIsoDate(currentDate) : selectedDateFromRoute,
    'Date'
  );

  const showFetchErrorToast = useCallback(() => {
    const message = 'Unable to fetch sessions data. Please check your internet connection and try again.';

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

  const loadSessions = useCallback(async () => {
    setLoading(true);

    try {
      const localSessions = await loadSessionsWithInitialSync();
      setSessions(localSessions);
    } catch (error) {
      console.log('Load sessions error:', error);
      showFetchErrorToast();
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [showFetchErrorToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const updatedSessions = await refreshSessionsFromApi();
      setSessions(updatedSessions);
    } catch (error) {
      console.log('Refresh sessions error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [showFetchErrorToast]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert('Session Options', 'Choose an action', [
      {
        text: 'Refresh',
        onPress: () => {
          handleRefresh();
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleRefresh]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: displayedDate,
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [displayedDate, navigation, openOptionsMenu]);

  // Load from SQLite first; initial API sync happens only when table is empty.
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const renderSessionItem = ({ item }) => {
    const active = Boolean(item.isActive);

    const handleSessionPress = () => {
      navigation.navigate('Customers', {
        sessionId: item.id,
        sessionName: item.name,
        selectedDate: currentDate ? formatIsoDate(currentDate) : selectedDateFromRoute ?? null,
      });
    };

    return (
      <Pressable style={styles.sessionItem} onPress={handleSessionPress}>
        <View style={[styles.iconSquare, active ? styles.iconActive : styles.iconInactive]}>
          <Ionicons name="square" size={32} color={active ? '#0b6bcb' : '#9ca3af'} />
        </View>
        <Text style={[styles.sessionName, !active && styles.sessionNameInactive]} numberOfLines={2}>
          {item.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderSessionItem}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          ListEmptyComponent={<Text style={styles.emptyText}>No sessions available.</Text>}
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
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
  gridContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  sessionItem: {
    width: '31%',
    marginBottom: 16,
    alignItems: 'center',
  },
  iconSquare: {
    width: 70,
    height: 70,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  iconActive: {
    backgroundColor: '#e8f3ff',
    borderColor: '#0b6bcb',
    opacity: 1,
  },
  iconInactive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    opacity: 0.45,
  },
  sessionName: {
    fontSize: 13,
    textAlign: 'center',
    color: '#111827',
  },
  sessionNameInactive: {
    color: '#6b7280',
  },
  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#6b7280',
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
