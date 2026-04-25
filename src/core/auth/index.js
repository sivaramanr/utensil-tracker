import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ID_TOKEN_KEY = 'id_token';
const WORK_INFO_KEY = 'WorkInfo';

const KEYCLOAK_DOMAIN = 'amruthaauth.cookerp.com';
const REALM = 'Amrutha';
const CLIENT_ID = 'utracker';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'utensiltracker', path: 'redirect' });

const DISCOVERY = {
  authorizationEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/token`,
};

const WORK_INFO_ENDPOINT = 'https://amrutha.cookerp.com/api/v1/work-information/by-employee-code';
const LOGOUT_ENDPOINT = `https://${KEYCLOAK_DOMAIN}/realms/${REALM}/protocol/openid-connect/logout`;

let unauthorizedPromptPromise = null;

WebBrowser.maybeCompleteAuthSession();

// ─── Token storage ───────────────────────────────────────────────────────────

export async function saveTokens({ access_token, refresh_token, id_token }) {
  await Promise.all([
    access_token ? SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access_token) : Promise.resolve(),
    refresh_token ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh_token) : Promise.resolve(),
    id_token ? SecureStore.setItemAsync(ID_TOKEN_KEY, id_token) : Promise.resolve(),
  ]);
}

export async function getTokens() {
  const [accessToken, refreshToken, idToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(ID_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken, idToken };
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

// ─── Work info ───────────────────────────────────────────────────────────────

export async function saveWorkInfo(workInfo) {
  await AsyncStorage.setItem(WORK_INFO_KEY, JSON.stringify(workInfo));
}

export async function getWorkInfo() {
  const raw = await AsyncStorage.getItem(WORK_INFO_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ─── Token decoding ──────────────────────────────────────────────────────────

function base64UrlDecode(input) {
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
    if (enc3 !== 64) str += String.fromCharCode(chr2);
    if (enc4 !== 64) str += String.fromCharCode(chr3);
  }

  try {
    return decodeURIComponent(
      str.split('').map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`).join('')
    );
  } catch {
    return str;
  }
}

export function decodeIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (error) {
    console.log('Decode id_token error:', error);
    return null;
  }
}

export function getUserFromIdToken(idToken) {
  const decoded = decodeIdToken(idToken) || {};
  return {
    preferred_username: decoded.preferred_username || decoded.name || null,
    email:              decoded.email              || null,
    family_name:        decoded.family_name        || null,
  };
}

// ─── Keycloak login ───────────────────────────────────────────────────────────

export function isKeycloakConfigured() {
  return (
    KEYCLOAK_DOMAIN !== 'YOUR_KEYCLOAK_DOMAIN' &&
    REALM !== 'YOUR_REALM' &&
    CLIENT_ID !== 'YOUR_CLIENT_ID'
  );
}

async function fetchAndSaveWorkInfo(accessToken, idToken) {
  const user = getUserFromIdToken(idToken);
  if (!user?.preferred_username) return;

  try {
    const response = await fetch(
      `${WORK_INFO_ENDPOINT}/${encodeURIComponent(user.preferred_username)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      }
    );
    if (!response.ok) return;
    const workInfoData = await response.json();
    await saveWorkInfo(workInfoData);
  } catch (error) {
    console.log('Work info fetch error:', error);
  }
}

export async function startKeycloakLogin() {
  if (!isKeycloakConfigured()) {
    console.log('Authentication result:', { type: 'mock', message: 'Keycloak not configured.' });
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

  if (response.type !== 'success') return false;

  const code = response.params?.code;
  const codeVerifier = request.codeVerifier;
  if (!code || !codeVerifier) throw new Error('Missing authorization code or code_verifier.');

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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

export async function buildLogoutUrl() {
  const tokens = await getTokens();
  const queryParts = [
    ['client_id', CLIENT_ID],
    ['post_logout_redirect_uri', REDIRECT_URI],
  ];
  if (tokens.idToken) queryParts.push(['id_token_hint', tokens.idToken]);
  return `${LOGOUT_ENDPOINT}?${queryParts
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`;
}

// ─── Auth error handling ──────────────────────────────────────────────────────

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
