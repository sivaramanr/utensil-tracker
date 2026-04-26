import { apiGet } from '../../../core/api/client';
import { getWorkInfo } from '../../../core/auth';
import { getDatabase } from '../../../core/db';

const TABLE = 'DespatchItems';

let ensureTablePromise = null;

export async function ensureDespatchTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          id         TEXT PRIMARY KEY,
          contextKey TEXT NOT NULL,
          despatchDate TEXT NOT NULL,
          sessionId    TEXT NOT NULL,
          customerId   TEXT NOT NULL,
          unitId       TEXT,
          tripNo       INTEGER NOT NULL DEFAULT 1,
          itemId       TEXT NOT NULL,
          itemName     TEXT,
          despatched   REAL NOT NULL DEFAULT 0,
          dcQuantity   REAL NOT NULL DEFAULT 0,
          returned     REAL NOT NULL DEFAULT 0,
          status       TEXT,
          returnedStatus TEXT,
          description  TEXT,
          syncedAt     TEXT NOT NULL
        );
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_despatch_items_context
        ON ${TABLE} (despatchDate, sessionId, customerId, tripNo);
      `);
    })().catch((err) => { ensureTablePromise = null; throw err; });
  }
  await ensureTablePromise;
}

function contextKey(despatchDate, sessionId, customerId, tripNo) {
  return `${despatchDate}|${sessionId}|${customerId}|${tripNo}`;
}

async function fetchFromApi({ despatchDate, sessionId, customerId, tripNo }) {
  const workInfo = await getWorkInfo();
  const unitId = workInfo?.companyId;
  const payload = await apiGet(`/despatch/${customerId}`, {
    params: {
      despatchDate,
      sessionId: String(sessionId),
      unitId:    String(unitId),
      tripNo:    String(tripNo),
    },
    label: 'Despatch items API',
  });
  return {
    unitId: String(unitId),
    data: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
  };
}

async function replaceCache({ despatchDate, sessionId, customerId, unitId, tripNo, data }) {
  const db   = await getDatabase();
  const key  = contextKey(despatchDate, sessionId, customerId, tripNo);
  const now  = new Date().toISOString();

  await db.runAsync(`DELETE FROM ${TABLE} WHERE contextKey = ?;`, [key]);

  for (const entry of Object.values(data)) {
    await db.runAsync(
      `INSERT INTO ${TABLE}
       (id, contextKey, despatchDate, sessionId, customerId, unitId, tripNo,
        itemId, itemName, despatched, dcQuantity, returned,
        status, returnedStatus, description, syncedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.id,
        key,
        despatchDate, String(sessionId), String(customerId), unitId, Number(tripNo),
        String(entry.itemId), entry.itemName ?? null,
        Number(entry.despatched  ?? 0),
        Number(entry.dcQuantity  ?? 0),
        Number(entry.returned    ?? 0),
        entry.status         ?? null,
        entry.returnedStatus ?? null,
        entry.description    ?? null,
        now,
      ]
    );
  }
}

async function readCache({ despatchDate, sessionId, customerId, tripNo }) {
  const db  = await getDatabase();
  const key = contextKey(despatchDate, sessionId, customerId, tripNo);
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLE} WHERE contextKey = ? ORDER BY itemName ASC;`,
    [key]
  );
  return rows.map((r) => ({
    id:             r.id,
    itemId:         r.itemId,
    itemName:       r.itemName,
    despatched:     Number(r.despatched  ?? 0),
    dcQuantity:     Number(r.dcQuantity  ?? 0),
    returned:       Number(r.returned    ?? 0),
    status:         r.status,
    returnedStatus: r.returnedStatus,
    description:    r.description,
  }));
}

export async function getDespatchItems({ despatchDate, sessionId, customerId, tripNo = 1 }) {
  await ensureDespatchTable();
  try {
    const { unitId, data } = await fetchFromApi({ despatchDate, sessionId, customerId, tripNo });
    if (Object.keys(data).length > 0) {
      await replaceCache({ despatchDate, sessionId, customerId, unitId, tripNo, data });
    }
  } catch (error) {
    console.warn('[DESPATCH] API fetch failed, using cache:', error.message);
  }
  return readCache({ despatchDate, sessionId, customerId, tripNo });
}

export async function refreshDespatchItems({ despatchDate, sessionId, customerId, tripNo = 1 }) {
  await ensureDespatchTable();
  const { unitId, data } = await fetchFromApi({ despatchDate, sessionId, customerId, tripNo });
  await replaceCache({ despatchDate, sessionId, customerId, unitId, tripNo, data });
  return readCache({ despatchDate, sessionId, customerId, tripNo });
}

export async function getDashboardSummary() {
  await ensureDespatchTable();
  const db  = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT
       COUNT(*)                                               AS total,
       SUM(CASE WHEN status != 'APPROVED' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status  = 'APPROVED' THEN 1 ELSE 0 END) AS despatched
     FROM ${TABLE} WHERE despatched > 0;`
  );
  return {
    total:      Number(row?.total      ?? 0),
    pending:    Number(row?.pending    ?? 0),
    despatched: Number(row?.despatched ?? 0),
  };
}
