import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { getStockUpdatesForRange } from '../services/stocks';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THEME = '#4f46e5';
const THEME_BG = '#eef2ff';
const THEME_BG_PAGE = '#f5f3ff';

function SummaryCard({ title, value, icon, color, backgroundColor }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor }]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function StocksHomeScreen({ navigation }) {
  const [displayedDate, setDisplayedDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [markedDates, setMarkedDates] = useState({});
  const [summary, setSummary] = useState({ total: 0, completed: 0, pending: 0 });

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

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const loadMonthData = useCallback(async (force = false) => {
    try {
      const items = await getStockUpdatesForRange({ startDate, endDate, forceRefresh: force });
      const map = {};
      let completed = 0;
      let pending = 0;
      for (const item of items) {
        map[item.stockUpdateDate] = { id: item.id, status: item.status };
        if (item.status === 'COMPLETED') completed++;
        else pending++;
      }
      setMarkedDates(map);
      setSummary({ total: items.length, completed, pending });
    } catch (error) {
      console.error('[STOCKS] Error loading month data:', error);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadMonthData(); }, [loadMonthData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => loadMonthData());
    return unsubscribe;
  }, [navigation, loadMonthData]);

  const moveMonth = (offset) => {
    setDisplayedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const handleDatePress = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDateStr(dateStr);
    const entry = markedDates[dateStr];
    navigation.navigate('StocksDetail', {
      selectedDate: dateStr,
      stockUpdateId: entry?.id ?? null,
      stockStatus: entry?.status ?? null,
    });
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME_BG_PAGE} />
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
              <Text style={styles.heroTitle}>Stocks</Text>
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
              title="Total Entries"
              value={String(summary.total)}
              icon="layers-outline"
              color={THEME}
              backgroundColor={THEME_BG}
            />
            <SummaryCard
              title="Completed"
              value={String(summary.completed)}
              icon="checkmark-circle-outline"
              color="#10b981"
              backgroundColor="#ecfdf5"
            />
            <SummaryCard
              title="Pending"
              value={String(summary.pending)}
              icon="time-outline"
              color="#f59e0b"
              backgroundColor="#fffbeb"
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
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = selectedDateStr === dateStr;
                  const entryStatus = markedDates[dateStr]?.status;
                  const isCompleted = entryStatus === 'COMPLETED';
                  const isNew = entryStatus === 'NEW';

                  return (
                    <Pressable key={`day-${day}`} style={styles.miniCalendarDay} onPress={() => handleDatePress(day)}>
                      <View
                        style={[
                          styles.miniCalendarDayCircle,
                          isToday && styles.todayCircle,
                          isSelected && styles.selectedCircle,
                          !isSelected && isCompleted && styles.completedCircle,
                          !isSelected && isNew && styles.newCircle,
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniCalendarDayText,
                            isSelected && styles.selectedDayText,
                            !isSelected && isCompleted && styles.completedDayText,
                            !isSelected && isNew && styles.newDayText,
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                      {!isSelected && (isCompleted || isNew) && (
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: isCompleted ? '#10b981' : '#f59e0b' },
                          ]}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.legendText}>Completed</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.legendText}>Pending</Text>
              </View>
            </View>
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>

        <Pressable
          style={[styles.fab, { backgroundColor: THEME }]}
          onPress={() => {
            const today = new Date().toISOString().slice(0, 10);
            const entry = markedDates[today];
            navigation.navigate('StocksDetail', {
              selectedDate: today,
              stockUpdateId: entry?.id ?? null,
              stockStatus: entry?.status ?? null,
            });
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: THEME_BG_PAGE },
  container: { flex: 1, backgroundColor: THEME_BG_PAGE },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#4f46e5', opacity: 0.10,
  },
  backgroundBlobMiddle: {
    position: 'absolute', top: 180, left: -70,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#818cf8', opacity: 0.07,
  },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 34 },
  heroCard: {
    backgroundColor: '#fafafe',
    borderRadius: 28, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.15)',
    shadowColor: '#3730a3', shadowOffset: { width: 0, height: 10 },
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
    borderRadius: 999, backgroundColor: '#e0e7ff',
  },
  todayChipText: { fontSize: 12, fontWeight: '700' },
  summarySection: {
    flexDirection: 'column', gap: 10, marginBottom: 28,
  },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  summaryIconWrap: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#475569' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sectionEyebrow: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#3730a3', marginBottom: 4,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  calendarSection: {
    backgroundColor: '#fafafe', borderRadius: 28, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.12)',
    shadowColor: '#111827', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05, shadowRadius: 20, elevation: 3,
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  calendarNavigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarMonth: {
    fontSize: 14, fontWeight: '700', color: '#334155',
    minWidth: 96, textAlign: 'center',
  },
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
  todayCircle: { borderWidth: 2, borderColor: THEME },
  selectedCircle: { backgroundColor: THEME },
  completedCircle: { backgroundColor: '#dcfce7' },
  newCircle: { backgroundColor: '#fef3c7' },
  miniCalendarDayText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  selectedDayText: { color: '#fff', fontWeight: '700' },
  completedDayText: { color: '#065f46', fontWeight: '700' },
  newDayText: { color: '#92400e', fontWeight: '700' },
  statusDot: {
    position: 'absolute', bottom: 3,
    width: 5, height: 5, borderRadius: 3,
  },
  legend: {
    flexDirection: 'row', gap: 20, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  bottomSpacing: { height: 80 },
});
