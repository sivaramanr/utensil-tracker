import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';
import { clearTokens, getTokens } from '../utils/auth';

const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com';
const REALM = 'Amrutha';
const CLIENT_ID = 'utracker';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });
const LOGOUT_ENDPOINT = `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/logout`;
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HomeScreen({ navigation }) {
  const [displayedDate, setDisplayedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const colorScheme = useColorScheme();
  const dangerColor = colorScheme === 'dark' ? '#ff6b6b' : '#d92d20';
  const themeTint = Colors[colorScheme ?? 'light'].tint;
  const currentDate = new Date();
  const year = displayedDate.getFullYear();
  const month = displayedDate.getMonth();
  const today = currentDate.getDate();
  const isCurrentDisplayedMonth =
    year === currentDate.getFullYear() && month === currentDate.getMonth();
  const monthTitle = displayedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDayIndex }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const moveMonth = (offset) => {
    setDisplayedDate((prevDate) => new Date(prevDate.getFullYear(), prevDate.getMonth() + offset, 1));
  };

  const moveYear = (offset) => {
    setDisplayedDate((prevDate) => new Date(prevDate.getFullYear() + offset, prevDate.getMonth(), 1));
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
      headerLeft: () => (
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsButton} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color="#374151" />
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={confirmLogout} style={styles.logoutButton} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={dangerColor} />
        </Pressable>
      ),
    });
  }, [dangerColor, navigation]);

  const handleDatePress = (day) => {
    const selectedDate = new Date(year, month, day);
    const formattedDate = selectedDate.toISOString().slice(0, 10);

    navigation.navigate('Session', { selectedDate: formattedDate });
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthControlRow}>
        <Pressable style={styles.monthButton} onPress={() => moveYear(-1)} hitSlop={8}>
          <Ionicons name="play-back" size={18} color="#374151" />
        </Pressable>

        <Pressable style={styles.monthButton} onPress={() => moveMonth(-1)} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>

        <Text style={styles.monthTitle}>{monthTitle}</Text>

        <Pressable style={styles.monthButton} onPress={() => moveMonth(1)} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </Pressable>

        <Pressable style={styles.monthButton} onPress={() => moveYear(1)} hitSlop={8}>
          <Ionicons name="play-forward" size={18} color="#374151" />
        </Pressable>
      </View>

      <View style={styles.calendarContainer}>
        {WEEK_DAYS.map((dayName) => (
          <View key={dayName} style={styles.weekDayCell}>
            <Text style={styles.weekDayText}>{dayName}</Text>
          </View>
        ))}

        {calendarCells.map((day, index) => {
          if (!day) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          return (
            <Pressable key={`day-${day}`} style={styles.dayCell} onPress={() => handleDatePress(day)}>
              <View
                style={[
                  styles.dayCircle,
                  isCurrentDisplayedMonth && day === today && styles.todayCircle,
                  isCurrentDisplayedMonth && day === today && { borderColor: themeTint },
                ]}
              >
                <Text style={styles.dayText}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 180,
    textAlign: 'center',
  },
  monthControlRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  calendarContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekDayCell: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircle: {
    borderWidth: 2,
  },
  dayText: {
    fontSize: 16,
  },
  logoutButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  settingsButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
