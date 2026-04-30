import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { clearTokens, getTokens } from '../../core/auth';
import { enabledModules } from '../config/modules';

const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com';
const REALM = 'Amrutha';
const CLIENT_ID = 'mobileapp';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });
const LOGOUT_ENDPOINT = `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/logout`;

export default function ModulesPage({ navigation }) {
  const colorScheme = useColorScheme();
  const dangerColor = colorScheme === 'dark' ? '#ff6b6b' : '#d92d20';

  const handleLogout = async () => {
    try {
      const tokens = await getTokens();
      const queryParts = [
        ['client_id', CLIENT_ID],
        ['post_logout_redirect_uri', REDIRECT_URI],
      ];
      if (tokens.idToken) queryParts.push(['id_token_hint', tokens.idToken]);
      const logoutUrl = `${LOGOUT_ENDPOINT}?${queryParts
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
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
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: handleLogout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4ecde" />
      <View style={styles.container}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobBottom} />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroBrandWrap}>
                <View style={styles.heroLogoCard}>
                  <Image
                    source={require('../../../assets/images/cookerp-small.png')}
                    style={styles.heroLogo}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.heroEyebrow}>CookERP Mobile</Text>
                  <Text style={styles.heroTitle}>Apps</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable
                  onPress={() => navigation.navigate('Settings')}
                  style={styles.heroActionButton}
                  hitSlop={10}
                >
                  <Ionicons name="settings-outline" size={20} color="#374151" />
                </Pressable>
                <Pressable onPress={confirmLogout} style={styles.heroLogoutButton} hitSlop={10}>
                  <Ionicons name="log-out-outline" size={18} color={dangerColor} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>Select an app to get started</Text>
          </View>

          <View style={styles.grid}>
            {enabledModules.map((mod) => (
              <Pressable
                key={mod.id}
                style={styles.moduleCard}
                onPress={() => navigation.navigate(mod.homeScreen)}
              >
                <View style={[styles.moduleIconWrap, { backgroundColor: mod.iconBg ?? '#6b7280' }]}>
                  <Ionicons name={mod.icon ?? 'grid-outline'} size={32} color="#fff" />
                </View>
                <Text style={styles.moduleName} numberOfLines={2}>{mod.displayName}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#f4ecde' },
  container: { flex: 1, backgroundColor: '#f4ecde' },
  backgroundBlobTop: {
    position: 'absolute', top: -40, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#f59e0b', opacity: 0.12,
  },
  backgroundBlobBottom: {
    position: 'absolute', bottom: 80, left: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#0f766e', opacity: 0.08,
  },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 34 },
  heroCard: {
    backgroundColor: '#fffaf2',
    borderRadius: 28, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(180, 83, 9, 0.10)',
    shadowColor: '#7c2d12', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  heroBrandWrap: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  heroLogoCard: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroLogo: { width: 36, height: 36 },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#b45309', marginBottom: 2,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroActionButton: {
    width: 42, height: 42, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  heroLogoutButton: {
    width: 42, height: 42, borderRadius: 16,
    backgroundColor: '#fff1f2',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#fecdd3',
  },
  heroSubtitle: { marginTop: 12, fontSize: 14, color: '#6b7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  moduleCard: {
    width: '46%', backgroundColor: '#fffaf2',
    borderRadius: 24, padding: 20,
    alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: 'rgba(180, 83, 9, 0.08)',
    shadowColor: '#111827', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
  },
  moduleIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  moduleName: { fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center' },
  bottomSpacing: { height: 40 },
});
