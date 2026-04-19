import { useEffect } from 'react';
import { Alert, Image, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { getTokens, isKeycloakConfigured, startKeycloakLogin } from '../utils/auth';

export default function LoginScreen({ navigation }) {
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const tokens = await getTokens();
        if (tokens.accessToken) {
          navigation.replace('Home');
        }
      } catch (error) {
        console.log('Session check error:', error);
      }
    };

    checkExistingSession();
  }, [navigation]);

  const handleLogin = async () => {
    try {
      if (!isKeycloakConfigured()) {
        console.log('Authentication result:', {
          type: 'success',
          message: 'Replace Keycloak placeholders to enable real login.',
        });
        return;
      }

      const isLoggedIn = await startKeycloakLogin();
      if (isLoggedIn) {
        navigation.replace('Home');
      }
    } catch (error) {
      console.log('Authentication error:', error);
      Alert.alert('Login Error', 'Unable to start Keycloak login.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6efe2" />
      <View style={styles.container}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobBottom} />

        <View style={styles.heroSection}>
          <View style={styles.logoCard}>
            <Image
              source={require('../assets/images/cookerp-small.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.eyebrow}>Cookerp Operations</Text>
          <Text style={styles.title}>Utensil Tracker</Text>
          <Text style={styles.subtitle}>
            Track despatches, returns, and approvals across daily customer sessions.
          </Text>
        </View>

        <View style={styles.signInCard}>
          <Text style={styles.cardTitle}>Secure Sign In</Text>
          <Text style={styles.cardText}>
            Continue with your organization account to open the dashboard and start working.
          </Text>

          <Pressable style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Continue with Keycloak</Text>
          </Pressable>

          <Text style={styles.helperText}>
            You will be redirected to the secure authentication page and returned here automatically.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6efe2',
  },
  container: {
    flex: 1,
    backgroundColor: '#f6efe2',
    paddingHorizontal: 24,
    paddingVertical: 28,
    justifyContent: 'space-between',
  },
  backgroundBlobTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#f59e0b',
    opacity: 0.12,
  },
  backgroundBlobBottom: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0f766e',
    opacity: 0.1,
  },
  heroSection: {
    paddingTop: 32,
  },
  logoCard: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: '#fffaf0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c2d12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  logo: {
    width: 58,
    height: 58,
  },
  eyebrow: {
    marginTop: 24,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#b45309',
  },
  title: {
    marginTop: 10,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 24,
    color: '#4b5563',
    maxWidth: 320,
  },
  signInCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.10)',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  cardText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#6b7280',
  },
  loginButton: {
    marginTop: 22,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  helperText: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
});
