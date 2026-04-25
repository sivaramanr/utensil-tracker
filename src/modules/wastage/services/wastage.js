import { apiGet, apiPost } from '../../../core/api/client';
import { getDatabase } from '../../../core/db';

const WASTAGE_TABLE = 'WastageEntries';

const SYNC_STATUS = {
  LOCAL_ONLY: 'LOCAL_ONLY',
  CHANGED: 'CHANGED',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
};

let ensureWastageTablePromise = null;

export async function ensureWastageTable() {
  if (!ensureWastageTablePromise) {
    ensureWastageTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${WASTAGE_TABLE} (
          id TEXT PRIMARY KEY,
          contextKey TEXT NOT NULL,
          orderDate TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          itemId TEXT NOT NULL,
          menuPlanItemId TEXT,
          itemName TEXT,
          wastedQuantity REAL NOT NULL DEFAULT 0,
          reason TEXT,
          isApproved INTEGER NOT NULL DEFAULT 0,
          syncStatus TEXT NOT NULL DEFAULT '${SYNC_STATUS.LOCAL_ONLY}',
          serverId TEXT,
          payloadJson TEXT,
          syncedAt TEXT,
          localUpdatedAt TEXT NOT NULL
        );
      `);
      // Migration: add serverId column to existing installs
      try {
        const cols = await db.getAllAsync(`PRAGMA table_info(${WASTAGE_TABLE})`);
        if (cols && !cols.some((c) => c.name === 'serverId')) {
          await db.runAsync(`ALTER TABLE ${WASTAGE_TABLE} ADD COLUMN serverId TEXT;`);
        }
      } catch {
        // column already exists or table not ready yet
      }
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_wastage_context
        ON ${WASTAGE_TABLE} (orderDate, sessionId, customerId);
      `);
    })().catch((err) => { ensureWastageTablePromise = null; throw err; });
  }
  await ensureWastageTablePromise;
}

function makeId(orderDate, sessionId, customerId, itemId) {
  return `${orderDate}|${sessionId}|${customerId}|${itemId}`;
}

async function fetchWastageEntriesFromApi({ orderDate, sessionId, customerId }) {
  const payload = await apiGet('/wastage/entries', {
    params: { orderDate, sessionId: String(sessionId), customerId: String(customerId) },
    label: 'Wastage entries API',
  });
  return Array.isArray(payload) ? payload
    : Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.content) ? payload.content
    : Array.isArray(payload?.data) ? payload.data
    : [];
}

async function upsertServerEntries(serverList, { orderDate, sessionId, customerId }) {
  const db = await getDatabase();
  const syncedAt = new Date().toISOString();
  for (const item of serverList) {
    const itemId = String(item.itemId);
    const id = makeId(orderDate, String(sessionId), String(customerId), itemId);
    const contextKey = `${orderDate}|${sessionId}|${customerId}`;
    await db.runAsync(
      `INSERT INTO ${WASTAGE_TABLE}
       (id, contextKey, orderDate, sessionId, customerId, itemId, menuPlanItemId,
        wastedQuantity, reason, isApproved, syncStatus, serverId, syncedAt, localUpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         wastedQuantity = excluded.wastedQuantity,
         reason = excluded.reason,
         isApproved = excluded.isApproved,
         syncStatus = excluded.syncStatus,
         serverId = excluded.serverId,
         syncedAt = excluded.syncedAt
       WHERE syncStatus != '${SYNC_STATUS.LOCAL_ONLY}';`,
      [id, contextKey, orderDate, String(sessionId), String(customerId),
       itemId, item.menuPlanItemId ? String(item.menuPlanItemId) : null,
       Number(item.wastedQuantity ?? 0), item.reason ?? null,
       item.isApproved ? 1 : 0,
       item.syncStatus ?? SYNC_STATUS.SUBMITTED,
       item.id ? String(item.id) : null,
       syncedAt, syncedAt]
    );
  }
}

export async function getWastageEntries({ orderDate, sessionId, customerId }) {
  await ensureWastageTable();
  try {
    const serverList = await fetchWastageEntriesFromApi({ orderDate, sessionId, customerId });
    if (serverList.length > 0) {
      await upsertServerEntries(serverList, { orderDate, sessionId, customerId });
    }
  } catch (error) {
    console.warn('[WASTAGE] Server sync failed, using local data:', error.message);
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${WASTAGE_TABLE}
     WHERE orderDate = ? AND sessionId = ? AND customerId = ?
     ORDER BY itemName ASC;`,
    [orderDate, String(sessionId), String(customerId)]
  );
  return rows.map(mapRow);
}

export async function getAllWastageEntries() {
  await ensureWastageTable();
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${WASTAGE_TABLE} ORDER BY localUpdatedAt DESC;`
  );
  return rows.map(mapRow);
}

export async function setWastedQuantity({ orderDate, sessionId, customerId, itemId, menuPlanItemId, itemName, quantity, reason }) {
  await ensureWastageTable();
  const db = await getDatabase();
  const id = makeId(orderDate, sessionId, customerId, itemId);
  const contextKey = `${orderDate}|${sessionId}|${customerId}`;
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO ${WASTAGE_TABLE}
     (id, contextKey, orderDate, sessionId, customerId, itemId, menuPlanItemId,
      itemName, wastedQuantity, reason, isApproved, syncStatus, localUpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '${SYNC_STATUS.LOCAL_ONLY}', ?)
     ON CONFLICT(id) DO UPDATE SET
       wastedQuantity = excluded.wastedQuantity,
       reason = excluded.reason,
       syncStatus = CASE
         WHEN syncStatus IN ('${SYNC_STATUS.SUBMITTED}', '${SYNC_STATUS.APPROVED}')
              AND (wastedQuantity != excluded.wastedQuantity
                   OR COALESCE(reason, '') != COALESCE(excluded.reason, ''))
           THEN '${SYNC_STATUS.CHANGED}'
         WHEN syncStatus = '${SYNC_STATUS.CHANGED}'
           THEN '${SYNC_STATUS.CHANGED}'
         WHEN syncStatus IN ('${SYNC_STATUS.SUBMITTED}', '${SYNC_STATUS.APPROVED}')
           THEN syncStatus
         ELSE '${SYNC_STATUS.LOCAL_ONLY}'
       END,
       localUpdatedAt = excluded.localUpdatedAt;`,
    [id, contextKey, orderDate, String(sessionId), String(customerId),
     String(itemId), menuPlanItemId ? String(menuPlanItemId) : null,
     itemName, Number(quantity ?? 0), reason ?? null, now]
  );
}

export async function submitWastageEntries({ orderDate, sessionId, customerId }) {
  await ensureWastageTable();
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${WASTAGE_TABLE}
     WHERE orderDate = ? AND sessionId = ? AND customerId = ?
       AND syncStatus IN ('${SYNC_STATUS.LOCAL_ONLY}', '${SYNC_STATUS.CHANGED}')
       AND wastedQuantity > 0;`,
    [orderDate, String(sessionId), String(customerId)]
  );
  if (!rows.length) return;

  const entries = rows.map((r) => ({
    itemId: r.itemId,
    menuPlanItemId: r.menuPlanItemId ?? null,
    wastedQuantity: Number(r.wastedQuantity ?? 0),
    reason: r.reason ?? null,
  }));

  await apiPost(
    '/wastage/submit',
    { orderDate, sessionId: String(sessionId), customerId: String(customerId), entries },
    { label: 'Wastage submit API' }
  );

  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE ${WASTAGE_TABLE}
     SET syncStatus = '${SYNC_STATUS.SUBMITTED}', syncedAt = ?
     WHERE orderDate = ? AND sessionId = ? AND customerId = ?
       AND syncStatus IN ('${SYNC_STATUS.LOCAL_ONLY}', '${SYNC_STATUS.CHANGED}')
       AND wastedQuantity > 0;`,
    [now, orderDate, String(sessionId), String(customerId)]
  );
}

export async function approveWastageEntries(entryIds) {
  if (!entryIds?.length) return;
  await ensureWastageTable();
  const db = await getDatabase();
  const placeholders = entryIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync(
    `SELECT id, serverId FROM ${WASTAGE_TABLE} WHERE id IN (${placeholders});`,
    entryIds
  );

  // Prefer server-assigned ID; fall back to local composite ID
  const serverIds = rows.map((r) => r.serverId ?? r.id);

  await apiPost('/wastage/approve', { entryIds: serverIds }, { label: 'Wastage approve API' });

  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE ${WASTAGE_TABLE}
     SET syncStatus = '${SYNC_STATUS.APPROVED}', isApproved = 1, syncedAt = ?
     WHERE id IN (${placeholders});`,
    [now, ...entryIds]
  );
}

export async function getDashboardSummary() {
  await ensureWastageTable();
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN isApproved = 0 AND syncStatus != '${SYNC_STATUS.LOCAL_ONLY}' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN isApproved = 1 THEN 1 ELSE 0 END) AS approved
     FROM ${WASTAGE_TABLE}
     WHERE wastedQuantity > 0;`
  );
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    approved: Number(row?.approved ?? 0),
  };
}

function mapRow(row) {
  return {
    id: row.id,
    contextKey: row.contextKey,
    orderDate: row.orderDate,
    sessionId: row.sessionId,
    customerId: row.customerId,
    itemId: row.itemId,
    menuPlanItemId: row.menuPlanItemId,
    itemName: row.itemName,
    wastedQuantity: Number(row.wastedQuantity ?? 0),
    reason: row.reason,
    isApproved: Boolean(row.isApproved),
    syncStatus: row.syncStatus,
    serverId: row.serverId,
    syncedAt: row.syncedAt,
    localUpdatedAt: row.localUpdatedAt,
  };
}
