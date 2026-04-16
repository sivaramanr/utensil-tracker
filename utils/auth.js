import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ID_TOKEN_KEY = 'id_token';
const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com';
const REALM = 'Amrutha';
const CLIENT_ID = 'utracker';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });
const DISCOVERY = {
  authorizationEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/token`,
};
const WORK_INFO_ENDPOINT = 'https://amrutha.cookerp.com/api/v1/work-information/by-employee-code';

let unauthorizedPromptPromise = null;

WebBrowser.maybeCompleteAuthSession();

export async function saveTokens({ access_token, refresh_token, id_token }) {
  if (access_token) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access_token);
  }

  if (refresh_token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh_token);
  }

  if (id_token) {
    await SecureStore.setItemAsync(ID_TOKEN_KEY, id_token);
  }
}

export async function getTokens() {
  const [accessToken, refreshToken, idToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(ID_TOKEN_KEY),
  ]);

  return {
    accessToken,
    refreshToken,
    idToken,
  };
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ID_TOKEN_KEY),
  ]);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function isKeycloakConfigured() {
  return (
    KEYCLOAK_DOMAIN !== 'YOUR_KEYCLOAK_DOMAIN' &&
    REALM !== 'YOUR_REALM' &&
    CLIENT_ID !== 'YOUR_CLIENT_ID'
  );
}

function base64UrlDecode(input) {
  // Convert from base64url to base64, then decode manually.
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  let str = '';
  let i = 0;

  while (i < padded.length) {
    const enc1 = chars.indexOf(padded.charAt(i++));
    const enc2 = chars.indexOf(padded.charAt(i++));
    const enc3 = chars.indexOf(padded.charAt(i++));
    const enc4 = chars.indexOf(padded.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    str += String.fromCharCode(chr1);

    if (enc3 !== 64) {
      str += String.fromCharCode(chr2);
    }

    if (enc4 !== 64) {
      str += String.fromCharCode(chr3);
    }
  }

  try {
    return decodeURIComponent(
      str
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
  } catch {
    return str;
  }
}

export function decodeIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }

  try {
    const parts = idToken.split('.');
    if (parts.length < 2) {
      return null;
    }

    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload);
  } catch (error) {
    console.log('Decode id_token error:', error);
    return null;
  }
}

export function getUserFromIdToken(idToken) {
  const decoded = decodeIdToken(idToken) || {};

  return {
    preferred_username: decoded.preferred_username || decoded.name || null,
    email: decoded.email || null,
  };
}

async function fetchAndSaveWorkInfo(accessToken, idToken) {
  const user = getUserFromIdToken(idToken);

  if (!user?.preferred_username) {
    return;
  }

  try {
    const workInfoResponse = await fetch(
      `${WORK_INFO_ENDPOINT}/${encodeURIComponent(user.preferred_username)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!workInfoResponse.ok) {
      return;
    }

    const workInfoData = await workInfoResponse.json();
    await saveWorkInfo(workInfoData);
  } catch (error) {
    console.log('Work info fetch error:', error);
  }
}

export async function startKeycloakLogin() {
  if (!isKeycloakConfigured()) {
    const mockResult = {
      type: 'success',
      message: 'Replace Keycloak placeholders to enable real login.',
    };

    console.log('Authentication result:', mockResult);
    return false;
  }

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    scopes: ['openid'],
    usePKCE: true,
  });

  const response = await request.promptAsync(DISCOVERY);
  console.log('Authentication result:', response);

  if (response.type !== 'success') {
    return false;
  }

  const code = response.params?.code;
  const codeVerifier = request.codeVerifier;

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

  await fetchAndSaveWorkInfo(tokenData.access_token, tokenData.id_token);

  return true;
}

export class UnauthorizedApiError extends Error {
  constructor(message = 'Unauthorized API request.') {
    super(message);
    this.name = 'UnauthorizedApiError';
  }
}

export async function promptLoginAfterUnauthorized() {
  if (unauthorizedPromptPromise) {
    await unauthorizedPromptPromise;
    return;
  }

  unauthorizedPromptPromise = new Promise((resolve) => {
    Alert.alert('Session Expired', 'Your session has expired. Please login again.', [
      {
        text: 'Ok',
        onPress: () => {
          void (async () => {
            try {
              await clearTokens();
              await startKeycloakLogin();
            } catch (error) {
              console.log('Re-login error:', error);
              Alert.alert('Login Error', 'Unable to complete Keycloak login.');
            } finally {
              unauthorizedPromptPromise = null;
              resolve();
            }
          })();
        },
      },
    ]);
  });

  await unauthorizedPromptPromise;
}

export async function ensureAuthorizedResponse(response, requestLabel = 'API request') {
  if (response.status === 401) {
    await promptLoginAfterUnauthorized();
    throw new UnauthorizedApiError(`${requestLabel} failed with status 401`);
  }

  if (!response.ok) {
    throw new Error(`${requestLabel} failed with status ${response.status}`);
  }
}

const WORK_INFO_KEY = 'WorkInfo';

export async function saveWorkInfo(workInfo) {
  await AsyncStorage.setItem(WORK_INFO_KEY, JSON.stringify(workInfo));
}

export async function getWorkInfo() {
  const raw = await AsyncStorage.getItem(WORK_INFO_KEY);
  return raw ? JSON.parse(raw) : null;
}
