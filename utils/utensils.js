import * as SQLite from 'expo-sqlite';
import { getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const UTENSILS_TABLE = 'Utensils';
const UTENSILS_ENDPOINT = 'https://amrutha.cookerp.com/utensil';

let databasePromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function ensureUtensilsTable() {
  const db = await getDatabase();
  await db.execAsync(
    `
      CREATE TABLE IF NOT EXISTS ${UTENSILS_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT,
        utensilTypeId TEXT,
        utensilTypeName TEXT,
        isActive BOOLEAN,
        "order" INTEGER,
        unitId TEXT,
        accountId TEXT,
        createdAt INTEGER,
        createdBy TEXT,
        updatedAt INTEGER,
        updatedBy TEXT
      );
    `
  );
}

export async function getUtensilsByType(utensilTypeId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT id, name, utensilTypeId, utensilTypeName, isActive, "order"
     FROM ${UTENSILS_TABLE}
     WHERE utensilTypeId = ?
     ORDER BY "order" ASC, name ASC;`,
    utensilTypeId
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    utensilTypeId: row.utensilTypeId != null ? String(row.utensilTypeId) : null,
    utensilTypeName: row.utensilTypeName != null ? String(row.utensilTypeName) : null,
    isActive: Boolean(row.isActive),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : null,
  }));
}

export async function getUtensilsByTypeIds(utensilTypeIds) {
  if (!Array.isArray(utensilTypeIds) || utensilTypeIds.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const placeholders = utensilTypeIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync(
    `
      SELECT id, name, utensilTypeId, utensilTypeName, isActive, "order"
      FROM ${UTENSILS_TABLE}
      WHERE utensilTypeId IN (${placeholders})
      ORDER BY utensilTypeName ASC, "order" ASC, name ASC;
    `,
    ...utensilTypeIds
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    utensilTypeId: row.utensilTypeId != null ? String(row.utensilTypeId) : null,
    utensilTypeName: row.utensilTypeName != null ? String(row.utensilTypeName) : null,
    isActive: Boolean(row.isActive),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : null,
  }));
}

export async function getUtensilsByIds(utensilIds) {
  if (!Array.isArray(utensilIds) || utensilIds.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const placeholders = utensilIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync(
    `
      SELECT id, name, utensilTypeId, utensilTypeName, isActive, "order"
      FROM ${UTENSILS_TABLE}
      WHERE id IN (${placeholders})
      ORDER BY name ASC;
    `,
    ...utensilIds
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    utensilTypeId: row.utensilTypeId != null ? String(row.utensilTypeId) : null,
    utensilTypeName: row.utensilTypeName != null ? String(row.utensilTypeName) : null,
    isActive: Boolean(row.isActive),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : null,
  }));
}

async function getUtensilsCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${UTENSILS_TABLE};`);
  return Number(row?.count ?? 0);
}

function normalizeApiUtensils(payload) {
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
      utensilTypeId: item?.utensilTypeId != null ? String(item.utensilTypeId) : null,
      utensilTypeName: item?.utensilTypeName != null ? String(item.utensilTypeName) : null,
      isActive: Boolean(item?.isActive),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : null,
      unitId: item?.unitId != null ? String(item.unitId) : null,
      accountId: item?.accountId != null ? String(item.accountId) : null,
      createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : null,
      createdBy: item?.createdBy != null ? String(item.createdBy) : null,
      updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : null,
      updatedBy: item?.updatedBy != null ? String(item.updatedBy) : null,
    }))
    .filter((item) => item.id);
}

async function fetchUtensilsFromApi() {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const queryParams = new URLSearchParams({
    unitId,
    page: '0',
    size: '500',
  });

  const response = await fetch(`${UTENSILS_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Utensils API failed with status ${response.status}`);
  }

  const payload = await response.json();
  console.log('[UTENSILS][API][RAW_RESPONSE]', payload);

  const normalized = normalizeApiUtensils(payload);
  console.log('[UTENSILS][API][NORMALIZED_COUNT]', normalized.length);

  return normalized;
}

async function replaceUtensils(list) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${UTENSILS_TABLE};`);

    for (const item of list) {
      await db.runAsync(
        `
          INSERT INTO ${UTENSILS_TABLE} (
            id, name, utensilTypeId, utensilTypeName, isActive, "order",
            unitId, accountId, createdAt, createdBy, updatedAt, updatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        item.id,
        item.name,
        item.utensilTypeId,
        item.utensilTypeName,
        item.isActive ? 1 : 0,
        item.order,
        item.unitId,
        item.accountId,
        item.createdAt,
        item.createdBy,
        item.updatedAt,
        item.updatedBy
      );
    }
  });
}

export async function loadUtensilsWithInitialSync(utensilTypeId) {
  await ensureUtensilsTable();
  const count = await getUtensilsCount();

  if (count === 0) {
    const utensilsFromApi = await fetchUtensilsFromApi();
    await replaceUtensils(utensilsFromApi);
    return getUtensilsByType(utensilTypeId);
  }

  const localUtensils = await getUtensilsByType(utensilTypeId);

  // Safety fallback: global table has rows but none match this type — still return what we have.
  return localUtensils;
}

export async function loadUtensilsByTypeIdsWithInitialSync(utensilTypeIds) {
  await ensureUtensilsTable();
  const count = await getUtensilsCount();

  if (count === 0) {
    const utensilsFromApi = await fetchUtensilsFromApi();
    await replaceUtensils(utensilsFromApi);
    return getUtensilsByTypeIds(utensilTypeIds);
  }

  return getUtensilsByTypeIds(utensilTypeIds);
}

export async function refreshUtensilsFromApi(utensilTypeId) {
  await ensureUtensilsTable();
  const utensilsFromApi = await fetchUtensilsFromApi();
  await replaceUtensils(utensilsFromApi);
  return getUtensilsByType(utensilTypeId);
}
