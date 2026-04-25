import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'utensil_dispatch_counts_v1';

function buildContextKey({ orderDate, sessionId, customerId, sessionName, customerName }) {
  const safeDate = orderDate ?? 'unknown-date';
  const safeSession = sessionId ?? sessionName ?? 'unknown-session';
  const safeCustomer = customerId ?? customerName ?? 'unknown-customer';
  return `${safeDate}|${String(safeSession)}|${String(safeCustomer)}`;
}

async function getCache() {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function setCache(cache) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function getUtensilDispatchCounts(context) {
  const cache = await getCache();
  const contextCounts = cache[buildContextKey(context)];
  return contextCounts && typeof contextCounts === 'object' ? contextCounts : {};
}

export async function setUtensilDispatchCount(context, utensilId, count) {
  if (!utensilId) return;
  const cache = await getCache();
  const contextKey = buildContextKey(context);
  const existing = cache[contextKey] && typeof cache[contextKey] === 'object' ? cache[contextKey] : {};
  const next = Math.max(0, Number(count) || 0);
  if (next === 0) {
    delete existing[utensilId];
  } else {
    existing[utensilId] = next;
  }
  cache[contextKey] = existing;
  await setCache(cache);
}

export async function getUtensilDispatchGrandTotal(context) {
  const counts = await getUtensilDispatchCounts(context);
  return Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0);
}
