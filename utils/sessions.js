import * as SQLite from 'expo-sqlite';
import { getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const SESSIONS_TABLE = 'Sessions';
const SESSIONS_ENDPOINT = 'https://amrutha.cookerp.com/genericmodel';

let databasePromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function ensureSessionsTable() {
  const db = await getDatabase();
  await db.execAsync(
    `
      CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT,
        isActive BOOLEAN,
        "order" INTEGER
      );
    `
  );
}

export async function getSessions() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT id, name, isActive, "order" FROM ${SESSIONS_TABLE} ORDER BY "order" ASC;`
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    isActive: Boolean(row.isActive),
    order: row.order,
  }));
}

async function getSessionsCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${SESSIONS_TABLE};`);
  return Number(row?.count ?? 0);
}

function normalizeApiSessions(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
    : Array.isArray(payload?.content)
      ? payload.content
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return list
    .map((item) => ({
      id: item?.id != null ? String(item.id) : null,
      name: item?.name != null ? String(item.name) : null,
      isActive: Boolean(item?.isActive),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : null,
    }))
    .filter((item) => item.id)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

async function fetchSessionsFromApi() {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;
  const queryParams = new URLSearchParams({
    genericType: 'SESSION',
    page: '0',
    size: '100',
  });
  // Log workInfo for debugging; it should contain companyId which is needed for the API call.
  console.log('Unit Id', unitId);

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const response = await fetch(`${SESSIONS_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Sessions API failed with status ${response.status}`);
  }

  const payload = await response.json();
  console.log('[SESSIONS][API][RAW_RESPONSE]', payload);

  const normalizedSessions = normalizeApiSessions(payload);
  console.log('[SESSIONS][API][NORMALIZED_COUNT]', normalizedSessions.length);

  return normalizedSessions;
}

async function replaceSessions(sessions) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${SESSIONS_TABLE};`);

    for (const session of sessions) {
      await db.runAsync(
        `INSERT INTO ${SESSIONS_TABLE} (id, name, isActive, "order") VALUES (?, ?, ?, ?);`,
        session.id,
        session.name,
        session.isActive ? 1 : 0,
        session.order
      );
    }
  });
}

export async function loadSessionsWithInitialSync() {
  await ensureSessionsTable();
  const count = await getSessionsCount();

  if (count === 0) {
    const sessionsFromApi = await fetchSessionsFromApi();
    await replaceSessions(sessionsFromApi);
    return getSessions();
  }

  const localSessions = await getSessions();

  // Safety fallback: if table has rows but query still returns empty, force a refresh sync.
  if (localSessions.length === 0) {
    const sessionsFromApi = await fetchSessionsFromApi();
    await replaceSessions(sessionsFromApi);
    return getSessions();
  }

  return localSessions;
}

export async function refreshSessionsFromApi() {
  await ensureSessionsTable();
  const sessionsFromApi = await fetchSessionsFromApi();
  await replaceSessions(sessionsFromApi);
  return getSessions();
}
