import { getDatabase } from '../../../core/db';
import { apiGet, apiPost, apiPut } from '../../../core/api/client';

const UTENSIL_MOVEMENTS_TABLE = 'UtensilMovements';
const UTENSIL_MOVEMENT_SYNC_TABLE = 'UtensilMovementSync';

const SYNC_STATUS_LOCAL_ONLY = 'LOCAL_ONLY';
const SYNC_STATUS_SERVER_UNCHANGED = 'SERVER_UNCHANGED';
const SYNC_STATUS_SERVER_MODIFIED = 'SERVER_MODIFIED';
const DEFAULT_TRIP_NO = 1;

export const utensilMovementSyncStatus = {
  LOCAL_ONLY: SYNC_STATUS_LOCAL_ONLY,
  SERVER_UNCHANGED: SYNC_STATUS_SERVER_UNCHANGED,
  SERVER_MODIFIED: SYNC_STATUS_SERVER_MODIFIED,
};

let ensureTablesPromise = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTripNo(tripNo) {
  const n = Number(tripNo);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TRIP_NO;
}

function buildContextKey({ orderDate, sessionId, customerId, tripNo, recipeId }) {
  return [
    orderDate ?? 'unknown-date',
    String(sessionId ?? 'unknown-session'),
    String(customerId ?? 'unknown-customer'),
    String(normalizeTripNo(tripNo)),
    recipeId ?? 'unknown-recipe',
  ].join('|');
}

function normalizeMovementContext(context = {}) {
  return {
    orderDate: context.orderDate ?? null,
    sessionId: context.sessionId != null ? String(context.sessionId) : null,
    customerId: context.customerId != null ? String(context.customerId) : null,
    tripNo: normalizeTripNo(context.tripNo),
    recipeId: context.recipeId != null ? String(context.recipeId) : null,
  };
}

function getMovementItemReference(row) {
  if (row?.itemId != null) return String(row.itemId);
  if (row?.despatchItemId != null) return String(row.despatchItemId);
  return null;
}

function buildBasePattern(ctx) {
  return [
    ctx.orderDate ?? 'unknown-date',
    String(ctx.sessionId ?? 'unknown-session'),
    String(ctx.customerId ?? 'unknown-customer'),
    String(normalizeTripNo(ctx.tripNo)),
  ].join('|') + '|%';
}

function hasRecipeId(ctx) {
  return ctx.recipeId && ctx.recipeId !== 'unknown-recipe';
}

function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Table setup ──────────────────────────────────────────────────────────────

export async function ensureUtensilMovementTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      const db = await getDatabase();

      // Migration: add recipeId column if missing
      try {
        const cols = await db.getAllAsync(`PRAGMA table_info(${UTENSIL_MOVEMENT_SYNC_TABLE})`);
        if (cols && !cols.some((c) => c.name === 'recipeId')) {
          console.log('Migrating UtensilMovement tables to add recipeId column');
          await db.runAsync(`DROP TABLE IF EXISTS ${UTENSIL_MOVEMENTS_TABLE};`);
          await db.runAsync(`DROP TABLE IF EXISTS ${UTENSIL_MOVEMENT_SYNC_TABLE};`);
        }
      } catch {
        // Table doesn't exist yet — fine
      }

      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${UTENSIL_MOVEMENTS_TABLE} (
          id TEXT PRIMARY KEY,
          contextKey TEXT NOT NULL,
          orderDate TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          tripNo INTEGER NOT NULL,
          recipeId TEXT,
          despatchItemId TEXT,
          itemId TEXT,
          utensilId TEXT NOT NULL,
          despatchedQuantity REAL,
          despatchApproved BOOLEAN,
          returnedQuantity REAL,
          returnApproved BOOLEAN,
          despatchReason TEXT,
          returnReason TEXT,
          conditionOnDespatch TEXT,
          conditionOnReturn TEXT,
          comments TEXT,
          dispatchedAt INTEGER,
          returnedAt INTEGER,
          dispatchedBy TEXT,
          despatchApprovedBy TEXT,
          returnedBy TEXT,
          returnApprovedBy TEXT,
          isDraft BOOLEAN NOT NULL DEFAULT 0,
          syncStatus TEXT NOT NULL,
          payloadJson TEXT,
          syncedAt TEXT,
          localUpdatedAt TEXT
        );
      `);

      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${UTENSIL_MOVEMENT_SYNC_TABLE} (
          contextKey TEXT PRIMARY KEY,
          orderDate TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          tripNo INTEGER NOT NULL,
          recipeId TEXT,
          syncedAt TEXT NOT NULL
        );
      `);

      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_utensil_movements_context
        ON ${UTENSIL_MOVEMENTS_TABLE} (contextKey, isDraft);
      `);

      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_utensil_movements_utensil
        ON ${UTENSIL_MOVEMENTS_TABLE} (contextKey, utensilId);
      `);
    })().catch((err) => { ensureTablesPromise = null; throw err; });
  }
  await ensureTablesPromise;
}

// ─── DB reads ─────────────────────────────────────────────────────────────────

const MOVEMENT_SELECT_COLS = `
  id, despatchItemId, itemId, utensilId, despatchedQuantity, returnedQuantity,
  isDraft, syncStatus, despatchApproved, returnApproved, despatchApprovedBy, returnApprovedBy
`;

async function getContextRows(ctx) {
  const db = await getDatabase();
  if (hasRecipeId(ctx)) {
    return db.getAllAsync(
      `SELECT ${MOVEMENT_SELECT_COLS} FROM ${UTENSIL_MOVEMENTS_TABLE} WHERE contextKey = ?`,
      [buildContextKey(ctx)]
    );
  }
  return db.getAllAsync(
    `SELECT ${MOVEMENT_SELECT_COLS} FROM ${UTENSIL_MOVEMENTS_TABLE} WHERE contextKey LIKE ?`,
    [buildBasePattern(ctx)]
  );
}

async function getContextSyncAt(ctx) {
  const db = await getDatabase();
  if (hasRecipeId(ctx)) {
    const row = await db.getFirstAsync(
      `SELECT syncedAt FROM ${UTENSIL_MOVEMENT_SYNC_TABLE} WHERE contextKey = ?;`,
      [buildContextKey(ctx)]
    );
    return row?.syncedAt ?? null;
  }
  const row = await db.getFirstAsync(
    `SELECT syncedAt FROM ${UTENSIL_MOVEMENT_SYNC_TABLE}
     WHERE contextKey LIKE ? ORDER BY syncedAt DESC LIMIT 1;`,
    [buildBasePattern(ctx)]
  );
  return row?.syncedAt ?? null;
}

async function getServerIdForMovement(ctx, utensilId, itemId) {
  const db = await getDatabase();
  const nUtensilId = String(utensilId);
  const nItemId = String(itemId);
  if (hasRecipeId(ctx)) {
    const row = await db.getFirstAsync(
      `SELECT id FROM ${UTENSIL_MOVEMENTS_TABLE}
       WHERE contextKey = ? AND utensilId = ? AND itemId = ? AND isDraft = 0;`,
      [buildContextKey(ctx), nUtensilId, nItemId]
    );
    return row?.id ?? null;
  }
  const row = await db.getFirstAsync(
    `SELECT id FROM ${UTENSIL_MOVEMENTS_TABLE}
     WHERE contextKey LIKE ? AND utensilId = ? AND itemId = ? AND isDraft = 0;`,
    [buildBasePattern(ctx), nUtensilId, nItemId]
  );
  return row?.id ?? null;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function buildEffectiveMovementRows(rows) {
  const serverRowsByKey = new Map();
  const draftRowsByKey = new Map();

  rows.forEach((row) => {
    const itemRef = getMovementItemReference(row);
    const utensilId = row?.utensilId != null ? String(row.utensilId) : null;
    if (!itemRef || !utensilId) return;
    const key = `${itemRef}|${utensilId}`;
    const despatched = Number(row?.despatchedQuantity ?? 0) || 0;
    const returned = Number(row?.returnedQuantity ?? 0) || 0;

    if (Boolean(row?.isDraft)) {
      draftRowsByKey.set(key, {
        id: row?.id != null ? String(row.id) : null,
        itemId: row?.itemId != null ? String(row.itemId) : itemRef,
        despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
        utensilId, despatchedQuantity: despatched, returnedQuantity: returned,
        isDraft: true, syncStatus: row?.syncStatus ?? SYNC_STATUS_LOCAL_ONLY,
        despatchApproved: Boolean(row?.despatchApproved), returnApproved: Boolean(row?.returnApproved),
        despatchApprovedBy: row?.despatchApprovedBy ?? null, returnApprovedBy: row?.returnApprovedBy ?? null,
      });
      return;
    }

    const existing = serverRowsByKey.get(key);
    if (!existing) {
      serverRowsByKey.set(key, {
        id: row?.id != null ? String(row.id) : null,
        itemId: row?.itemId != null ? String(row.itemId) : itemRef,
        despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
        utensilId, despatchedQuantity: despatched, returnedQuantity: returned,
        isDraft: false, syncStatus: row?.syncStatus ?? SYNC_STATUS_SERVER_UNCHANGED,
        despatchApproved: Boolean(row?.despatchApproved), returnApproved: Boolean(row?.returnApproved),
        despatchApprovedBy: row?.despatchApprovedBy ?? null, returnApprovedBy: row?.returnApprovedBy ?? null,
      });
      return;
    }
    existing.despatchedQuantity += despatched;
    existing.returnedQuantity += returned;
    if (row?.despatchApproved) existing.despatchApproved = true;
  });

  return Array.from(new Set([...serverRowsByKey.keys(), ...draftRowsByKey.keys()])).map(
    (key) => draftRowsByKey.get(key) ?? serverRowsByKey.get(key)
  );
}

function buildAggregateState(rows) {
  const effectiveRows = buildEffectiveMovementRows(rows);
  const serverCounts = {};
  const countsByUtensilId = {};
  const returnedByUtensilId = {};

  effectiveRows.forEach((row) => {
    const uid = row?.utensilId != null ? String(row.utensilId) : null;
    if (!uid) return;
    const despatched = Number(row?.despatchedQuantity ?? 0) || 0;
    const returned = Number(row?.returnedQuantity ?? 0) || 0;
    countsByUtensilId[uid] = (countsByUtensilId[uid] ?? 0) + despatched;
    returnedByUtensilId[uid] = (returnedByUtensilId[uid] ?? 0) + returned;
    if (!row?.isDraft) serverCounts[uid] = (serverCounts[uid] ?? 0) + despatched;
  });

  return { serverCounts, countsByUtensilId, returnedByUtensilId, effectiveRows };
}

function findServerQuantityForItem(rows, { itemId, despatchItemId, utensilId }) {
  const nUtensilId = utensilId != null ? String(utensilId) : null;
  const nItemId = itemId != null ? String(itemId) : null;
  const nDespatchItemId = despatchItemId != null ? String(despatchItemId) : nItemId;
  if (!nUtensilId || (!nItemId && !nDespatchItemId)) return 0;

  return rows.reduce((sum, row) => {
    if (Boolean(row?.isDraft)) return sum;
    const rowUtensilId = row?.utensilId != null ? String(row.utensilId) : null;
    const rowItemId = row?.itemId != null ? String(row.itemId) : null;
    const rowDespatchItemId = row?.despatchItemId != null ? String(row.despatchItemId) : rowItemId;
    if (rowUtensilId !== nUtensilId) return sum;
    if (rowItemId !== nItemId && rowDespatchItemId !== nDespatchItemId && rowDespatchItemId !== nItemId) return sum;
    return sum + (Number(row?.despatchedQuantity ?? 0) || 0);
  }, 0);
}

// ─── API sync ─────────────────────────────────────────────────────────────────

function normalizeApiMovement(item, syncedAt, contextKey, ctx) {
  const i = item && typeof item === 'object' ? item : {};
  return {
    id: i?.id != null ? String(i.id) : null,
    contextKey,
    orderDate: ctx.orderDate, sessionId: ctx.sessionId, customerId: ctx.customerId,
    tripNo: ctx.tripNo, recipeId: ctx.recipeId,
    despatchItemId: i?.despatchItemId != null ? String(i.despatchItemId) : null,
    itemId: i?.itemId != null ? String(i.itemId) : null,
    utensilId: i?.utensilId != null ? String(i.utensilId) : null,
    despatchedQuantity: Number.isFinite(Number(i?.despatchedQuantity)) ? Number(i.despatchedQuantity) : 0,
    despatchApproved: Boolean(i?.despatchApproved),
    returnedQuantity: Number.isFinite(Number(i?.returnedQuantity)) ? Number(i.returnedQuantity) : 0,
    returnApproved: Boolean(i?.returnApproved),
    despatchReason: i?.despatchReason != null ? String(i.despatchReason) : null,
    returnReason: i?.returnReason != null ? String(i.returnReason) : null,
    conditionOnDespatch: i?.conditionOnDespatch != null ? String(i.conditionOnDespatch) : null,
    conditionOnReturn: i?.conditionOnReturn != null ? String(i.conditionOnReturn) : null,
    comments: i?.comments != null ? String(i.comments) : null,
    dispatchedAt: Number.isFinite(Number(i?.dispatchedAt)) ? Number(i.dispatchedAt) : null,
    returnedAt: Number.isFinite(Number(i?.returnedAt)) ? Number(i.returnedAt) : null,
    dispatchedBy: i?.dispatchedBy != null ? String(i.dispatchedBy) : null,
    despatchApprovedBy: i?.despatchApprovedBy != null ? String(i.despatchApprovedBy) : null,
    returnedBy: i?.returnedBy != null ? String(i.returnedBy) : null,
    returnApprovedBy: i?.returnApprovedBy != null ? String(i.returnApprovedBy) : null,
    isDraft: 0, syncStatus: SYNC_STATUS_SERVER_UNCHANGED,
    payloadJson: JSON.stringify(i), syncedAt, localUpdatedAt: syncedAt,
  };
}

async function fetchUtensilMovementsFromApi(ctx) {
  if (!ctx.orderDate || !ctx.sessionId || !ctx.customerId) {
    throw new Error('Missing orderDate, sessionId or customerId.');
  }
  const payload = await apiGet(`/utensilmovement/customer/${ctx.customerId}`, {
    params: { despatchDate: ctx.orderDate, sessionId: ctx.sessionId, tripNo: String(ctx.tripNo) },
    label: 'Utensil movement API',
  });

  const syncedAt = new Date().toISOString();
  const contextKey = buildContextKey(ctx);
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.content) ? payload.content
    : Array.isArray(payload?.data) ? payload.data
    : [];

  const movements = list
    .map((item) => normalizeApiMovement(item, syncedAt, contextKey, ctx))
    .filter((item) => item.id && item.utensilId);

  return { context: ctx, contextKey, syncedAt, movements };
}

async function replaceContextMovementsFromApi({ context: ctx, contextKey, syncedAt, movements }) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM ${UTENSIL_MOVEMENTS_TABLE} WHERE contextKey = ? AND isDraft = 0;`,
      [contextKey]
    );
    for (const m of movements) {
      await db.runAsync(
        `INSERT INTO ${UTENSIL_MOVEMENTS_TABLE}
         (id, contextKey, orderDate, sessionId, customerId, tripNo, recipeId,
          despatchItemId, itemId, utensilId, despatchedQuantity, despatchApproved,
          returnedQuantity, returnApproved, despatchReason, returnReason,
          conditionOnDespatch, conditionOnReturn, comments, dispatchedAt, returnedAt,
          dispatchedBy, despatchApprovedBy, returnedBy, returnApprovedBy,
          isDraft, syncStatus, payloadJson, syncedAt, localUpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [m.id, m.contextKey, m.orderDate, m.sessionId, m.customerId, m.tripNo, m.recipeId,
         m.despatchItemId, m.itemId, m.utensilId, m.despatchedQuantity, m.despatchApproved ? 1 : 0,
         m.returnedQuantity, m.returnApproved ? 1 : 0, m.despatchReason, m.returnReason,
         m.conditionOnDespatch, m.conditionOnReturn, m.comments, m.dispatchedAt, m.returnedAt,
         m.dispatchedBy, m.despatchApprovedBy, m.returnedBy, m.returnApprovedBy,
         m.isDraft ? 1 : 0, m.syncStatus, m.payloadJson, m.syncedAt, m.localUpdatedAt]
      );
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO ${UTENSIL_MOVEMENT_SYNC_TABLE}
       (contextKey, orderDate, sessionId, customerId, tripNo, recipeId, syncedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [contextKey, ctx.orderDate, ctx.sessionId, ctx.customerId, ctx.tripNo, ctx.recipeId, syncedAt]
    );
  });
}

// ─── Draft management ─────────────────────────────────────────────────────────

function createDraftId(ctx, utensilId, itemId) {
  return ['draft', ctx.orderDate ?? 'unknown-date', ctx.sessionId ?? 'unknown-session',
          ctx.customerId ?? 'unknown-customer', ctx.tripNo ?? DEFAULT_TRIP_NO,
          ctx.recipeId ?? 'unknown-recipe', itemId ?? 'unknown-item', utensilId].join('|');
}

async function upsertDraftMovement({ context: ctx, utensilId, itemId, despatchItemId, quantity, syncStatus }) {
  const contextKey = buildContextKey(ctx);
  const db = await getDatabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nItemId = itemId != null ? String(itemId) : null;
  const nDespatchItemId = despatchItemId != null ? String(despatchItemId) : nItemId;
  const draftId = createDraftId(ctx, utensilId, nItemId ?? nDespatchItemId);

  await db.runAsync(
    `INSERT OR REPLACE INTO ${UTENSIL_MOVEMENTS_TABLE}
     (id, contextKey, orderDate, sessionId, customerId, tripNo, despatchItemId, itemId,
      utensilId, despatchedQuantity, despatchApproved, returnedQuantity, returnApproved,
      despatchReason, returnReason, conditionOnDespatch, conditionOnReturn, comments,
      dispatchedAt, returnedAt, dispatchedBy, despatchApprovedBy, returnedBy, returnApprovedBy,
      isDraft, syncStatus, payloadJson, syncedAt, localUpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [draftId, contextKey, ctx.orderDate, ctx.sessionId, ctx.customerId, ctx.tripNo,
     nDespatchItemId, nItemId, utensilId, quantity, 0, 0, 0, null, null, null, null, null,
     now, null, null, null, null, null, 1, syncStatus, null, null, nowIso]
  );
}

async function deleteDraftMovement(ctx, utensilId, itemId) {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM ${UTENSIL_MOVEMENTS_TABLE}
     WHERE contextKey = ? AND utensilId = ? AND itemId = ? AND isDraft = 1;`,
    [buildContextKey(ctx), String(utensilId), String(itemId)]
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getUtensilMovementRows(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const rows = buildEffectiveMovementRows(await getContextRows(ctx));
  return rows.map((row) => ({
    id: row?.id != null ? String(row.id) : null,
    despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
    itemId: row?.itemId != null ? String(row.itemId) : null,
    utensilId: row?.utensilId != null ? String(row.utensilId) : null,
    despatchedQuantity: Number(row?.despatchedQuantity ?? 0) || 0,
    returnedQuantity: Number(row?.returnedQuantity ?? 0) || 0,
    isDraft: Boolean(row?.isDraft),
    syncStatus: row?.syncStatus ?? null,
    despatchApproved: Boolean(row?.despatchApproved),
    returnApproved: Boolean(row?.returnApproved),
    despatchApprovedBy: row?.despatchApprovedBy ?? null,
    returnApprovedBy: row?.returnApprovedBy ?? null,
  }));
}

export async function getUtensilMovementCounts(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const { countsByUtensilId } = buildAggregateState(await getContextRows(ctx));
  return countsByUtensilId;
}

export async function getUtensilMovementSummary(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const [{ countsByUtensilId, returnedByUtensilId }, syncedAt] = await Promise.all([
    (async () => buildAggregateState(await getContextRows(ctx)))(),
    getContextSyncAt(ctx),
  ]);
  const dispatchedTotal = Object.values(countsByUtensilId).reduce((s, v) => s + (Number(v) || 0), 0);
  const returnedTotal = Object.values(returnedByUtensilId).reduce((s, v) => s + (Number(v) || 0), 0);
  return { countsByUtensilId, returnedByUtensilId, dispatchedTotal, returnedTotal, syncedAt };
}

export async function loadUtensilMovementSummaryWithInitialSync(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  if (!ctx.orderDate || !ctx.sessionId || !ctx.customerId) {
    return { countsByUtensilId: {}, returnedByUtensilId: {}, dispatchedTotal: 0, returnedTotal: 0, syncedAt: null };
  }

  const existingSyncAt = await getContextSyncAt(ctx);
  if (existingSyncAt) return getUtensilMovementSummary(ctx);

  try {
    const payload = await fetchUtensilMovementsFromApi(ctx);
    await replaceContextMovementsFromApi(payload);
  } catch (error) {
    const localSummary = await getUtensilMovementSummary(ctx);
    if (Object.keys(localSummary.countsByUtensilId).length > 0) return localSummary;
    throw error;
  }

  return getUtensilMovementSummary(ctx);
}

export async function loadUtensilMovementCountsWithInitialSync(context) {
  const result = await loadUtensilMovementSummaryWithInitialSync(context);
  return result.countsByUtensilId;
}

export async function refreshUtensilMovementsFromApi(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const payload = await fetchUtensilMovementsFromApi(ctx);
  await replaceContextMovementsFromApi(payload);
  return getUtensilMovementSummary(ctx);
}

export async function setUtensilMovementQuantity(context, utensilId, quantity, metadata = {}) {
  await ensureUtensilMovementTables();
  if (!utensilId) return;
  const ctx = normalizeMovementContext(context);
  const nUtensilId = String(utensilId);
  const nItemId = metadata?.itemId != null ? String(metadata.itemId) : null;
  const nDespatchItemId = metadata?.despatchItemId != null ? String(metadata.despatchItemId) : nItemId;
  const nextQty = Math.max(0, Number(quantity) || 0);
  const rows = await getContextRows(ctx);
  const serverQty = findServerQuantityForItem(rows, { itemId: nItemId, despatchItemId: nDespatchItemId, utensilId: nUtensilId });

  if (nextQty === 0 && serverQty === 0) { await deleteDraftMovement(ctx, nUtensilId, nItemId); return; }
  if (serverQty > 0 && nextQty === serverQty) { await deleteDraftMovement(ctx, nUtensilId, nItemId); return; }

  await upsertDraftMovement({
    context: ctx, utensilId: nUtensilId, itemId: nItemId, despatchItemId: nDespatchItemId,
    quantity: nextQty,
    syncStatus: serverQty > 0 ? SYNC_STATUS_SERVER_MODIFIED : SYNC_STATUS_LOCAL_ONLY,
  });
}

export async function clearContextMovements(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const contextKey = buildContextKey(ctx);
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${UTENSIL_MOVEMENTS_TABLE} WHERE contextKey = ?;`, [contextKey]);
    await db.runAsync(`DELETE FROM ${UTENSIL_MOVEMENT_SYNC_TABLE} WHERE contextKey = ?;`, [contextKey]);
  });
}

export async function submitCreatedUtensilMovements(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const rows = await getUtensilMovementRows(ctx);

  const createdRows = rows.filter((r) => r?.syncStatus === SYNC_STATUS_LOCAL_ONLY && Number(r?.despatchedQuantity ?? 0) > 0);
  const changedRows = rows.filter((r) => r?.syncStatus === SYNC_STATUS_SERVER_MODIFIED && r?.utensilId && r?.itemId);

  const db = await getDatabase();
  let createdCount = 0;
  let changedCount = 0;

  if (createdRows.length > 0) {
    if (createdRows.find((r) => !r?.despatchItemId || !r?.utensilId)) {
      throw new Error('Missing despatchItemId or utensilId for created utensil movement.');
    }
    const payload = createdRows.map((r) => ({
      menuPlanItemId: String(r.despatchItemId),
      utensilId: String(r.utensilId),
      despatchedQuantity: Number(r.despatchedQuantity ?? 0) || 0,
    }));
    await apiPost('/utensilmovement/bulk', payload, { label: 'Create utensil movement API' });
    await Promise.all(createdRows.map((r) =>
      db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET isDraft = 0, syncStatus = ? WHERE id = ?`,
        [SYNC_STATUS_SERVER_UNCHANGED, r.id])
    ));
    createdCount = payload.length;
  }

  if (changedRows.length > 0) {
    const payload = await Promise.all(changedRows.map(async (r) => {
      const serverId = await getServerIdForMovement(ctx, r.utensilId, r.itemId);
      if (!serverId) throw new Error(`Server id not found for utensil ${r.utensilId} and item ${r.itemId}`);
      return { id: String(serverId), despatchedQuantity: Number(r.despatchedQuantity ?? 0) || 0 };
    }));
    await apiPut('/utensilmovement/bulk', payload, { label: 'Update utensil movement API' });
    await Promise.all(changedRows.map((r) =>
      db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET syncStatus = ? WHERE id = ?`,
        [SYNC_STATUS_SERVER_UNCHANGED, r.id])
    ));
    changedCount = payload.length;
  }

  return { submittedCount: createdCount + changedCount, createdCount, changedCount };
}

export async function approveDespatchedUtensilMovements(context, selectedMovements = null) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  let rows = (await getUtensilMovementRows(ctx)).filter(
    (r) => r?.syncStatus === SYNC_STATUS_SERVER_UNCHANGED && Number(r?.despatchedQuantity ?? 0) > 0 && r?.utensilId
  );
  if (selectedMovements?.length > 0) {
    const selectedSet = new Set(selectedMovements.map(buildMovementSelectionKey).filter(Boolean));
    rows = rows.filter((r) => selectedSet.has(buildMovementSelectionKey(r)));
  }
  if (rows.length === 0) return { approvedCount: 0 };

  const payload = await Promise.all(rows.map(async (r) => {
    const serverId = await getServerIdForMovement(ctx, r.utensilId, r.itemId);
    if (!serverId) throw new Error(`Server id not found for utensil ${r.utensilId} and item ${r.itemId}`);
    return { id: String(serverId), despatchApproved: true };
  }));

  await apiPut('/utensilmovement/bulk', payload, { label: 'Approve utensil movement API' });
  const db = await getDatabase();
  await Promise.all(payload.map((item) =>
    db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET despatchApproved = 1 WHERE id = ?`, [item.id])
  ));
  return { approvedCount: payload.length };
}

export async function submitReturnedUtensilMovements(context) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const rows = await getUtensilMovementRows(ctx);

  const createdRows = rows.filter((r) => r?.syncStatus === SYNC_STATUS_LOCAL_ONLY && Number(r?.returnedQuantity ?? 0) > 0);
  const changedRows = rows.filter((r) => r?.syncStatus === SYNC_STATUS_SERVER_MODIFIED && r?.utensilId && r?.itemId);

  let payloads = [];

  if (createdRows.length > 0) {
    if (createdRows.find((r) => !r?.despatchItemId || !r?.utensilId)) {
      throw new Error('Missing despatchItemId or utensilId for return movement.');
    }
    payloads = [
      ...createdRows.map((r) => ({
        menuPlanItemId: String(r.despatchItemId),
        utensilId: String(r.utensilId),
        returnedQuantity: Number(r.returnedQuantity ?? 0),
        isDraft: false,
      })),
    ];
  }

  if (changedRows.length > 0) {
    const changedPayload = await Promise.all(changedRows.map(async (r) => {
      const serverId = await getServerIdForMovement(ctx, r.utensilId, r.itemId);
      if (!serverId) throw new Error(`Server id not found for utensil ${r.utensilId} and item ${r.itemId}`);
      return { id: String(serverId), returnedQuantity: Number(r.returnedQuantity ?? 0) };
    }));
    payloads = [...payloads, ...changedPayload];
  }

  if (payloads.length > 0) {
    await apiPut('/utensilmovement/bulk', payloads, { label: 'Submit returned utensil movement API' });
  }

  const db = await getDatabase();
  await Promise.all([
    ...createdRows.map((r) =>
      db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET isDraft = 0, syncStatus = ? WHERE id = ?`,
        [SYNC_STATUS_SERVER_UNCHANGED, r.id])
    ),
    ...changedRows.map((r) =>
      db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET syncStatus = ? WHERE id = ?`,
        [SYNC_STATUS_SERVER_UNCHANGED, r.id])
    ),
  ]);

  return { createdCount: createdRows.length, changedCount: changedRows.length };
}

export async function approveReturnedUtensilMovements(context, selectedMovements = null) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  let rows = (await getUtensilMovementRows(ctx)).filter(
    (r) => r?.syncStatus === SYNC_STATUS_SERVER_UNCHANGED &&
      (Number(r?.returnedQuantity ?? 0) > 0 || r?.returnedQuantity != null) &&
      r?.utensilId && r?.itemId
  );
  if (selectedMovements?.length > 0) {
    const selectedSet = new Set(selectedMovements.map(buildMovementSelectionKey).filter(Boolean));
    rows = rows.filter((r) => selectedSet.has(buildMovementSelectionKey(r)));
  }
  if (rows.length === 0) return { approvedCount: 0 };

  const payload = await Promise.all(rows.map(async (r) => {
    const serverId = await getServerIdForMovement(ctx, r.utensilId, r.itemId);
    if (!serverId) throw new Error(`Server id not found for utensil ${r.utensilId} and item ${r.itemId}`);
    return { id: String(serverId), returnApproved: true };
  }));

  await apiPut('/utensilmovement/bulk', payload, { label: 'Approve returned utensil movement API' });
  const db = await getDatabase();
  await Promise.all(payload.map((item) =>
    db.runAsync(`UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET returnApproved = 1 WHERE id = ?`, [item.id])
  ));
  return { approvedCount: payload.length };
}

export async function updateReturnedQuantity(context, utensilId, itemId, newQuantity) {
  await ensureUtensilMovementTables();
  const ctx = normalizeMovementContext(context);
  const db = await getDatabase();
  const nUtensilId = String(utensilId);
  const nItemId = String(itemId);

  let existingRow;
  if (hasRecipeId(ctx)) {
    existingRow = await db.getFirstAsync(
      `SELECT id, returnedQuantity, syncStatus FROM ${UTENSIL_MOVEMENTS_TABLE}
       WHERE contextKey = ? AND utensilId = ? AND (itemId = ? OR despatchItemId = ?);`,
      [buildContextKey(ctx), nUtensilId, nItemId, nItemId]
    );
  } else {
    existingRow = await db.getFirstAsync(
      `SELECT id, returnedQuantity, syncStatus FROM ${UTENSIL_MOVEMENTS_TABLE}
       WHERE contextKey LIKE ? AND utensilId = ? AND (itemId = ? OR despatchItemId = ?);`,
      [buildBasePattern(ctx), nUtensilId, nItemId, nItemId]
    );
  }

  if (!existingRow) {
    await db.runAsync(
      `INSERT INTO ${UTENSIL_MOVEMENTS_TABLE}
       (id, contextKey, orderDate, sessionId, customerId, tripNo, utensilId, itemId,
        returnedQuantity, isDraft, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [generateLocalId(), buildContextKey(ctx), ctx.orderDate, ctx.sessionId, ctx.customerId,
       ctx.tripNo, nUtensilId, nItemId, newQuantity, 0, SYNC_STATUS_LOCAL_ONLY]
    );
    return;
  }

  const currentQty = Number(existingRow.returnedQuantity ?? 0);
  const newSyncStatus = currentQty !== newQuantity && existingRow.syncStatus === SYNC_STATUS_SERVER_UNCHANGED
    ? SYNC_STATUS_SERVER_MODIFIED
    : existingRow.syncStatus;

  await db.runAsync(
    `UPDATE ${UTENSIL_MOVEMENTS_TABLE} SET returnedQuantity = ?, syncStatus = ? WHERE id = ?`,
    [newQuantity, newSyncStatus, existingRow.id]
  );
}

export async function getDashboardSummary() {
  await ensureUtensilMovementTables();
  const db = await getDatabase();
  const allMovements = await db.getAllAsync(
    `SELECT despatchedQuantity, returnedQuantity FROM ${UTENSIL_MOVEMENTS_TABLE} WHERE isDraft = 0;`
  );
  let despatchedTotal = 0, returnedTotal = 0, pendingTotal = 0;
  allMovements.forEach((row) => {
    const despatched = Number(row?.despatchedQuantity ?? 0) || 0;
    const returned = Number(row?.returnedQuantity ?? 0) || 0;
    despatchedTotal += despatched;
    returnedTotal += returned;
    pendingTotal += Math.max(0, despatched - returned);
  });
  return { despatched: despatchedTotal, returned: returnedTotal, pending: pendingTotal };
}

function buildMovementSelectionKey(row) {
  const utensilId = row?.utensilId != null ? String(row.utensilId) : null;
  const itemRef = row?.itemId != null ? String(row.itemId) : row?.despatchItemId != null ? String(row.despatchItemId) : null;
  if (!utensilId || !itemRef) return null;
  return `${itemRef}|${utensilId}`;
}
