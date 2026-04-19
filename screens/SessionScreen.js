import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View
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

  // const openOptionsMenu = useCallback(() => {
  //   Alert.alert('Session Options', 'Choose an action', [
  //     {
  //       text: 'Refresh',
  //       onPress: () => {
  //         handleRefresh();
  //       },
  //     },
  //     {
  //       text: 'Cancel',
  //       style: 'cancel',
  //     },
  //   ]);
  // }, [handleRefresh]);

  // useLayoutEffect(() => {
  //   navigation.setOptions({
  //     title: 'Sessions',
  //     headerRight: () => (
  //       <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
  //         <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
  //       </Pressable>
  //     ),
  //   });
  // }, [navigation, openOptionsMenu]);

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
        <View style={styles.sessionCardGlow} />
        <View style={[styles.sessionIconWrap, { backgroundColor: colors.icon }]}>
          <Ionicons name="fast-food" size={24} color="#fff" />
        </View>
        <View style={styles.sessionContent}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.sessionCardName} numberOfLines={1}>
              {item.name}
            </Text>
            <View
              style={[
                styles.sessionStatusBadge,
                active ? styles.sessionStatusBadgeActive : styles.sessionStatusBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.sessionStatusText,
                  active ? styles.sessionStatusTextActive : styles.sessionStatusTextInactive,
                ]}
              >
                {active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
          <Text style={styles.sessionCaption}>Open customer list for this session</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </View>
      </Pressable>
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
                source={require('../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{displayedDate}</Text>
              <Text style={styles.title}>Sessions</Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="calendar-outline" size={14} color="#0f766e" />
            <Text style={styles.heroBadgeText}>{sessions.length}</Text>
          </View>
        </View>
        {currentDate && (
          <Text style={styles.subtitle}>
            {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
          </Text>
        )}
      </View>
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
    paddingBottom: 24,
    gap: 12,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  sessionCardGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  sessionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  sessionStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  sessionStatusBadgeActive: {
    backgroundColor: '#dcfce7',
  },
  sessionStatusBadgeInactive: {
    backgroundColor: '#e5e7eb',
  },
  sessionStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionStatusTextActive: {
    color: '#166534',
  },
  sessionStatusTextInactive: {
    color: '#475569',
  },
  sessionCaption: {
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
