import * as SQLite from 'expo-sqlite';
import { getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const UTENSIL_TYPES_TABLE = 'UtensilTypes';
const UTENSIL_TYPE_ITEM_GROUP_TABLE = 'UtensilTypeItemGroup';
const UTENSIL_TYPES_ENDPOINT = 'https://amrutha.cookerp.com/genericmodel';
const UTENSIL_TYPE_ITEM_GROUP_ENDPOINT = 'https://amrutha.cookerp.com/utensiltype';

let databasePromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function ensureUtensilTypesTable() {
  const db = await getDatabase();
  await db.execAsync(
    `
      CREATE TABLE IF NOT EXISTS ${UTENSIL_TYPES_TABLE} (
        id TEXT PRIMARY KEY,
        unitId TEXT,
        accountId TEXT,
        parentId TEXT,
        parentName TEXT,
        genericType TEXT,
        name TEXT,
        type TEXT,
        value TEXT,
        isActive BOOLEAN,
        description TEXT,
        "order" INTEGER,
        createdAt INTEGER,
        createdBy TEXT,
        updatedAt INTEGER,
        updatedBy TEXT
      );
    `
  );
}

export async function ensureUtensilTypeItemGroupTable() {
  const db = await getDatabase();
  await db.execAsync(
    `
      CREATE TABLE IF NOT EXISTS ${UTENSIL_TYPE_ITEM_GROUP_TABLE} (
        utensilTypeId TEXT NOT NULL,
        itemGroupId TEXT NOT NULL,
        PRIMARY KEY (utensilTypeId, itemGroupId)
      );
    `
  );
}

export async function getUtensilTypes() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT id, name, isActive, "order" FROM ${UTENSIL_TYPES_TABLE} ORDER BY "order" ASC, name ASC;`
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    isActive: Boolean(row.isActive),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : null,
  }));
}

export async function getUtensilTypesByItemGroup(itemGroupId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT t.id, t.name, t.isActive, t."order"
      FROM ${UTENSIL_TYPES_TABLE} t
      INNER JOIN ${UTENSIL_TYPE_ITEM_GROUP_TABLE} m ON m.utensilTypeId = t.id
      WHERE m.itemGroupId = ?
      ORDER BY t."order" ASC, t.name ASC;
    `,
    itemGroupId
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    isActive: Boolean(row.isActive),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : null,
  }));
}

async function getUtensilTypesCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${UTENSIL_TYPES_TABLE};`);
  return Number(row?.count ?? 0);
}

async function getUtensilTypeItemGroupCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${UTENSIL_TYPE_ITEM_GROUP_TABLE};`);
  return Number(row?.count ?? 0);
}

export async function getUtensilTypeItemGroups(utensilTypeId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT utensilTypeId, itemGroupId
      FROM ${UTENSIL_TYPE_ITEM_GROUP_TABLE}
      WHERE utensilTypeId = ?
      ORDER BY itemGroupId ASC;
    `,
    utensilTypeId
  );

  return rows.map((row) => ({
    utensilTypeId: row.utensilTypeId != null ? String(row.utensilTypeId) : null,
    itemGroupId: row.itemGroupId != null ? String(row.itemGroupId) : null,
  }));
}

function normalizeApiUtensilTypes(payload) {
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
      unitId: item?.unitId != null ? String(item.unitId) : null,
      accountId: item?.accountId != null ? String(item.accountId) : null,
      parentId: item?.parentId != null ? String(item.parentId) : null,
      parentName: item?.parentName != null ? String(item.parentName) : null,
      genericType: item?.genericType != null ? String(item.genericType) : null,
      name: item?.name != null ? String(item.name) : null,
      type: item?.type != null ? String(item.type) : null,
      value: item?.value != null ? String(item.value) : null,
      isActive: Boolean(item?.isActive),
      description: item?.description != null ? String(item.description) : null,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : null,
      createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : null,
      createdBy: item?.createdBy != null ? String(item.createdBy) : null,
      updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : null,
      updatedBy: item?.updatedBy != null ? String(item.updatedBy) : null,
    }))
    .filter((item) => item.id)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

function normalizeUtensilTypeItemGroups(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.content)
      ? payload.content
      : Array.isArray(payload?.result)
        ? payload.result
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

  return list.flatMap((item) => {
    const utensilTypeId = item?.utensilTypeId != null ? String(item.utensilTypeId) : null;
    const itemGroupIds = Array.isArray(item?.itemGroupIds) ? item.itemGroupIds : [];

    if (!utensilTypeId) {
      return [];
    }

    return itemGroupIds
      .map((itemGroupId) => ({
        utensilTypeId,
        itemGroupId: itemGroupId != null ? String(itemGroupId) : null,
      }))
      .filter((mapping) => mapping.itemGroupId);
  });
}

async function fetchUtensilTypeItemGroupsFromApi(accessToken, unitId) {
  const queryParams = new URLSearchParams({
    page: '0',
    size: '1000',
  });

  const response = await fetch(`${UTENSIL_TYPE_ITEM_GROUP_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Utensil Type Item Group API failed with status ${response.status}`);
  }

  const payload = await response.json();
  return normalizeUtensilTypeItemGroups(payload);
}

async function fetchUtensilTypesFromApi() {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const queryParams = new URLSearchParams({
    genericType: 'UTENSIL_TYPE',
    page: '0',
    size: '20',
  });

  const response = await fetch(`${UTENSIL_TYPES_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Utensil Types API failed with status ${response.status}`);
  }

  const payload = await response.json();
  const [normalizedUtensilTypes, normalizedItemGroups] = await Promise.all([
    Promise.resolve(normalizeApiUtensilTypes(payload)),
    fetchUtensilTypeItemGroupsFromApi(accessToken, unitId),
  ]);

  await replaceUtensilTypeItemGroups(normalizedItemGroups);

  return normalizedUtensilTypes;
}

async function replaceUtensilTypeItemGroups(list) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${UTENSIL_TYPE_ITEM_GROUP_TABLE};`);

    for (const item of list) {
      await db.runAsync(
        `
          INSERT INTO ${UTENSIL_TYPE_ITEM_GROUP_TABLE} (utensilTypeId, itemGroupId)
          VALUES (?, ?);
        `,
        item.utensilTypeId,
        item.itemGroupId
      );
    }
  });
}

async function replaceUtensilTypes(list) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${UTENSIL_TYPES_TABLE};`);

    for (const item of list) {
      await db.runAsync(
        `
          INSERT INTO ${UTENSIL_TYPES_TABLE} (
            id, unitId, accountId, parentId, parentName, genericType, name,
            type, value, isActive, description, "order", createdAt, createdBy,
            updatedAt, updatedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        item.id,
        item.unitId,
        item.accountId,
        item.parentId,
        item.parentName,
        item.genericType,
        item.name,
        item.type,
        item.value,
        item.isActive ? 1 : 0,
        item.description,
        item.order,
        item.createdAt,
        item.createdBy,
        item.updatedAt,
        item.updatedBy
      );
    }
  });
}

export async function loadUtensilTypesWithInitialSync() {
  await ensureUtensilTypesTable();
  await ensureUtensilTypeItemGroupTable();
  const [count, itemGroupCount] = await Promise.all([
    getUtensilTypesCount(),
    getUtensilTypeItemGroupCount(),
  ]);

  if (count === 0 || itemGroupCount === 0) {
    const typesFromApi = await fetchUtensilTypesFromApi();
    await replaceUtensilTypes(typesFromApi);
    return getUtensilTypes();
  }

  const localTypes = await getUtensilTypes();

  if (localTypes.length === 0) {
    const typesFromApi = await fetchUtensilTypesFromApi();
    await replaceUtensilTypes(typesFromApi);
    return getUtensilTypes();
  }

  return localTypes;
}

export async function loadUtensilTypesByItemGroupWithInitialSync(itemGroupId) {
  await ensureUtensilTypesTable();
  await ensureUtensilTypeItemGroupTable();

  const [count, itemGroupCount] = await Promise.all([
    getUtensilTypesCount(),
    getUtensilTypeItemGroupCount(),
  ]);

  if (count === 0 || itemGroupCount === 0) {
    const typesFromApi = await fetchUtensilTypesFromApi();
    await replaceUtensilTypes(typesFromApi);
  }

  return getUtensilTypesByItemGroup(itemGroupId);
}

export async function refreshUtensilTypesByItemGroupFromApi(itemGroupId) {
  await ensureUtensilTypesTable();
  await ensureUtensilTypeItemGroupTable();
  const typesFromApi = await fetchUtensilTypesFromApi();
  await replaceUtensilTypes(typesFromApi);
  return getUtensilTypesByItemGroup(itemGroupId);
}

export async function refreshUtensilTypesFromApi() {
  await ensureUtensilTypesTable();
  await ensureUtensilTypeItemGroupTable();
  const typesFromApi = await fetchUtensilTypesFromApi();
  await replaceUtensilTypes(typesFromApi);
  return getUtensilTypes();
}

export async function loadUtensilTypeItemGroupsWithInitialSync(utensilTypeId) {
  await ensureUtensilTypesTable();
  await ensureUtensilTypeItemGroupTable();

  const [typeCount, itemGroupCount] = await Promise.all([
    getUtensilTypesCount(),
    getUtensilTypeItemGroupCount(),
  ]);

  if (typeCount === 0 || itemGroupCount === 0) {
    const typesFromApi = await fetchUtensilTypesFromApi();
    await replaceUtensilTypes(typesFromApi);
  }

  return getUtensilTypeItemGroups(utensilTypeId);
}
