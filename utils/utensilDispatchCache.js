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

  if (!raw) {
    return {};
  }

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
  const contextKey = buildContextKey(context);
  const contextCounts = cache[contextKey];

  return contextCounts && typeof contextCounts === 'object' ? contextCounts : {};
}

export async function setUtensilDispatchCount(context, utensilId, count) {
  const cache = await getCache();
  const contextKey = buildContextKey(context);
  const existingCounts =
    cache[contextKey] && typeof cache[contextKey] === 'object' ? cache[contextKey] : {};

  if (!utensilId) {
    return;
  }

  const nextCount = Math.max(0, Number(count) || 0);

  if (nextCount === 0) {
    delete existingCounts[utensilId];
  } else {
    existingCounts[utensilId] = nextCount;
  }

  cache[contextKey] = existingCounts;
  await setCache(cache);
}

export async function getUtensilDispatchGrandTotal(context) {
  const counts = await getUtensilDispatchCounts(context);
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}
