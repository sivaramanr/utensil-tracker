import { getDatabase } from '../../../core/db';
import { apiGet } from '../../../core/api/client';
import { normalizeApiList } from '../../../core/utils/normalize';

const ITEM_GROUPS_TABLE = 'ItemGroups';

export async function ensureItemGroupsTable() {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${ITEM_GROUPS_TABLE} (
      id TEXT PRIMARY KEY,
      name TEXT,
      isActive BOOLEAN,
      "order" INTEGER
    );
  `);
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
  if (!Array.isArray(itemGroupIds) || itemGroupIds.length === 0) return [];
  const itemGroups = await getItemGroups();
  const map = new Map(itemGroups.map((g) => [g.id, g]));
  return itemGroupIds.map((id) => map.get(id) ?? { id, name: id, isActive: true, order: null });
}

async function getItemGroupsCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${ITEM_GROUPS_TABLE};`);
  return Number(row?.count ?? 0);
}

function normalizeItemGroups(payload) {
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

async function fetchItemGroupsFromApi() {
  const payload = await apiGet('/genericmodel', {
    params: { genericType: 'RECIPE_GROUP', page: '0', size: '500' },
    label: 'Item Groups API',
  });
  return normalizeItemGroups(payload);
}

async function replaceItemGroups(itemGroups) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${ITEM_GROUPS_TABLE};`);
    for (const itemGroup of itemGroups) {
      await db.runAsync(
        `INSERT INTO ${ITEM_GROUPS_TABLE} (id, name, isActive, "order") VALUES (?, ?, ?, ?);`,
        itemGroup.id, itemGroup.name, itemGroup.isActive ? 1 : 0, itemGroup.order
      );
    }
  });
}

export async function loadItemGroupsWithInitialSync() {
  await ensureItemGroupsTable();
  const count = await getItemGroupsCount();
  if (count > 0) {
    const local = await getItemGroups();
    if (local.length > 0) return local;
  }
  const fromApi = await fetchItemGroupsFromApi();
  await replaceItemGroups(fromApi);
  return getItemGroups();
}

export async function loadItemGroupsByIdsWithInitialSync(itemGroupIds) {
  await loadItemGroupsWithInitialSync();
  return getItemGroupsByIds(itemGroupIds);
}

export async function refreshItemGroupsFromApi() {
  await ensureItemGroupsTable();
  const fromApi = await fetchItemGroupsFromApi();
  await replaceItemGroups(fromApi);
  return getItemGroups();
}
