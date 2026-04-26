import { getDatabase } from '../../core/db';
import { apiGet } from '../../core/api/client';
import { getWorkInfo } from '../../core/auth';
import { CUSTOMERS_TABLE, ensureCustomersTable } from './customers';

const SESSION_DATA_CUSTOMERS_TABLE = 'SessionDataCustomers';
const SESSION_DATA_SYNC_TABLE = 'SessionDataSync';
const SESSION_DATA_COMBOS_TABLE = 'SessionDataCombos';
const SESSION_DATA_ITEMS_TABLE = 'SessionDataItems';

let ensureSessionDataTablesPromise = null;

export async function ensureSessionDataTables() {
  if (!ensureSessionDataTablesPromise) {
    ensureSessionDataTablesPromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${SESSION_DATA_CUSTOMERS_TABLE} (
          cacheKey TEXT PRIMARY KEY, orderDate TEXT NOT NULL, sessionId TEXT NOT NULL,
          unitId TEXT, customerId TEXT NOT NULL, code TEXT, name TEXT,
          sortOrder INTEGER, totalPaxValue REAL, totalMainPaxValue REAL,
          payloadJson TEXT, syncedAt TEXT NOT NULL
        );
      `);
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${SESSION_DATA_SYNC_TABLE} (
          orderDate TEXT NOT NULL, sessionId TEXT NOT NULL, unitId TEXT,
          syncedAt TEXT NOT NULL, PRIMARY KEY (orderDate, sessionId)
        );
      `);
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${SESSION_DATA_COMBOS_TABLE} (
          cacheKey TEXT PRIMARY KEY, orderDate TEXT NOT NULL, sessionId TEXT NOT NULL,
          unitId TEXT, customerId TEXT NOT NULL, comboId TEXT NOT NULL,
          code TEXT, name TEXT, billableItemName TEXT, isMainItem BOOLEAN,
          salesOrderItemId TEXT, sortOrder INTEGER, totalPax REAL, actualPax REAL,
          perPaxPrice REAL, generalCost REAL, totalPaxPrice REAL,
          payloadJson TEXT, syncedAt TEXT NOT NULL
        );
      `);
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${SESSION_DATA_ITEMS_TABLE} (
          cacheKey TEXT PRIMARY KEY, orderDate TEXT NOT NULL, sessionId TEXT NOT NULL,
          unitId TEXT, customerId TEXT NOT NULL, comboId TEXT NOT NULL, itemId TEXT NOT NULL,
          code TEXT, name TEXT, sortOrder INTEGER, uomId TEXT, uomName TEXT,
          groupId TEXT, groupName TEXT, groupOrder INTEGER, portion REAL, quantity REAL,
          isGeneralCostApplicable BOOLEAN, generalCost REAL, requestedCost REAL,
          approvedCost REAL, actualCost REAL, menuPlanId TEXT, isActive BOOLEAN,
          menuPlanItemId TEXT, actualRecipeId TEXT, actualRecipeName TEXT,
          changeRecipeId TEXT, changeRecipeName TEXT, portionCost REAL,
          rawMaterialSetJson TEXT, tripsJson TEXT, payloadJson TEXT, syncedAt TEXT NOT NULL
        );
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_session_data_customers_context
        ON ${SESSION_DATA_CUSTOMERS_TABLE} (orderDate, sessionId);
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_session_data_combos_context
        ON ${SESSION_DATA_COMBOS_TABLE} (orderDate, sessionId, customerId);
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_session_data_items_context
        ON ${SESSION_DATA_ITEMS_TABLE} (orderDate, sessionId, customerId);
      `);
    })().catch((err) => { ensureSessionDataTablesPromise = null; throw err; });
  }
  await ensureSessionDataTablesPromise;
}

function normalizeSessionDataCustomers(payload) {
  const customersMap = payload?.customers;
  if (!customersMap || typeof customersMap !== 'object') return [];

  return Object.values(customersMap)
    .map((item) => ({
      customerId: item?.id != null ? String(item.id) : null,
      code: item?.code != null ? String(item.code) : null,
      name: item?.name != null ? String(item.name) : null,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : null,
      totalPaxValue: Number.isFinite(Number(item?.totalPaxValue)) ? Number(item.totalPaxValue) : 0,
      totalMainPaxValue: Number.isFinite(Number(item?.totalMainPaxValue)) ? Number(item.totalMainPaxValue) : 0,
      combos: Object.values(item?.combos ?? {})
        .map((combo) => ({
          comboId: combo?.id != null ? String(combo.id) : null,
          code: combo?.code != null ? String(combo.code) : null,
          name: combo?.name != null ? String(combo.name) : null,
          billableItemName: combo?.billableItemName != null ? String(combo.billableItemName) : null,
          isMainItem: Boolean(combo?.isMainItem),
          salesOrderItemId: combo?.salesOrderItemId != null ? String(combo.salesOrderItemId) : null,
          sortOrder: Number.isFinite(Number(combo?.sortOrder)) ? Number(combo.sortOrder) : null,
          totalPax: Number.isFinite(Number(combo?.totalPax)) ? Number(combo.totalPax) : 0,
          actualPax: Number.isFinite(Number(combo?.actualPax)) ? Number(combo.actualPax) : 0,
          perPaxPrice: Number.isFinite(Number(combo?.perPaxPrice)) ? Number(combo.perPaxPrice) : null,
          generalCost: Number.isFinite(Number(combo?.generalCost)) ? Number(combo.generalCost) : null,
          totalPaxPrice: Number.isFinite(Number(combo?.totalPaxPrice)) ? Number(combo.totalPaxPrice) : 0,
          items: Object.values(combo?.items ?? {})
            .map((si) => ({
              itemId: si?.id != null ? String(si.id) : null,
              code: si?.code != null ? String(si.code) : null,
              name: si?.name != null ? String(si.name) : null,
              sortOrder: Number.isFinite(Number(si?.sortOrder)) ? Number(si.sortOrder) : null,
              uomId: si?.uomId != null ? String(si.uomId) : null,
              uomName: si?.uomName != null ? String(si.uomName) : null,
              groupId: si?.groupId != null ? String(si.groupId) : null,
              groupName: si?.groupName != null ? String(si.groupName) : null,
              groupOrder: Number.isFinite(Number(si?.groupOrder)) ? Number(si.groupOrder) : null,
              portion: Number.isFinite(Number(si?.portion)) ? Number(si.portion) : null,
              quantity: Number.isFinite(Number(si?.quantity)) ? Number(si.quantity) : 0,
              isGeneralCostApplicable: Boolean(si?.isGeneralCostApplicable),
              generalCost: Number.isFinite(Number(si?.generalCost)) ? Number(si.generalCost) : null,
              requestedCost: Number.isFinite(Number(si?.requestedCost)) ? Number(si.requestedCost) : null,
              approvedCost: Number.isFinite(Number(si?.approvedCost)) ? Number(si.approvedCost) : null,
              actualCost: Number.isFinite(Number(si?.actualCost)) ? Number(si.actualCost) : null,
              menuPlanId: si?.menuPlanId != null ? String(si.menuPlanId) : null,
              isActive: Boolean(si?.isActive),
              menuPlanItemId: si?.menuPlanItemId != null ? String(si.menuPlanItemId) : null,
              actualRecipeId: si?.actualRecipeId != null ? String(si.actualRecipeId) : null,
              actualRecipeName: si?.actualRecipeName != null ? String(si.actualRecipeName) : null,
              changeRecipeId: si?.changeRecipeId != null ? String(si.changeRecipeId) : null,
              changeRecipeName: si?.changeRecipeName != null ? String(si.changeRecipeName) : null,
              portionCost: Number.isFinite(Number(si?.portionCost)) ? Number(si.portionCost) : 0,
              rawMaterialSetJson: JSON.stringify(si?.rawMaterialSet ?? []),
              tripsJson: JSON.stringify(si?.trips ?? []),
              payloadJson: JSON.stringify(si ?? {}),
            }))
            .filter((si) => si.itemId),
          payloadJson: JSON.stringify(combo ?? {}),
        }))
        .filter((combo) => combo.comboId),
      payloadJson: JSON.stringify(item ?? {}),
    }))
    .filter((item) => item.customerId)
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
}

async function fetchSessionDataFromApi({ orderDate, sessionId }) {
  const workInfo = await getWorkInfo();
  const unitId = workInfo?.companyId;
  if (!orderDate || !sessionId) throw new Error('Missing orderDate or sessionId.');

  const payload = await apiGet('/menuplan/query/sessiondata', {
    params: { orderDate, sessionId: String(sessionId), unitId: String(unitId) },
    label: 'Session data API',
  });
  return { unitId: String(unitId), customers: normalizeSessionDataCustomers(payload) };
}

async function replaceSessionDataCustomers({ orderDate, sessionId, unitId, customers }) {
  const db = await getDatabase();
  const syncedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM ${SESSION_DATA_CUSTOMERS_TABLE} WHERE orderDate = ? AND sessionId = ?;`,
      [orderDate, String(sessionId)]
    );
    await db.runAsync(
      `DELETE FROM ${SESSION_DATA_COMBOS_TABLE} WHERE orderDate = ? AND sessionId = ?;`,
      [orderDate, String(sessionId)]
    );
    await db.runAsync(
      `DELETE FROM ${SESSION_DATA_ITEMS_TABLE} WHERE orderDate = ? AND sessionId = ?;`,
      [orderDate, String(sessionId)]
    );

    for (const c of customers) {
      const cacheKey = `${orderDate}|${String(sessionId)}|${c.customerId}`;
      await db.runAsync(
        `INSERT INTO ${SESSION_DATA_CUSTOMERS_TABLE}
         (cacheKey, orderDate, sessionId, unitId, customerId, code, name,
          sortOrder, totalPaxValue, totalMainPaxValue, payloadJson, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [cacheKey, orderDate, String(sessionId), unitId, c.customerId, c.code, c.name,
         c.sortOrder, c.totalPaxValue, c.totalMainPaxValue, c.payloadJson, syncedAt]
      );

      for (const combo of c.combos ?? []) {
        const comboCacheKey = `${cacheKey}|${combo.comboId}`;
        await db.runAsync(
          `INSERT INTO ${SESSION_DATA_COMBOS_TABLE}
           (cacheKey, orderDate, sessionId, unitId, customerId, comboId, code, name,
            billableItemName, isMainItem, salesOrderItemId, sortOrder, totalPax, actualPax,
            perPaxPrice, generalCost, totalPaxPrice, payloadJson, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [comboCacheKey, orderDate, String(sessionId), unitId, c.customerId, combo.comboId,
           combo.code, combo.name, combo.billableItemName, combo.isMainItem ? 1 : 0,
           combo.salesOrderItemId, combo.sortOrder, combo.totalPax, combo.actualPax,
           combo.perPaxPrice, combo.generalCost, combo.totalPaxPrice, combo.payloadJson, syncedAt]
        );

        for (const si of combo.items ?? []) {
          const itemCacheKey = `${comboCacheKey}|${si.itemId}`;
          await db.runAsync(
            `INSERT INTO ${SESSION_DATA_ITEMS_TABLE}
             (cacheKey, orderDate, sessionId, unitId, customerId, comboId, itemId,
              code, name, sortOrder, uomId, uomName, groupId, groupName, groupOrder,
              portion, quantity, isGeneralCostApplicable, generalCost, requestedCost,
              approvedCost, actualCost, menuPlanId, isActive, menuPlanItemId,
              actualRecipeId, actualRecipeName, changeRecipeId, changeRecipeName,
              portionCost, rawMaterialSetJson, tripsJson, payloadJson, syncedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [itemCacheKey, orderDate, String(sessionId), unitId, c.customerId, combo.comboId,
             si.itemId, si.code, si.name, si.sortOrder, si.uomId, si.uomName,
             si.groupId, si.groupName, si.groupOrder, si.portion, si.quantity,
             si.isGeneralCostApplicable ? 1 : 0, si.generalCost, si.requestedCost,
             si.approvedCost, si.actualCost, si.menuPlanId, si.isActive ? 1 : 0,
             si.menuPlanItemId, si.actualRecipeId, si.actualRecipeName,
             si.changeRecipeId, si.changeRecipeName, si.portionCost,
             si.rawMaterialSetJson, si.tripsJson, si.payloadJson, syncedAt]
          );
        }
      }
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO ${SESSION_DATA_SYNC_TABLE} (orderDate, sessionId, unitId, syncedAt)
       VALUES (?, ?, ?, ?);`,
      [orderDate, String(sessionId), unitId, syncedAt]
    );
  });

  return syncedAt;
}

async function getSessionDataCustomersCount({ orderDate, sessionId }) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count FROM ${SESSION_DATA_CUSTOMERS_TABLE}
     WHERE orderDate = ? AND sessionId = ?;`,
    [orderDate, String(sessionId)]
  );
  return Number(row?.count ?? 0);
}

async function getSessionDataCustomers({ orderDate, sessionId }) {
  await ensureCustomersTable();
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT s.customerId, COALESCE(c.code, s.code) AS code, COALESCE(c.name, s.name) AS name,
     s.sortOrder, s.totalPaxValue, s.totalMainPaxValue, s.payloadJson,
     c.addressLine1, c.addressLine2, c.city
     FROM ${SESSION_DATA_CUSTOMERS_TABLE} s
     LEFT JOIN ${CUSTOMERS_TABLE} c ON c.id = s.customerId
     WHERE s.orderDate = ? AND s.sessionId = ?
     ORDER BY s.sortOrder ASC, name ASC;`,
    [orderDate, String(sessionId)]
  );
  return rows.map((row) => {
    let parsedPayload = null;
    try { parsedPayload = row.payloadJson ? JSON.parse(row.payloadJson) : null; } catch { /* empty */ }
    return {
      id: String(row.customerId),
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
      totalPaxValue: row.totalPaxValue,
      totalMainPaxValue: row.totalMainPaxValue,
      companyAddress: {
        line1: row.addressLine1 ?? parsedPayload?.companyAddress?.line1 ?? null,
        line2: row.addressLine2 ?? parsedPayload?.companyAddress?.line2 ?? null,
        city: row.city ?? parsedPayload?.companyAddress?.city ?? null,
      },
      payload: parsedPayload,
    };
  });
}

async function getSessionDataSyncAt({ orderDate, sessionId }) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT syncedAt FROM ${SESSION_DATA_SYNC_TABLE} WHERE orderDate = ? AND sessionId = ?;`,
    [orderDate, String(sessionId)]
  );
  return row?.syncedAt ?? null;
}

export async function loadSessionCustomersWithInitialSync({ orderDate, sessionId }) {
  await ensureSessionDataTables();
  if (!orderDate || !sessionId) return { customers: [], syncedAt: null };

  const count = await getSessionDataCustomersCount({ orderDate, sessionId });
  if (count > 0) {
    const [customers, syncedAt] = await Promise.all([
      getSessionDataCustomers({ orderDate, sessionId }),
      getSessionDataSyncAt({ orderDate, sessionId }),
    ]);
    return { customers, syncedAt };
  }

  const { unitId, customers } = await fetchSessionDataFromApi({ orderDate, sessionId });
  const syncedAt = await replaceSessionDataCustomers({ orderDate, sessionId, unitId, customers });
  return { customers: await getSessionDataCustomers({ orderDate, sessionId }), syncedAt };
}

export async function syncSessionCustomersFromApi({ orderDate, sessionId }) {
  await ensureSessionDataTables();
  if (!orderDate || !sessionId) return { customers: [], syncedAt: null };

  const { unitId, customers } = await fetchSessionDataFromApi({ orderDate, sessionId });
  const syncedAt = await replaceSessionDataCustomers({ orderDate, sessionId, unitId, customers });
  return { customers: await getSessionDataCustomers({ orderDate, sessionId }), syncedAt };
}

export async function getSessionCustomerItems({ orderDate, sessionId, customerId }) {
  await ensureSessionDataTables();
  if (!orderDate || !sessionId || !customerId) return [];

  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT i.itemId, i.menuPlanItemId, i.code, i.name, i.quantity, i.uomName,
     i.groupId, i.groupName, i.sortOrder, i.actualRecipeId, i.changeRecipeId,
     i.actualRecipeName, i.changeRecipeName,
     c.name AS comboName, c.billableItemName, c.sortOrder AS comboSortOrder
     FROM ${SESSION_DATA_ITEMS_TABLE} i
     LEFT JOIN ${SESSION_DATA_COMBOS_TABLE} c
       ON c.orderDate = i.orderDate AND c.sessionId = i.sessionId
       AND c.customerId = i.customerId AND c.comboId = i.comboId
     WHERE i.orderDate = ? AND i.sessionId = ? AND i.customerId = ?
     ORDER BY comboSortOrder ASC, i.sortOrder ASC, i.name ASC;`,
    [orderDate, String(sessionId), String(customerId)]
  );

  const itemsById = new Map();
  for (const row of rows) {
    const itemId = String(row.itemId);
    const existing = itemsById.get(itemId);
    const comboLabel = row.billableItemName || row.comboName || null;
    const recipeId = row.actualRecipeId || row.changeRecipeId;
    const recipeName = row.actualRecipeName || row.changeRecipeName;

    if (!existing) {
      itemsById.set(itemId, {
        id: itemId,
        despatchItemId: row.menuPlanItemId != null ? String(row.menuPlanItemId) : null,
        code: row.code,
        name: row.name,
        quantity: Number(row.quantity ?? 0),
        uomName: row.uomName,
        groupId: row.groupId != null ? String(row.groupId) : null,
        groupName: row.groupName != null ? String(row.groupName) : null,
        recipeId: recipeId != null ? String(recipeId) : null,
        recipeName: recipeName != null ? String(recipeName) : null,
        comboNames: comboLabel ? [comboLabel] : [],
      });
      continue;
    }
    existing.quantity += Number(row.quantity ?? 0);
    if (!existing.despatchItemId && row.menuPlanItemId != null) existing.despatchItemId = String(row.menuPlanItemId);
    if (!existing.recipeId && recipeId != null) existing.recipeId = String(recipeId);
    if (!existing.recipeName && recipeName != null) existing.recipeName = String(recipeName);
    if (comboLabel && !existing.comboNames.includes(comboLabel)) existing.comboNames.push(comboLabel);
  }

  return Array.from(itemsById.values()).map((item) => ({
    ...item,
    comboNamesLabel: item.comboNames.join(', '),
  }));
}

export async function getSessionCustomerCombos({ orderDate, sessionId, customerId }) {
  await ensureSessionDataTables();
  if (!orderDate || !sessionId || !customerId) return [];

  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT comboId, COALESCE(billableItemName, name) AS displayName, totalPax
     FROM ${SESSION_DATA_COMBOS_TABLE}
     WHERE orderDate = ? AND sessionId = ? AND customerId = ?
     ORDER BY sortOrder ASC, displayName ASC;`,
    [orderDate, String(sessionId), String(customerId)]
  );
  return rows.map((r) => ({
    id: String(r.comboId),
    name: r.displayName || 'Combo',
    totalPax: Number(r.totalPax ?? 0),
  }));
}
