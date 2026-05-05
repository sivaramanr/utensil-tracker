import { apiGet, apiPost } from '../../../core/api/client';
import { getWorkInfo } from '../../../core/auth';
import { getDatabase } from '../../../core/db';

// ─── Stock Updates table ────────────────────────────────────────────────────

const TABLE = 'StockUpdates';
const RM_TABLE = 'StockRawMaterials';
const RM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let ensureTablePromise = null;
let ensureRMTablePromise = null;

// In-memory cache for lastDayClosed (short-lived, session scope)
let lastDayClosedCache = null;
let lastDayClosedFetchedAt = null;

export async function ensureStocksTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          id              INTEGER PRIMARY KEY,
          stockUpdateDate TEXT NOT NULL,
          status          TEXT,
          updatedBy       TEXT,
          syncedAt        TEXT NOT NULL
        );
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_stock_updates_date
        ON ${TABLE} (stockUpdateDate);
      `);
    })().catch((err) => { ensureTablePromise = null; throw err; });
  }
  await ensureTablePromise;
}

async function ensureRMTable() {
  if (!ensureRMTablePromise) {
    ensureRMTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${RM_TABLE} (
          rawMaterialId      TEXT NOT NULL,
          stockUpdateId      INTEGER NOT NULL,
          rawMaterialCode    TEXT,
          rawMaterialName    TEXT,
          categoryId         TEXT,
          categoryName       TEXT,
          categoryOrder      INTEGER,
          uomName            TEXT,
          lastPurchasedPrice REAL,
          systemQuantity     REAL,
          manualQuantity     REAL,
          isEssential        INTEGER NOT NULL DEFAULT 0,
          syncedAt           TEXT NOT NULL,
          PRIMARY KEY (rawMaterialId, stockUpdateId)
        );
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_stock_rm_update
        ON ${RM_TABLE} (stockUpdateId);
      `);
    })().catch((err) => { ensureRMTablePromise = null; throw err; });
  }
  await ensureRMTablePromise;
}

// ─── Stock Updates (calendar range) ────────────────────────────────────────

async function fetchUpdatesFromApi({ startDate, endDate }) {
  const payload = await apiGet('/stockupdate', {
    params: { startDate, endDate },
    label: 'Stock updates API',
  });
  return Array.isArray(payload) ? payload : [];
}

async function replaceRangeCache({ startDate, endDate, items }) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `DELETE FROM ${TABLE} WHERE stockUpdateDate >= ? AND stockUpdateDate <= ?;`,
    [startDate, endDate]
  );
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO ${TABLE} (id, stockUpdateDate, status, updatedBy, syncedAt)
       VALUES (?, ?, ?, ?, ?);`,
      [item.id, item.stockUpdateDate, item.status ?? null, item.updatedBy ?? null, now]
    );
  }
}

async function readRangeCache({ startDate, endDate }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${TABLE}
     WHERE stockUpdateDate >= ? AND stockUpdateDate <= ?
     ORDER BY stockUpdateDate ASC;`,
    [startDate, endDate]
  );
  return rows.map((r) => ({
    id: r.id,
    stockUpdateDate: r.stockUpdateDate,
    status: r.status,
    updatedBy: r.updatedBy,
  }));
}

export async function getStockUpdatesForRange({ startDate, endDate, forceRefresh = false }) {
  await ensureStocksTable();
  if (!forceRefresh) {
    const cached = await readRangeCache({ startDate, endDate });
    if (cached.length > 0) return cached;
  }
  try {
    const items = await fetchUpdatesFromApi({ startDate, endDate });
    await replaceRangeCache({ startDate, endDate, items });
  } catch (error) {
    console.warn('[STOCKS] API fetch failed, using cache:', error.message);
  }
  return readRangeCache({ startDate, endDate });
}

export async function getStockUpdateByDate(date) {
  await ensureStocksTable();
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT * FROM ${TABLE} WHERE stockUpdateDate = ?;`,
    [date]
  );
  if (!row) return null;
  return { id: row.id, stockUpdateDate: row.stockUpdateDate, status: row.status };
}

// ─── Raw Materials (per stock update, 5-min TTL) ────────────────────────────

async function isRMCacheStale(stockUpdateId) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT syncedAt FROM ${RM_TABLE} WHERE stockUpdateId = ? LIMIT 1;`,
    [stockUpdateId]
  );
  if (!row) return true;
  return Date.now() - new Date(row.syncedAt).getTime() > RM_CACHE_TTL_MS;
}

async function replaceRMCache(stockUpdateId, items) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`DELETE FROM ${RM_TABLE} WHERE stockUpdateId = ?;`, [stockUpdateId]);
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO ${RM_TABLE}
       (rawMaterialId, stockUpdateId, rawMaterialCode, rawMaterialName,
        categoryId, categoryName, categoryOrder, uomName,
        lastPurchasedPrice, systemQuantity, manualQuantity, isEssential, syncedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        String(item.rawMaterialId),
        stockUpdateId,
        item.rawMaterialCode ?? null,
        item.rawMaterialName ?? null,
        item.categoryId ?? null,
        item.categoryName ?? null,
        item.categoryOrder ?? null,
        item.uomName ?? null,
        item.lastPurchasedPrice ?? null,
        item.quantity ?? null,
        item.manualQuantity ?? null,
        item.isEssential ? 1 : 0,
        now,
      ]
    );
  }
}

async function readRMCache(stockUpdateId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${RM_TABLE} WHERE stockUpdateId = ?
     ORDER BY categoryOrder ASC, rawMaterialName ASC;`,
    [stockUpdateId]
  );
  return rows.map((r) => ({
    rawMaterialId:      r.rawMaterialId,
    rawMaterialCode:    r.rawMaterialCode,
    rawMaterialName:    r.rawMaterialName,
    categoryId:         r.categoryId,
    categoryName:       r.categoryName ?? 'Uncategorized',
    categoryOrder:      r.categoryOrder ?? 9999,
    uomName:            r.uomName,
    lastPurchasedPrice: r.lastPurchasedPrice,
    systemQuantity:     r.systemQuantity,
    manualQuantity:     r.manualQuantity,
    isEssential:        r.isEssential === 1,
  }));
}

export async function getRawMaterials({ stockUpdateId, forceRefresh = false }) {
  await ensureRMTable();
  const stale = await isRMCacheStale(stockUpdateId);
  if (!forceRefresh && !stale) {
    return readRMCache(stockUpdateId);
  }
  try {
    const workInfo = await getWorkInfo();
    const unitId = workInfo?.companyId;
    const payload = await apiGet('/unitrawmaterial', {
      params: { stockUpdateId: String(stockUpdateId), page: '0', size: '1000', unitId: String(unitId) },
      label: 'Raw materials API',
    });
    const items = Array.isArray(payload?.result) ? payload.result : [];
    await replaceRMCache(stockUpdateId, items);
  } catch (error) {
    console.warn('[STOCKS] Raw materials API failed, using cache:', error.message);
  }
  return readRMCache(stockUpdateId);
}

export async function saveStockItem({ stockUpdateId, rawMaterialId, updatedQuantity, systemQuantity }) {
  const payload = await apiPost(
    `/stockupdate/${stockUpdateId}/items`,
    {
      status: 'CREATED',
      rawMaterialId: String(rawMaterialId),
      updatedQuantity: Number(updatedQuantity),
      systemQuantity: Number(systemQuantity ?? 0),
    },
    { label: 'Save stock item' }
  );
  // Update the cached manualQuantity for instant UI consistency
  await ensureRMTable();
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE ${RM_TABLE} SET manualQuantity = ? WHERE stockUpdateId = ? AND rawMaterialId = ?;`,
    [Number(updatedQuantity), stockUpdateId, String(rawMaterialId)]
  );
  return payload;
}

// ─── Last Day Closed ────────────────────────────────────────────────────────

export async function getLastDayClosed() {
  const now = Date.now();
  if (lastDayClosedCache && lastDayClosedFetchedAt && now - lastDayClosedFetchedAt < RM_CACHE_TTL_MS) {
    return lastDayClosedCache;
  }
  try {
    const data = await apiGet('/daybook/lastdayclosed', { label: 'Last day closed API' });
    lastDayClosedCache = data;
    lastDayClosedFetchedAt = now;
    return data;
  } catch (error) {
    console.warn('[STOCKS] getLastDayClosed failed:', error.message);
    return lastDayClosedCache ?? null;
  }
}
