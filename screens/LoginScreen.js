import { useEffect } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
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
    <View style={styles.container}>
      <Text style={styles.title}>Login with Keycloak</Text>
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  redirectText: {
    marginTop: 12,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
