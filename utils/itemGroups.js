import * as SQLite from 'expo-sqlite';
import { ensureAuthorizedResponse, getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const ITEM_GROUPS_TABLE = 'ItemGroups';
const ITEM_GROUPS_ENDPOINT = 'https://amrutha.cookerp.com/genericmodel';

let databasePromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function ensureItemGroupsTable() {
  const db = await getDatabase();
  await db.execAsync(
    `
      CREATE TABLE IF NOT EXISTS ${ITEM_GROUPS_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT,
        isActive BOOLEAN,
        "order" INTEGER
      );
    `
  );
}

export async function getItemGroups() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT id, name, isActive, "order" FROM ${ITEM_GROUPS_TABLE} ORDER BY "order" ASC, name ASC;`
  );

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name != null ? String(row.name) : '',
    isActive: Boolean(row.isActive),
    order: row.order,
  }));
}

export async function getItemGroupsByIds(itemGroupIds) {
  if (!Array.isArray(itemGroupIds) || itemGroupIds.length === 0) {
    return [];
  }

  const itemGroups = await getItemGroups();
  const itemGroupMap = new Map(itemGroups.map((itemGroup) => [itemGroup.id, itemGroup]));

  return itemGroupIds.map((itemGroupId) => {
    const itemGroup = itemGroupMap.get(itemGroupId);

    if (itemGroup) {
      return itemGroup;
    }

    return {
      id: itemGroupId,
      name: itemGroupId,
      isActive: true,
      order: null,
    };
  });
}

async function getItemGroupsCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${ITEM_GROUPS_TABLE};`);
  return Number(row?.count ?? 0);
}

function normalizeApiItemGroups(payload) {
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

async function fetchItemGroupsFromApi() {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;
  const queryParams = new URLSearchParams({
    genericType: 'RECIPE_GROUP',
    page: '0',
    size: '500',
  });

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const response = await fetch(`${ITEM_GROUPS_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  await ensureAuthorizedResponse(response, 'Item Groups API');

  const payload = await response.json();
  return normalizeApiItemGroups(payload);
}

async function replaceItemGroups(itemGroups) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${ITEM_GROUPS_TABLE};`);

    for (const itemGroup of itemGroups) {
      await db.runAsync(
        `INSERT INTO ${ITEM_GROUPS_TABLE} (id, name, isActive, "order") VALUES (?, ?, ?, ?);`,
        itemGroup.id,
        itemGroup.name,
        itemGroup.isActive ? 1 : 0,
        itemGroup.order
      );
    }
  });
}

export async function loadItemGroupsWithInitialSync() {
  await ensureItemGroupsTable();
  const count = await getItemGroupsCount();

  if (count === 0) {
    const itemGroupsFromApi = await fetchItemGroupsFromApi();
    await replaceItemGroups(itemGroupsFromApi);
    return getItemGroups();
  }

  const localItemGroups = await getItemGroups();

  if (localItemGroups.length === 0) {
    const itemGroupsFromApi = await fetchItemGroupsFromApi();
    await replaceItemGroups(itemGroupsFromApi);
    return getItemGroups();
  }

  return localItemGroups;
}

export async function refreshItemGroupsFromApi() {
  await ensureItemGroupsTable();
  const itemGroupsFromApi = await fetchItemGroupsFromApi();
  await replaceItemGroups(itemGroupsFromApi);
  return getItemGroups();
}

export async function loadItemGroupsByIdsWithInitialSync(itemGroupIds) {
  await loadItemGroupsWithInitialSync();
  return getItemGroupsByIds(itemGroupIds);
}
