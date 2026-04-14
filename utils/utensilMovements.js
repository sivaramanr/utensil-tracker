import * as SQLite from 'expo-sqlite';
import { getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const UTENSIL_MOVEMENTS_TABLE = 'UtensilMovements';
const UTENSIL_MOVEMENT_SYNC_TABLE = 'UtensilMovementSync';
const UTENSIL_MOVEMENTS_ENDPOINT = 'https://amrutha.cookerp.com/utensilmovement/customer';
const SYNC_STATUS_LOCAL_ONLY = 'LOCAL_ONLY';
const SYNC_STATUS_SERVER_UNCHANGED = 'SERVER_UNCHANGED';
const SYNC_STATUS_SERVER_MODIFIED = 'SERVER_MODIFIED';
const DEFAULT_TRIP_NO = 1;

let databasePromise;
let ensureUtensilMovementTablesPromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

function normalizeTripNo(tripNo) {
  const parsedTripNo = Number(tripNo);
  return Number.isInteger(parsedTripNo) && parsedTripNo > 0 ? parsedTripNo : DEFAULT_TRIP_NO;
}

function buildContextKey({ orderDate, sessionId, customerId, tripNo }) {
  return [
    orderDate ?? 'unknown-date',
    String(sessionId ?? 'unknown-session'),
    String(customerId ?? 'unknown-customer'),
    String(normalizeTripNo(tripNo)),
  ].join('|');
}

function normalizeMovementContext(context = {}) {
  return {
    orderDate: context.orderDate ?? null,
    sessionId: context.sessionId != null ? String(context.sessionId) : null,
    customerId: context.customerId != null ? String(context.customerId) : null,
    tripNo: normalizeTripNo(context.tripNo),
  };
}

function getMovementItemReference(row) {
  if (row?.itemId != null) {
    return String(row.itemId);
  }

  if (row?.despatchItemId != null) {
    return String(row.despatchItemId);
  }

  return null;
}

function normalizeApiMovement(payloadItem, syncedAt, contextKey, context) {
  const item = payloadItem && typeof payloadItem === 'object' ? payloadItem : {};

  return {
    id: item?.id != null ? String(item.id) : null,
    contextKey,
    orderDate: context.orderDate,
    sessionId: context.sessionId,
    customerId: context.customerId,
    tripNo: context.tripNo,
    despatchItemId: item?.despatchItemId != null ? String(item.despatchItemId) : null,
    itemId: item?.itemId != null ? String(item.itemId) : null,
    utensilId: item?.utensilId != null ? String(item.utensilId) : null,
    despatchedQuantity: Number.isFinite(Number(item?.despatchedQuantity))
      ? Number(item.despatchedQuantity)
      : 0,
    despatchApproved: Boolean(item?.despatchApproved),
    returnedQuantity: Number.isFinite(Number(item?.returnedQuantity))
      ? Number(item.returnedQuantity)
      : 0,
    returnApproved: Boolean(item?.returnApproved),
    despatchReason: item?.despatchReason != null ? String(item.despatchReason) : null,
    returnReason: item?.returnReason != null ? String(item.returnReason) : null,
    conditionOnDespatch:
      item?.conditionOnDespatch != null ? String(item.conditionOnDespatch) : null,
    conditionOnReturn: item?.conditionOnReturn != null ? String(item.conditionOnReturn) : null,
    comments: item?.comments != null ? String(item.comments) : null,
    dispatchedAt: Number.isFinite(Number(item?.dispatchedAt)) ? Number(item.dispatchedAt) : null,
    returnedAt: Number.isFinite(Number(item?.returnedAt)) ? Number(item.returnedAt) : null,
    dispatchedBy: item?.dispatchedBy != null ? String(item.dispatchedBy) : null,
    despatchApprovedBy:
      item?.despatchApprovedBy != null ? String(item.despatchApprovedBy) : null,
    returnedBy: item?.returnedBy != null ? String(item.returnedBy) : null,
    returnApprovedBy: item?.returnApprovedBy != null ? String(item.returnApprovedBy) : null,
    isDraft: 0,
    syncStatus: SYNC_STATUS_SERVER_UNCHANGED,
    payloadJson: JSON.stringify(item),
    syncedAt,
    localUpdatedAt: syncedAt,
  };
}

async function getContextSyncAt(context) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `
      SELECT syncedAt
      FROM ${UTENSIL_MOVEMENT_SYNC_TABLE}
      WHERE contextKey = ?;
    `,
    buildContextKey(context)
  );

  return row?.syncedAt ?? null;
}

async function getContextRows(context) {
  const db = await getDatabase();
  return db.getAllAsync(
    `
      SELECT
        id,
        despatchItemId,
        itemId,
        utensilId,
        despatchedQuantity,
        returnedQuantity,
        isDraft,
        syncStatus
      FROM ${UTENSIL_MOVEMENTS_TABLE}
      WHERE contextKey = ?;
    `,
    buildContextKey(context)
  );
}

function buildEffectiveMovementRows(rows) {
  const serverRowsByKey = new Map();
  const draftRowsByKey = new Map();

  rows.forEach((row) => {
    const itemReference = getMovementItemReference(row);
    const utensilId = row?.utensilId != null ? String(row.utensilId) : null;

    if (!itemReference || !utensilId) {
      return;
    }

    const key = `${itemReference}|${utensilId}`;
    const despatchedQuantity = Number(row?.despatchedQuantity ?? 0) || 0;
    const returnedQuantity = Number(row?.returnedQuantity ?? 0) || 0;

    if (Boolean(row?.isDraft)) {
      draftRowsByKey.set(key, {
        id: row?.id != null ? String(row.id) : null,
        itemId: row?.itemId != null ? String(row.itemId) : itemReference,
        despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
        utensilId,
        despatchedQuantity,
        returnedQuantity,
        isDraft: true,
        syncStatus: row?.syncStatus ?? SYNC_STATUS_LOCAL_ONLY,
      });
      return;
    }

    const existingServerRow = serverRowsByKey.get(key);

    if (!existingServerRow) {
      serverRowsByKey.set(key, {
        id: row?.id != null ? String(row.id) : null,
        itemId: row?.itemId != null ? String(row.itemId) : itemReference,
        despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
        utensilId,
        despatchedQuantity,
        returnedQuantity,
        isDraft: false,
        syncStatus: SYNC_STATUS_SERVER_UNCHANGED,
      });
      return;
    }

    existingServerRow.despatchedQuantity += despatchedQuantity;
    existingServerRow.returnedQuantity += returnedQuantity;
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
    const utensilId = row?.utensilId != null ? String(row.utensilId) : null;

    if (!utensilId) {
      return;
    }

    const despatchedQuantity = Number(row?.despatchedQuantity ?? 0) || 0;
    const returnedQuantity = Number(row?.returnedQuantity ?? 0) || 0;

    countsByUtensilId[utensilId] = (countsByUtensilId[utensilId] ?? 0) + despatchedQuantity;
    returnedByUtensilId[utensilId] = (returnedByUtensilId[utensilId] ?? 0) + returnedQuantity;

    if (!row?.isDraft) {
      serverCounts[utensilId] = (serverCounts[utensilId] ?? 0) + despatchedQuantity;
    }
  });

  return {
    serverCounts,
    countsByUtensilId,
    returnedByUtensilId,
    effectiveRows,
  };
}

async function getAggregateState(context) {
  const rows = await getContextRows(context);
  return buildAggregateState(rows);
}

function findServerQuantityForItem(rows, { itemId, despatchItemId, utensilId }) {
  const normalizedUtensilId = utensilId != null ? String(utensilId) : null;
  const normalizedItemId = itemId != null ? String(itemId) : null;
  const normalizedDespatchItemId =
    despatchItemId != null ? String(despatchItemId) : normalizedItemId;

  if (!normalizedUtensilId || (!normalizedItemId && !normalizedDespatchItemId)) {
    return 0;
  }

  return rows.reduce((sum, row) => {
    if (Boolean(row?.isDraft)) {
      return sum;
    }

    const rowUtensilId = row?.utensilId != null ? String(row.utensilId) : null;
    const rowItemId = row?.itemId != null ? String(row.itemId) : null;
    const rowDespatchItemId =
      row?.despatchItemId != null ? String(row.despatchItemId) : rowItemId;

    if (rowUtensilId !== normalizedUtensilId) {
      return sum;
    }

    if (
      rowItemId !== normalizedItemId &&
      rowDespatchItemId !== normalizedDespatchItemId &&
      rowDespatchItemId !== normalizedItemId
    ) {
      return sum;
    }

    return sum + (Number(row?.despatchedQuantity ?? 0) || 0);
  }, 0);
}

function normalizeApiList(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
      : Array.isArray(payload?.content)
        ? payload.content
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
}

async function fetchUtensilMovementsFromApi(context) {
  const normalizedContext = normalizeMovementContext(context);
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  if (!normalizedContext.orderDate || !normalizedContext.sessionId || !normalizedContext.customerId) {
    throw new Error('Missing orderDate, sessionId or customerId.');
  }

  const queryParams = new URLSearchParams({
    despatchDate: normalizedContext.orderDate,
    sessionId: normalizedContext.sessionId,
    tripNo: String(normalizedContext.tripNo),
  });

  const response = await fetch(
    `${UTENSIL_MOVEMENTS_ENDPOINT}/${normalizedContext.customerId}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        unitId,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Utensil movement API failed with status ${response.status}`);
  }

  const payload = await response.json();
  const syncedAt = new Date().toISOString();
  const contextKey = buildContextKey(normalizedContext);
  const normalizedMovements = normalizeApiList(payload)
    .map((item) => normalizeApiMovement(item, syncedAt, contextKey, normalizedContext))
    .filter((item) => item.id && item.utensilId);

  return {
    context: normalizedContext,
    contextKey,
    syncedAt,
    movements: normalizedMovements,
  };
}

async function replaceContextMovementsFromApi({ context, contextKey, syncedAt, movements }) {
  const normalizedContext = normalizeMovementContext(context);
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        DELETE FROM ${UTENSIL_MOVEMENTS_TABLE}
        WHERE contextKey = ? AND isDraft = 0;
      `,
      contextKey
    );

    for (const movement of movements) {
      await db.runAsync(
        `
          INSERT INTO ${UTENSIL_MOVEMENTS_TABLE} (
            id,
            contextKey,
            orderDate,
            sessionId,
            customerId,
            tripNo,
            despatchItemId,
            itemId,
            utensilId,
            despatchedQuantity,
            despatchApproved,
            returnedQuantity,
            returnApproved,
            despatchReason,
            returnReason,
            conditionOnDespatch,
            conditionOnReturn,
            comments,
            dispatchedAt,
            returnedAt,
            dispatchedBy,
            despatchApprovedBy,
            returnedBy,
            returnApprovedBy,
            isDraft,
            syncStatus,
            payloadJson,
            syncedAt,
            localUpdatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        movement.id,
        movement.contextKey,
        movement.orderDate,
        movement.sessionId,
        movement.customerId,
        movement.tripNo,
        movement.despatchItemId,
        movement.itemId,
        movement.utensilId,
        movement.despatchedQuantity,
        movement.despatchApproved ? 1 : 0,
        movement.returnedQuantity,
        movement.returnApproved ? 1 : 0,
        movement.despatchReason,
        movement.returnReason,
        movement.conditionOnDespatch,
        movement.conditionOnReturn,
        movement.comments,
        movement.dispatchedAt,
        movement.returnedAt,
        movement.dispatchedBy,
        movement.despatchApprovedBy,
        movement.returnedBy,
        movement.returnApprovedBy,
        movement.isDraft ? 1 : 0,
        movement.syncStatus,
        movement.payloadJson,
        movement.syncedAt,
        movement.localUpdatedAt
      );
    }

    await db.runAsync(
      `
        INSERT OR REPLACE INTO ${UTENSIL_MOVEMENT_SYNC_TABLE} (
          contextKey,
          orderDate,
          sessionId,
          customerId,
          tripNo,
          syncedAt
        ) VALUES (?, ?, ?, ?, ?, ?);
      `,
      contextKey,
      normalizedContext.orderDate,
      normalizedContext.sessionId,
      normalizedContext.customerId,
      normalizedContext.tripNo,
      syncedAt
    );
  });
}

function createDraftId(context, utensilId, itemId) {
  return [
    'draft',
    context.orderDate ?? 'unknown-date',
    context.sessionId ?? 'unknown-session',
    context.customerId ?? 'unknown-customer',
    context.tripNo ?? DEFAULT_TRIP_NO,
    itemId ?? 'unknown-item',
    utensilId,
  ].join('|');
}

async function upsertDraftMovement({ context, utensilId, itemId, despatchItemId, quantity, syncStatus }) {
  const normalizedContext = normalizeMovementContext(context);
  const contextKey = buildContextKey(normalizedContext);
  const db = await getDatabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const normalizedItemId = itemId != null ? String(itemId) : null;
  const normalizedDespatchItemId =
    despatchItemId != null ? String(despatchItemId) : normalizedItemId;
  const draftId = createDraftId(
    normalizedContext,
    utensilId,
    normalizedItemId ?? normalizedDespatchItemId
  );

  await db.runAsync(
    `
      INSERT OR REPLACE INTO ${UTENSIL_MOVEMENTS_TABLE} (
        id,
        contextKey,
        orderDate,
        sessionId,
        customerId,
        tripNo,
        despatchItemId,
        itemId,
        utensilId,
        despatchedQuantity,
        despatchApproved,
        returnedQuantity,
        returnApproved,
        despatchReason,
        returnReason,
        conditionOnDespatch,
        conditionOnReturn,
        comments,
        dispatchedAt,
        returnedAt,
        dispatchedBy,
        despatchApprovedBy,
        returnedBy,
        returnApprovedBy,
        isDraft,
        syncStatus,
        payloadJson,
        syncedAt,
        localUpdatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    draftId,
    contextKey,
    normalizedContext.orderDate,
    normalizedContext.sessionId,
    normalizedContext.customerId,
    normalizedContext.tripNo,
    normalizedDespatchItemId,
    normalizedItemId,
    utensilId,
    quantity,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    null,
    now,
    null,
    null,
    null,
    null,
    null,
    1,
    syncStatus,
    null,
    null,
    nowIso
  );
}

async function deleteDraftMovement(context, utensilId, itemId) {
  const db = await getDatabase();
  await db.runAsync(
    `
      DELETE FROM ${UTENSIL_MOVEMENTS_TABLE}
      WHERE contextKey = ? AND utensilId = ? AND itemId = ? AND isDraft = 1;
    `,
    buildContextKey(context),
    String(utensilId),
    String(itemId)
  );
}

export async function ensureUtensilMovementTables() {
  if (!ensureUtensilMovementTablesPromise) {
    ensureUtensilMovementTablesPromise = (async () => {
      const db = await getDatabase();

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${UTENSIL_MOVEMENTS_TABLE} (
            id TEXT PRIMARY KEY,
            contextKey TEXT NOT NULL,
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            customerId TEXT NOT NULL,
            tripNo INTEGER NOT NULL,
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
        `
      );

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${UTENSIL_MOVEMENT_SYNC_TABLE} (
            contextKey TEXT PRIMARY KEY,
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            customerId TEXT NOT NULL,
            tripNo INTEGER NOT NULL,
            syncedAt TEXT NOT NULL
          );
        `
      );

      await db.runAsync(
        `
          CREATE INDEX IF NOT EXISTS idx_utensil_movements_context
          ON ${UTENSIL_MOVEMENTS_TABLE} (contextKey, isDraft);
        `
      );

      await db.runAsync(
        `
          CREATE INDEX IF NOT EXISTS idx_utensil_movements_utensil
          ON ${UTENSIL_MOVEMENTS_TABLE} (contextKey, utensilId);
        `
      );

      try {
        await db.runAsync(`ALTER TABLE ${UTENSIL_MOVEMENTS_TABLE} ADD COLUMN itemId TEXT;`);
      } catch {}
    })().catch((error) => {
      ensureUtensilMovementTablesPromise = null;
      throw error;
    });
  }

  await ensureUtensilMovementTablesPromise;
}

export async function getUtensilMovementCounts(context) {
  await ensureUtensilMovementTables();
  const normalizedContext = normalizeMovementContext(context);
  const { countsByUtensilId } = await getAggregateState(normalizedContext);
  return countsByUtensilId;
}

export async function getUtensilMovementRows(context) {
  await ensureUtensilMovementTables();
  const normalizedContext = normalizeMovementContext(context);
  const rows = buildEffectiveMovementRows(await getContextRows(normalizedContext));

  return rows.map((row) => ({
    id: row?.id != null ? String(row.id) : null,
    despatchItemId: row?.despatchItemId != null ? String(row.despatchItemId) : null,
    itemId: row?.itemId != null ? String(row.itemId) : null,
    utensilId: row?.utensilId != null ? String(row.utensilId) : null,
    despatchedQuantity: Number(row?.despatchedQuantity ?? 0) || 0,
    returnedQuantity: Number(row?.returnedQuantity ?? 0) || 0,
    isDraft: Boolean(row?.isDraft),
    syncStatus: row?.syncStatus ?? null,
  }));
}

export async function loadUtensilMovementCountsWithInitialSync(context) {
  const result = await loadUtensilMovementSummaryWithInitialSync(context);
  return result.countsByUtensilId;
}

export async function getUtensilMovementSummary(context) {
  await ensureUtensilMovementTables();
  const normalizedContext = normalizeMovementContext(context);
  const [{ countsByUtensilId, returnedByUtensilId }, syncedAt] = await Promise.all([
    getAggregateState(normalizedContext),
    getContextSyncAt(normalizedContext),
  ]);

  const dispatchedTotal = Object.values(countsByUtensilId).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const returnedTotal = Object.values(returnedByUtensilId).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );

  return {
    countsByUtensilId,
    returnedByUtensilId,
    dispatchedTotal,
    returnedTotal,
    syncedAt,
  };
}

export async function loadUtensilMovementSummaryWithInitialSync(context) {
  await ensureUtensilMovementTables();
  const normalizedContext = normalizeMovementContext(context);

  if (!normalizedContext.orderDate || !normalizedContext.sessionId || !normalizedContext.customerId) {
    return {
      countsByUtensilId: {},
      returnedByUtensilId: {},
      dispatchedTotal: 0,
      returnedTotal: 0,
      syncedAt: null,
    };
  }

  const existingSyncAt = await getContextSyncAt(normalizedContext);

  if (existingSyncAt) {
    return getUtensilMovementSummary(normalizedContext);
  }

  try {
    const payload = await fetchUtensilMovementsFromApi(normalizedContext);
    await replaceContextMovementsFromApi(payload);
  } catch (error) {
    const localSummary = await getUtensilMovementSummary(normalizedContext);

    if (Object.keys(localSummary.countsByUtensilId).length > 0) {
      return localSummary;
    }

    throw error;
  }

  return getUtensilMovementSummary(normalizedContext);
}

export async function refreshUtensilMovementsFromApi(context) {
  await ensureUtensilMovementTables();
  const normalizedContext = normalizeMovementContext(context);
  const payload = await fetchUtensilMovementsFromApi(normalizedContext);
  await replaceContextMovementsFromApi(payload);
  return getUtensilMovementSummary(normalizedContext);
}

export async function setUtensilMovementQuantity(context, utensilId, quantity, metadata = {}) {
  await ensureUtensilMovementTables();

  if (!utensilId) {
    return;
  }

  const normalizedContext = normalizeMovementContext(context);
  const normalizedUtensilId = String(utensilId);
  const normalizedItemId = metadata?.itemId != null ? String(metadata.itemId) : null;
  const normalizedDespatchItemId =
    metadata?.despatchItemId != null
      ? String(metadata.despatchItemId)
      : normalizedItemId;
  const nextQuantity = Math.max(0, Number(quantity) || 0);
  const rows = await getContextRows(normalizedContext);
  const serverQuantity = findServerQuantityForItem(rows, {
    itemId: normalizedItemId,
    despatchItemId: normalizedDespatchItemId,
    utensilId: normalizedUtensilId,
  });

  if (nextQuantity === 0 && serverQuantity === 0) {
    await deleteDraftMovement(normalizedContext, normalizedUtensilId, normalizedItemId);
    return;
  }

  if (serverQuantity > 0 && nextQuantity === serverQuantity) {
    await deleteDraftMovement(normalizedContext, normalizedUtensilId, normalizedItemId);
    return;
  }

  const syncStatus =
    serverQuantity > 0 ? SYNC_STATUS_SERVER_MODIFIED : SYNC_STATUS_LOCAL_ONLY;

  await upsertDraftMovement({
    context: normalizedContext,
    utensilId: normalizedUtensilId,
    itemId: normalizedItemId,
    despatchItemId: normalizedDespatchItemId,
    quantity: nextQuantity,
    syncStatus,
  });
}

export const utensilMovementSyncStatus = {
  LOCAL_ONLY: SYNC_STATUS_LOCAL_ONLY,
  SERVER_UNCHANGED: SYNC_STATUS_SERVER_UNCHANGED,
  SERVER_MODIFIED: SYNC_STATUS_SERVER_MODIFIED,
};
