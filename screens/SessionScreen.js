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
      title: 'Sessions',
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [navigation, openOptionsMenu]);

  // Load from SQLite first; initial API sync happens only when table is empty.
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const getSessionColor = (index) => {
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

  const renderSessionItem = ({ item, index }) => {
    const active = Boolean(item.isActive);
    const colors = getSessionColor(index);
    const opacity = active ? 1 : 0.5;

    const handleSessionPress = () => {
      navigation.navigate('Customers', {
        sessionId: item.id,
        sessionName: item.name,
        selectedDate: currentDate ? formatIsoDate(currentDate) : selectedDateFromRoute ?? null,
      });
    };

    return (
      <Pressable 
        style={[styles.sessionCard, { backgroundColor: colors.background, opacity }]} 
        onPress={handleSessionPress}
      >
        <View style={[styles.sessionIconWrap, { backgroundColor: colors.icon }]}>
          <Ionicons name="fast-food" size={24} color="#fff" />
        </View>
        <View style={styles.sessionContent}>
          <Text style={styles.sessionCardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.sessionStatus}>
            {active ? 'Active' : 'Inactive'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{displayedDate}</Text>
      {currentDate && (
        <Text style={styles.subtitle}>
          {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
        </Text>
      )}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderSessionItem}
          numColumns={1}
          contentContainerStyle={styles.listContent}
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
    paddingBottom: 24,
    gap: 12,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  sessionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionContent: {
    flex: 1,
  },
  sessionCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  sessionStatus: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
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
