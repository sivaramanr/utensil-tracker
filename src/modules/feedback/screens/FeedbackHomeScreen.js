import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { getTotalContactsCount } from '../services/contacts';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THEME = '#7c3aed';
const THEME_LIGHT = '#f5f3ff';

function SummaryCard({ title, value, icon, color, backgroundColor }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor }]}>
      <View style={styles.summaryCardGlow} />
      <View style={styles.summaryTopRow}>
        <View style={[styles.summaryIconWrap, { backgroundColor: color }]}>
          <Ionicons name={icon} size={24} color="#fff" />
        </View>
        <Ionicons name="trending-up-outline" size={18} color="rgba(15, 23, 42, 0.45)" />
      </View>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function FeedbackHomeScreen({ navigation }) {
  const [displayedDate, setDisplayedDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [totalContacts, setTotalContacts] = useState(0);
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
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const moveMonth = (offset) => {
    setDisplayedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const loadSummary = async () => {
    try {
      const count = await getTotalContactsCount();
      setTotalContacts(count);
    } catch (error) {
      console.error('FeedbackHome summary error:', error);
    }
  };

  useEffect(() => { loadSummary(); }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => loadSummary());
    return unsubscribe;
  }, [navigation]);

  const handleDatePress = (day) => {
    setSelectedDay(day);
    const selectedDate = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    navigation.navigate('Session', { selectedDate, nextScreen: 'FeedbackContacts', themeColor: '#7c3aed', themeBg: '#ede9fe', themeBgPage: '#f5f3ff', canSkipSession: true });
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME_LIGHT} />
      <View style={styles.container}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobMiddle} />
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroMiniBrand}>
                <View style={styles.heroLogoCard}>
                  <Image
                    source={require('../../../../assets/images/cookerp-small.png')}
                    style={styles.heroLogo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.heroMiniLabel}>Dashboard</Text>
              </View>
              <View style={styles.heroActions}>
                <Pressable
                  onPress={() => navigation.navigate('ModulesPage')}
                  style={styles.heroActionButton}
                  hitSlop={10}
                >
                  <Ionicons name="apps-outline" size={20} color="#374151" />
                </Pressable>
              </View>
            </View>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>Feedbacks</Text>
            </View>
            <View style={styles.heroMetaRow}>
              <View style={styles.todayChip}>
                <Ionicons name="calendar-outline" size={14} color={THEME} />
                <Text style={[styles.todayChipText, { color: THEME }]}>
                  {currentDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.summarySection}>
            <SummaryCard
              title="Cached Contacts"
              value={String(totalContacts)}
              icon="people-outline"
              color={THEME}
              backgroundColor={THEME_LIGHT}
            />
            <SummaryCard
              title="Select Date"
              value="↓ Calendar"
              icon="calendar-outline"
              color="#0f766e"
              backgroundColor="#f0fdf4"
            />
          </View>

          <View style={styles.calendarSection}>
            <View style={styles.calendarHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Planner</Text>
                <Text style={styles.sectionTitle}>Calendar</Text>
              </View>
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
              <View style={styles.miniCalendarWeekHeader}>
                {WEEK_DAYS.map((d) => (
                  <View key={d} style={styles.miniCalendarWeekDay}>
                    <Text style={styles.miniCalendarWeekDayText}>{d}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.miniCalendarGrid}>
                {calendarCells.map((day, index) => {
                  if (!day) return <View key={`empty-${index}`} style={styles.miniCalendarDay} />;
                  const isToday = isCurrentDisplayedMonth && day === today;
                  const isSelected = isCurrentDisplayedMonth && day === selectedDay;
                  return (
                    <Pressable
                      key={`day-${day}`}
                      style={styles.miniCalendarDay}
                      onPress={() => handleDatePress(day)}
                    >
                      <View
                        style={[
                          styles.miniCalendarDayCircle,
                          isToday && { borderWidth: 2, borderColor: THEME },
                          isSelected && { backgroundColor: THEME },
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

        <Pressable
          style={[styles.fab, { backgroundColor: THEME }]}
          onPress={() =>
            navigation.navigate('Session', {
              selectedDate: new Date().toISOString().slice(0, 10),
              nextScreen: 'FeedbackContacts',
              themeColor: '#7c3aed',
              themeBg: '#ede9fe',
              themeBgPage: '#f5f3ff',
              canSkipSession: true,
            })
          }
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: THEME_LIGHT },
  container: { flex: 1, backgroundColor: THEME_LIGHT },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#8b5cf6', opacity: 0.12,
  },
  backgroundBlobMiddle: {
    position: 'absolute', top: 180, left: -70,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#7c3aed', opacity: 0.07,
  },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 34 },
  heroCard: {
    backgroundColor: '#fdfcff',
    borderRadius: 28, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.12)',
    shadowColor: '#4c1d95', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  heroMiniBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroLogoCard: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroLogo: { width: 28, height: 28 },
  heroMiniLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', letterSpacing: 0.3 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroActionButton: {
    width: 42, height: 42, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  heroTitleRow: { marginTop: 14 },
  heroTitle: { fontSize: 24, lineHeight: 28, fontWeight: '800', color: '#111827', letterSpacing: 0.1 },
  heroMetaRow: { marginTop: 14, flexDirection: 'row' },
  todayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 999, backgroundColor: '#ede9fe',
  },
  todayChipText: { fontSize: 12, fontWeight: '700' },
  summarySection: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', gap: 12, marginBottom: 28,
  },
  summaryCard: {
    width: '48%', minHeight: 150, borderRadius: 24, padding: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  summaryCardGlow: {
    position: 'absolute', top: -12, right: -12,
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { marginTop: 20, fontSize: 13, fontWeight: '700', color: '#475569' },
  summaryValue: { marginTop: 8, fontSize: 30, fontWeight: '800', color: '#0f172a' },
  sectionEyebrow: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#5b21b6', marginBottom: 4,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  calendarSection: {
    backgroundColor: '#fdfcff', borderRadius: 28, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.10)',
    shadowColor: '#111827', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05, shadowRadius: 20, elevation: 3,
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  calendarNavigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarMonth: { fontSize: 14, fontWeight: '700', color: '#334155', minWidth: 96, textAlign: 'center' },
  calendarNav: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center',
  },
  miniCalendar: { flexDirection: 'column' },
  miniCalendarWeekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  miniCalendarWeekDay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miniCalendarWeekDayText: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  miniCalendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  miniCalendarDay: {
    width: '14.285%', aspectRatio: 1, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 2, marginBottom: 8,
  },
  miniCalendarDayCircle: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  miniCalendarDayText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  bottomSpacing: { height: 80 },
});
