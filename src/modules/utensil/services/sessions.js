import { getDatabase } from '../../../core/db';
import { apiGet } from '../../../core/api/client';
import { normalizeApiList } from '../../../core/utils/normalize';

const SESSIONS_TABLE = 'Sessions';

export async function ensureSessionsTable() {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
      id TEXT PRIMARY KEY,
      name TEXT,
      isActive BOOLEAN,
      "order" INTEGER
    );
  `);
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

function normalizeSessions(payload) {
  return normalizeApiList(payload)
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
  const payload = await apiGet('/genericmodel', {
    params: { genericType: 'SESSION', page: '0', size: '100' },
    label: 'Sessions API',
  });
  const normalized = normalizeSessions(payload);
  console.log('[SESSIONS][API][NORMALIZED_COUNT]', normalized.length);
  return normalized;
}

async function replaceSessions(sessions) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${SESSIONS_TABLE};`);
    for (const session of sessions) {
      await db.runAsync(
        `INSERT INTO ${SESSIONS_TABLE} (id, name, isActive, "order") VALUES (?, ?, ?, ?);`,
        session.id, session.name, session.isActive ? 1 : 0, session.order
      );
    }
  });
}

export async function loadSessionsWithInitialSync() {
  await ensureSessionsTable();
  const count = await getSessionsCount();
  if (count > 0) {
    const local = await getSessions();
    if (local.length > 0) return local;
  }
  const fromApi = await fetchSessionsFromApi();
  await replaceSessions(fromApi);
  return getSessions();
}

export async function refreshSessionsFromApi() {
  await ensureSessionsTable();
  const fromApi = await fetchSessionsFromApi();
  await replaceSessions(fromApi);
  return getSessions();
}
