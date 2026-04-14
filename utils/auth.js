import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ID_TOKEN_KEY = 'id_token';

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

const WORK_INFO_KEY = 'WorkInfo';

export async function saveWorkInfo(workInfo) {
  await AsyncStorage.setItem(WORK_INFO_KEY, JSON.stringify(workInfo));
}

export async function getWorkInfo() {
  const raw = await AsyncStorage.getItem(WORK_INFO_KEY);
  return raw ? JSON.parse(raw) : null;
}
