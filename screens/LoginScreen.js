import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { getTokens, getUserFromIdToken, saveTokens, saveWorkInfo } from '../utils/auth';

WebBrowser.maybeCompleteAuthSession();

// Replace these placeholders with your Keycloak configuration.
const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com'; // KEYCLOAK_DOMAIN
const REALM = 'Amrutha'; // REALM
const CLIENT_ID = 'utracker'; // CLIENT_ID
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });
const DISCOVERY = {
  authorizationEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/token`,
};

export default function LoginScreen({ navigation }) {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid'],
      usePKCE: true,
    },
    DISCOVERY
  );

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

  useEffect(() => {
    const exchangeCodeForTokens = async () => {
      if (!response) {
        return;
      }

      console.log('Authentication result:', response);

      if (response.type !== 'success') {
        return;
      }

      try {
        const code = response.params?.code;
        const codeVerifier = request?.codeVerifier;

        if (!code || !codeVerifier) {
          throw new Error('Missing authorization code or code_verifier.');
        }

        const body = [
          ['grant_type', 'authorization_code'],
          ['client_id', CLIENT_ID],
          ['code', code],
          ['redirect_uri', REDIRECT_URI],
          ['code_verifier', codeVerifier],
        ]
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&');

        const tokenResponse = await fetch(DISCOVERY.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(errorText || 'Token exchange failed.');
        }

        const tokenData = await tokenResponse.json();

        await saveTokens({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          id_token: tokenData.id_token,
        });

          const user = getUserFromIdToken(tokenData.id_token);
          if (user?.preferred_username) {
            try {
              const workInfoResponse = await fetch(
                `https://amrutha.cookerp.com/api/v1/work-information/by-employee-code/${encodeURIComponent(user.preferred_username)}`,
                {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                    Accept: 'application/json',
                  },
                }
              );
              if (workInfoResponse.ok) {
                const workInfoData = await workInfoResponse.json();
                await saveWorkInfo(workInfoData);
              }
            } catch (workInfoError) {
              console.log('Work info fetch error:', workInfoError);
            }
          }

        navigation.replace('Home');
      } catch (error) {
        console.log('Token exchange error:', error);
        Alert.alert('Login Error', 'Unable to complete Keycloak login.');
      }
    };

    exchangeCodeForTokens();
  }, [navigation, request, response]);

  const handleLogin = async () => {
    try {
      const hasPlaceholderConfig =
        KEYCLOAK_DOMAIN === 'YOUR_KEYCLOAK_DOMAIN' ||
        REALM === 'YOUR_REALM' ||
        CLIENT_ID === 'YOUR_CLIENT_ID';

      if (hasPlaceholderConfig) {
        const mockResult = { type: 'success', message: 'Replace Keycloak placeholders to enable real login.' };

        console.log('Authentication result:', mockResult);
        return;
      }

      if (!request) {
        Alert.alert('Login Error', 'Authentication request is still loading. Please try again.');
        return;
      }

      await promptAsync();
    } catch (error) {
      console.log('Authentication error:', error);
      Alert.alert('Login Error', 'Unable to start Keycloak login.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login with Keycloak</Text>
      <Button title="Login" onPress={handleLogin} />
      <Text style={styles.redirectText}>Redirect URI: {REDIRECT_URI}</Text>
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
