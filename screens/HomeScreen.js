import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';
import { clearTokens, getTokens } from '../utils/auth';
import { getDashboardSummary } from '../utils/utensilMovements';

const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com';
const REALM = 'Amrutha';
const CLIENT_ID = 'utracker';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });
const LOGOUT_ENDPOINT = `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/logout`;
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function SummaryCard({ title, value, icon, color, backgroundColor }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor }]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={24} color="#fff" />
      </View>
      <View style={styles.summaryContent}>
        <Text style={styles.summaryTitle}>{title}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const [displayedDate, setDisplayedDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [summaryData, setSummaryData] = useState({ despatched: 0, pending: 0, returned: 0 });
  const colorScheme = useColorScheme();
  const dangerColor = colorScheme === 'dark' ? '#ff6b6b' : '#d92d20';
  const themeTint = Colors[colorScheme ?? 'light'].tint;
  const currentDate = new Date();
  const year = displayedDate.getFullYear();
  const month = displayedDate.getMonth();
  const today = currentDate.getDate();
  const isCurrentDisplayedMonth =
    year === currentDate.getFullYear() && month === currentDate.getMonth();
  const monthTitle = displayedDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDayIndex }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const moveMonth = (offset) => {
    setDisplayedDate((prevDate) => new Date(prevDate.getFullYear(), prevDate.getMonth() + offset, 1));
  };

  const handleLogout = async () => {
    try {
      const tokens = await getTokens();

      const queryParts = [
        ['client_id', CLIENT_ID],
        ['post_logout_redirect_uri', REDIRECT_URI],
      ];

      if (tokens.idToken) {
        queryParts.push(['id_token_hint', tokens.idToken]);
      }

      const logoutUrl = `${LOGOUT_ENDPOINT}?${queryParts
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`;

      await WebBrowser.openAuthSessionAsync(logoutUrl, REDIRECT_URI);
    } catch (error) {
      console.log('Keycloak logout error:', error);
      Alert.alert('Logout', 'Could not complete server logout. Clearing local session.');
    } finally {
      await clearTokens();
      navigation.replace('Login');
    }
  };

  const confirmLogout = () => {
    Alert.alert('Confirm Logout', 'Are you sure you want to logout?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          handleLogout();
        },
      },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Utensil Tracker",
      headerLeft: () => (
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.headerButton} hitSlop={10}>
            <Ionicons name="settings-outline" size={24} color="#374151" />
          </Pressable>
      ),
      headerRight: () => (
          <Pressable onPress={confirmLogout} style={styles.headerButton} hitSlop={10}>
            <Ionicons name="log-out-outline" size={24} color={dangerColor} />
          </Pressable>
      )
    });
  }, [navigation]);

  const loadDashboardSummary = async () => {
    try {
      const data = await getDashboardSummary();
      setSummaryData(data);
    } catch (error) {
      console.error('Error loading dashboard summary:', error);
    }
  };

  useEffect(() => {
    loadDashboardSummary();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadDashboardSummary();
    });
    return unsubscribe;
  }, [navigation]);

  const handleDatePress = (day) => {
    setSelectedDay(day);
    const formattedDate = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    navigation.navigate('Session', { selectedDate: formattedDate });
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.container}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary Cards */}
          <View style={styles.summarySection}>
            <SummaryCard
              title="Despatched"
              value={String(summaryData.despatched)}
              icon="swap-horizontal"
              color="#3b82f6"
              backgroundColor="#eff6ff"
            />
            <SummaryCard
              title="Pending"
              value={String(summaryData.pending)}
              icon="time-outline"
              color="#f59e0b"
              backgroundColor="#fffbeb"
            />
            <SummaryCard
              title="Returned"
              value={String(summaryData.returned)}
              icon="checkmark-circle-outline"
              color="#10b981"
              backgroundColor="#f0fdf4"
            />
          </View>

          {/* Mini Calendar */}
          <View style={styles.calendarSection}>
            <View style={styles.calendarHeader}>
              <Text style={styles.sectionTitle}>Calendar</Text>
              <View style={styles.calendarNavigation}>
                <Pressable onPress={() => moveMonth(-1)} style={styles.calendarNav} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color="#6b7280" />
                </Pressable>
                <Text style={styles.calendarMonth}>{monthTitle}</Text>
                <Pressable onPress={() => moveMonth(1)} style={styles.calendarNav} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                </Pressable>
              </View>
            </View>

            <View style={styles.miniCalendar}>
              {/* Week day headers */}
              <View style={styles.miniCalendarWeekHeader}>
                {WEEK_DAYS.map((dayName) => (
                  <View key={dayName} style={styles.miniCalendarWeekDay}>
                    <Text style={styles.miniCalendarWeekDayText}>{dayName}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar days grid */}
              <View style={styles.miniCalendarGrid}>
                {calendarCells.map((day, index) => {
                  if (!day) {
                    return <View key={`empty-${index}`} style={styles.miniCalendarDay} />;
                  }

                  const isToday = isCurrentDisplayedMonth && day === today;
                  const isSelected = isCurrentDisplayedMonth && day === selectedDay;

                  return (
                    <Pressable key={`day-${day}`} style={styles.miniCalendarDay} onPress={() => handleDatePress(day)}>
                      <View
                        style={[
                          styles.miniCalendarDayCircle,
                          isToday && { borderWidth: 2, borderColor: themeTint },
                          isSelected && { backgroundColor: themeTint },
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniCalendarDayText,
                            isSelected && { color: '#fff', fontWeight: '700' },
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>

        {/* Floating Action Button */}
        <Pressable
          style={[styles.fab, { backgroundColor: themeTint }]}
          onPress={() => navigation.navigate('Session', { selectedDate: new Date().toISOString().slice(0, 10) })}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    textAlign: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  summarySection: {
    gap: 12,
    marginBottom: 28,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  summaryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryContent: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
  },
  calendarSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarMonth: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    minWidth: 80,
    textAlign: 'center',
  },
  calendarNav: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCalendar: {
    flexDirection: 'column',
  },
  miniCalendarWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  miniCalendarWeekDay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCalendarWeekDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  miniCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -2,
  },
  miniCalendarDay: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  miniCalendarDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  miniCalendarDayText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  bottomSpacing: {
    height: 80,
  },
});
