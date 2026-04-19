import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { ensureAuthorizedResponse, getAccessToken, getWorkInfo } from './auth';

const DATABASE_NAME = 'utensil_tracker.db';
const CUSTOMERS_TABLE = 'Customers';
const CUSTOMERS_ENDPOINT = 'https://amrutha.cookerp.com/businessentity';
const SESSION_DATA_ENDPOINT = 'https://amrutha.cookerp.com/menuplan/query/sessiondata';
const CUSTOMERS_LAST_SYNC_KEY = 'customers_last_sync_at';
const SESSION_DATA_CUSTOMERS_TABLE = 'SessionDataCustomers';
const SESSION_DATA_SYNC_TABLE = 'SessionDataSync';
const SESSION_DATA_COMBOS_TABLE = 'SessionDataCombos';
const SESSION_DATA_ITEMS_TABLE = 'SessionDataItems';

let databasePromise;
let ensureCustomersTablePromise;
let ensureSessionDataTablesPromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function ensureCustomersTable() {
  if (!ensureCustomersTablePromise) {
    ensureCustomersTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT,
            isActive BOOLEAN,
            "order" INTEGER,
            addressLine1 TEXT,
            addressLine2 TEXT,
            city TEXT,
            district TEXT,
            state TEXT,
            country TEXT,
            pincode TEXT,
            startDate TEXT,
            stopDate TEXT
          );
        `
      );
    })().catch((error) => {
      ensureCustomersTablePromise = null;
      throw error;
    });
  }

  await ensureCustomersTablePromise;
}

export async function ensureSessionDataTables() {
  if (!ensureSessionDataTablesPromise) {
    ensureSessionDataTablesPromise = (async () => {
      const db = await getDatabase();

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${SESSION_DATA_CUSTOMERS_TABLE} (
            cacheKey TEXT PRIMARY KEY,
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            unitId TEXT,
            customerId TEXT NOT NULL,
            code TEXT,
            name TEXT,
            sortOrder INTEGER,
            totalPaxValue REAL,
            totalMainPaxValue REAL,
            payloadJson TEXT,
            syncedAt TEXT NOT NULL
          );
        `
      );

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${SESSION_DATA_SYNC_TABLE} (
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            unitId TEXT,
            syncedAt TEXT NOT NULL,
            PRIMARY KEY (orderDate, sessionId)
          );
        `
      );

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${SESSION_DATA_COMBOS_TABLE} (
            cacheKey TEXT PRIMARY KEY,
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            unitId TEXT,
            customerId TEXT NOT NULL,
            comboId TEXT NOT NULL,
            code TEXT,
            name TEXT,
            billableItemName TEXT,
            isMainItem BOOLEAN,
            salesOrderItemId TEXT,
            sortOrder INTEGER,
            totalPax REAL,
            actualPax REAL,
            perPaxPrice REAL,
            generalCost REAL,
            totalPaxPrice REAL,
            payloadJson TEXT,
            syncedAt TEXT NOT NULL
          );
        `
      );

      await db.runAsync(
        `
          CREATE TABLE IF NOT EXISTS ${SESSION_DATA_ITEMS_TABLE} (
            cacheKey TEXT PRIMARY KEY,
            orderDate TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            unitId TEXT,
            customerId TEXT NOT NULL,
            comboId TEXT NOT NULL,
            itemId TEXT NOT NULL,
            code TEXT,
            name TEXT,
            sortOrder INTEGER,
            uomId TEXT,
            uomName TEXT,
            groupId TEXT,
            groupName TEXT,
            groupOrder INTEGER,
            portion REAL,
            quantity REAL,
            isGeneralCostApplicable BOOLEAN,
            generalCost REAL,
            requestedCost REAL,
            approvedCost REAL,
            actualCost REAL,
            menuPlanId TEXT,
            isActive BOOLEAN,
            menuPlanItemId TEXT,
            actualRecipeId TEXT,
            actualRecipeName TEXT,
            changeRecipeId TEXT,
            changeRecipeName TEXT,
            portionCost REAL,
            rawMaterialSetJson TEXT,
            tripsJson TEXT,
            payloadJson TEXT,
            syncedAt TEXT NOT NULL
          );
        `
      );

      await db.runAsync(
        `
          CREATE INDEX IF NOT EXISTS idx_session_data_customers_context
          ON ${SESSION_DATA_CUSTOMERS_TABLE} (orderDate, sessionId);
        `
      );

      await db.runAsync(
        `
          CREATE INDEX IF NOT EXISTS idx_session_data_combos_context
          ON ${SESSION_DATA_COMBOS_TABLE} (orderDate, sessionId, customerId);
        `
      );

      await db.runAsync(
        `
          CREATE INDEX IF NOT EXISTS idx_session_data_items_context
          ON ${SESSION_DATA_ITEMS_TABLE} (orderDate, sessionId, customerId);
        `
      );
    })().catch((error) => {
      ensureSessionDataTablesPromise = null;
      throw error;
    });
  }

  await ensureSessionDataTablesPromise;
}

export async function getCustomers() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT
        id,
        code,
        name,
        isActive,
        "order",
        addressLine1,
        addressLine2,
        city,
        district,
        state,
        country,
        pincode,
        startDate,
        stopDate
      FROM ${CUSTOMERS_TABLE}
      ORDER BY "order" ASC;
    `
  );

  return rows.map((row) => ({
    id: String(row.id),
    code: row.code,
    name: row.name,
    isActive: Boolean(row.isActive),
    order: row.order,
    companyAddress: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      city: row.city,
      district: row.district,
      state: row.state,
      country: row.country,
      pincode: row.pincode,
    },
    startDate: row.startDate,
    stopDate: row.stopDate,
  }));
}

async function getCustomersCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${CUSTOMERS_TABLE};`);
  return Number(row?.count ?? 0);
}

function normalizeApiCustomers(payload) {
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
      code: item?.code != null ? String(item.code) : null,
      name: item?.name != null ? String(item.name) : null,
      isActive: Boolean(item?.isActive),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : null,
      companyAddress: {
        line1: item?.companyAddress?.line1 ?? null,
        line2: item?.companyAddress?.line2 ?? null,
        city: item?.companyAddress?.city ?? null,
        district: item?.companyAddress?.district ?? null,
        state: item?.companyAddress?.state ?? null,
        country: item?.companyAddress?.country ?? null,
        pincode: item?.companyAddress?.pincode ?? null,
      },
      startDate: item?.startDate ?? null,
      stopDate: item?.stopDate ?? null,
    }))
    .filter((item) => item.id)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

function normalizeSessionDataCustomers(payload) {
  const customersMap = payload?.customers;

  if (!customersMap || typeof customersMap !== 'object') {
    return [];
  }

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
          billableItemName:
            combo?.billableItemName != null ? String(combo.billableItemName) : null,
          isMainItem: Boolean(combo?.isMainItem),
          salesOrderItemId:
            combo?.salesOrderItemId != null ? String(combo.salesOrderItemId) : null,
          sortOrder: Number.isFinite(Number(combo?.sortOrder)) ? Number(combo.sortOrder) : null,
          totalPax: Number.isFinite(Number(combo?.totalPax)) ? Number(combo.totalPax) : 0,
          actualPax: Number.isFinite(Number(combo?.actualPax)) ? Number(combo.actualPax) : 0,
          perPaxPrice: Number.isFinite(Number(combo?.perPaxPrice))
            ? Number(combo.perPaxPrice)
            : null,
          generalCost: Number.isFinite(Number(combo?.generalCost))
            ? Number(combo.generalCost)
            : null,
          totalPaxPrice: Number.isFinite(Number(combo?.totalPaxPrice))
            ? Number(combo.totalPaxPrice)
            : 0,
          items: Object.values(combo?.items ?? {})
            .map((sessionItem) => ({
              itemId: sessionItem?.id != null ? String(sessionItem.id) : null,
              code: sessionItem?.code != null ? String(sessionItem.code) : null,
              name: sessionItem?.name != null ? String(sessionItem.name) : null,
              sortOrder: Number.isFinite(Number(sessionItem?.sortOrder))
                ? Number(sessionItem.sortOrder)
                : null,
              uomId: sessionItem?.uomId != null ? String(sessionItem.uomId) : null,
              uomName: sessionItem?.uomName != null ? String(sessionItem.uomName) : null,
              groupId: sessionItem?.groupId != null ? String(sessionItem.groupId) : null,
              groupName: sessionItem?.groupName != null ? String(sessionItem.groupName) : null,
              groupOrder: Number.isFinite(Number(sessionItem?.groupOrder))
                ? Number(sessionItem.groupOrder)
                : null,
              portion: Number.isFinite(Number(sessionItem?.portion))
                ? Number(sessionItem.portion)
                : null,
              quantity: Number.isFinite(Number(sessionItem?.quantity))
                ? Number(sessionItem.quantity)
                : 0,
              isGeneralCostApplicable: Boolean(sessionItem?.isGeneralCostApplicable),
              generalCost: Number.isFinite(Number(sessionItem?.generalCost))
                ? Number(sessionItem.generalCost)
                : null,
              requestedCost: Number.isFinite(Number(sessionItem?.requestedCost))
                ? Number(sessionItem.requestedCost)
                : null,
              approvedCost: Number.isFinite(Number(sessionItem?.approvedCost))
                ? Number(sessionItem.approvedCost)
                : null,
              actualCost: Number.isFinite(Number(sessionItem?.actualCost))
                ? Number(sessionItem.actualCost)
                : null,
              menuPlanId:
                sessionItem?.menuPlanId != null ? String(sessionItem.menuPlanId) : null,
              isActive: Boolean(sessionItem?.isActive),
              menuPlanItemId:
                sessionItem?.menuPlanItemId != null ? String(sessionItem.menuPlanItemId) : null,
              actualRecipeId:
                sessionItem?.actualRecipeId != null ? String(sessionItem.actualRecipeId) : null,
              actualRecipeName:
                sessionItem?.actualRecipeName != null
                  ? String(sessionItem.actualRecipeName)
                  : null,
              changeRecipeId:
                sessionItem?.changeRecipeId != null ? String(sessionItem.changeRecipeId) : null,
              changeRecipeName:
                sessionItem?.changeRecipeName != null
                  ? String(sessionItem.changeRecipeName)
                  : null,
              portionCost: Number.isFinite(Number(sessionItem?.portionCost))
                ? Number(sessionItem.portionCost)
                : 0,
              rawMaterialSetJson: JSON.stringify(sessionItem?.rawMaterialSet ?? []),
              tripsJson: JSON.stringify(sessionItem?.trips ?? []),
              payloadJson: JSON.stringify(sessionItem ?? {}),
            }))
            .filter((sessionItem) => sessionItem.itemId),
          payloadJson: JSON.stringify(combo ?? {}),
        }))
        .filter((combo) => combo.comboId),
      payloadJson: JSON.stringify(item ?? {}),
    }))
    .filter((item) => item.customerId)
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
}

async function fetchCustomersFromApi() {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;
  const queryParams = new URLSearchParams({
    entityType: 'CUSTOMER',
    page: '0',
    size: '200',
    unitId: String(unitId ?? '1'),
    isActive: 'true',
  });

  console.log('Unit Id', unitId);

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const response = await fetch(`${CUSTOMERS_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: unitId,
      Accept: 'application/json',
    },
  });

  await ensureAuthorizedResponse(response, 'Customers API');

  const payload = await response.json();
  console.log('[CUSTOMERS][API][RAW_RESPONSE]', payload);

  const normalizedCustomers = normalizeApiCustomers(payload);
  console.log('[CUSTOMERS][API][NORMALIZED_COUNT]', normalizedCustomers.length);

  return normalizedCustomers;
}

async function fetchSessionDataFromApi({ orderDate, sessionId }) {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;

  if (!orderDate || !sessionId) {
    throw new Error('Missing orderDate or sessionId.');
  }

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId.');
  }

  const queryParams = new URLSearchParams({
    orderDate,
    sessionId: String(sessionId),
    unitId: String(unitId),
  });

  const response = await fetch(`${SESSION_DATA_ENDPOINT}?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      unitId: String(unitId),
      Accept: 'application/json',
    },
  });

  await ensureAuthorizedResponse(response, 'Session data API');

  const payload = await response.json();
  const customers = normalizeSessionDataCustomers(payload);

  return {
    unitId: String(unitId),
    customers,
  };
}

async function replaceCustomers(customers) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${CUSTOMERS_TABLE};`);

    for (const customer of customers) {
      await db.runAsync(
        `
          INSERT INTO ${CUSTOMERS_TABLE} (
            id,
            code,
            name,
            isActive,
            "order",
            addressLine1,
            addressLine2,
            city,
            district,
            state,
            country,
            pincode,
            startDate,
            stopDate
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        customer.id,
        customer.code,
        customer.name,
        customer.isActive ? 1 : 0,
        customer.order,
        customer.companyAddress.line1,
        customer.companyAddress.line2,
        customer.companyAddress.city,
        customer.companyAddress.district,
        customer.companyAddress.state,
        customer.companyAddress.country,
        customer.companyAddress.pincode,
        customer.startDate,
        customer.stopDate
      );
    }
  });

  await AsyncStorage.setItem(CUSTOMERS_LAST_SYNC_KEY, new Date().toISOString());
}

export async function getCustomersLastSyncAt() {
  return AsyncStorage.getItem(CUSTOMERS_LAST_SYNC_KEY);
}

async function getSessionDataCustomersCount({ orderDate, sessionId }) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `
      SELECT COUNT(*) AS count
      FROM ${SESSION_DATA_CUSTOMERS_TABLE}
      WHERE orderDate = ? AND sessionId = ?;
    `,
    [orderDate, String(sessionId)]
  );

  return Number(row?.count ?? 0);
}

async function replaceSessionDataCustomers({ orderDate, sessionId, unitId, customers }) {
  const db = await getDatabase();
  const syncedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        DELETE FROM ${SESSION_DATA_CUSTOMERS_TABLE}
        WHERE orderDate = ? AND sessionId = ?;
      `,
      [orderDate, String(sessionId)]
    );

    await db.runAsync(
      `
        DELETE FROM ${SESSION_DATA_COMBOS_TABLE}
        WHERE orderDate = ? AND sessionId = ?;
      `,
      [orderDate, String(sessionId)]
    );

    await db.runAsync(
      `
        DELETE FROM ${SESSION_DATA_ITEMS_TABLE}
        WHERE orderDate = ? AND sessionId = ?;
      `,
      [orderDate, String(sessionId)]
    );

    for (const customer of customers) {
      const cacheKey = `${orderDate}|${String(sessionId)}|${customer.customerId}`;

      await db.runAsync(
        `
          INSERT INTO ${SESSION_DATA_CUSTOMERS_TABLE} (
            cacheKey,
            orderDate,
            sessionId,
            unitId,
            customerId,
            code,
            name,
            sortOrder,
            totalPaxValue,
            totalMainPaxValue,
            payloadJson,
            syncedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          cacheKey,
          orderDate,
          String(sessionId),
          unitId,
          customer.customerId,
          customer.code,
          customer.name,
          customer.sortOrder,
          customer.totalPaxValue,
          customer.totalMainPaxValue,
          customer.payloadJson,
          syncedAt
        ]
      );

      for (const combo of customer.combos ?? []) {
        const comboCacheKey = `${orderDate}|${String(sessionId)}|${customer.customerId}|${combo.comboId}`;

        await db.runAsync(
          `
            INSERT INTO ${SESSION_DATA_COMBOS_TABLE} (
              cacheKey,
              orderDate,
              sessionId,
              unitId,
              customerId,
              comboId,
              code,
              name,
              billableItemName,
              isMainItem,
              salesOrderItemId,
              sortOrder,
              totalPax,
              actualPax,
              perPaxPrice,
              generalCost,
              totalPaxPrice,
              payloadJson,
              syncedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            comboCacheKey,
            orderDate,
            String(sessionId),
            unitId,
            customer.customerId,
            combo.comboId,
            combo.code,
            combo.name,
            combo.billableItemName,
            combo.isMainItem ? 1 : 0,
            combo.salesOrderItemId,
            combo.sortOrder,
            combo.totalPax,
            combo.actualPax,
            combo.perPaxPrice,
            combo.generalCost,
            combo.totalPaxPrice,
            combo.payloadJson,
            syncedAt
          ]
        );

        for (const sessionItem of combo.items ?? []) {
          const itemCacheKey = `${comboCacheKey}|${sessionItem.itemId}`;

          await db.runAsync(
            `
              INSERT INTO ${SESSION_DATA_ITEMS_TABLE} (
                cacheKey,
                orderDate,
                sessionId,
                unitId,
                customerId,
                comboId,
                itemId,
                code,
                name,
                sortOrder,
                uomId,
                uomName,
                groupId,
                groupName,
                groupOrder,
                portion,
                quantity,
                isGeneralCostApplicable,
                generalCost,
                requestedCost,
                approvedCost,
                actualCost,
                menuPlanId,
                isActive,
                menuPlanItemId,
                actualRecipeId,
                actualRecipeName,
                changeRecipeId,
                changeRecipeName,
                portionCost,
                rawMaterialSetJson,
                tripsJson,
                payloadJson,
                syncedAt
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `,
            [
              itemCacheKey,
              orderDate,
              String(sessionId),
              unitId,
              customer.customerId,
              combo.comboId,
              sessionItem.itemId,
              sessionItem.code,
              sessionItem.name,
              sessionItem.sortOrder,
              sessionItem.uomId,
              sessionItem.uomName,
              sessionItem.groupId,
              sessionItem.groupName,
              sessionItem.groupOrder,
              sessionItem.portion,
              sessionItem.quantity,
              sessionItem.isGeneralCostApplicable ? 1 : 0,
              sessionItem.generalCost,
              sessionItem.requestedCost,
              sessionItem.approvedCost,
              sessionItem.actualCost,
              sessionItem.menuPlanId,
              sessionItem.isActive ? 1 : 0,
              sessionItem.menuPlanItemId,
              sessionItem.actualRecipeId,
              sessionItem.actualRecipeName,
              sessionItem.changeRecipeId,
              sessionItem.changeRecipeName,
              sessionItem.portionCost,
              sessionItem.rawMaterialSetJson,
              sessionItem.tripsJson,
              sessionItem.payloadJson,
              syncedAt
            ]
          );
        }
      }
    }

    await db.runAsync(
      `
        INSERT OR REPLACE INTO ${SESSION_DATA_SYNC_TABLE} (
          orderDate,
          sessionId,
          unitId,
          syncedAt
        )
        VALUES (?, ?, ?, ?);
      `,
      [orderDate, String(sessionId), unitId, syncedAt]
    );
  });

  return syncedAt;
}

export async function getSessionCustomerItems({ orderDate, sessionId, customerId }) {
  await ensureSessionDataTables();

  if (!orderDate || !sessionId || !customerId) {
    return [];
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT
        i.itemId,
        i.menuPlanItemId,
        i.code,
        i.name,
        i.quantity,
        i.uomName,
        i.groupId,
        i.groupName,
        i.sortOrder,
        i.actualRecipeId,
        i.changeRecipeId,
        i.actualRecipeName,
        i.changeRecipeName,
        c.name AS comboName,
        c.billableItemName,
        c.sortOrder AS comboSortOrder
      FROM ${SESSION_DATA_ITEMS_TABLE} i
      LEFT JOIN ${SESSION_DATA_COMBOS_TABLE} c
        ON c.orderDate = i.orderDate
        AND c.sessionId = i.sessionId
        AND c.customerId = i.customerId
        AND c.comboId = i.comboId
      WHERE i.orderDate = ? AND i.sessionId = ? AND i.customerId = ?
      ORDER BY comboSortOrder ASC, i.sortOrder ASC, i.name ASC;
    `,
    [orderDate, String(sessionId), String(customerId)]
  );

  const itemsById = new Map();

  for (const row of rows) {
    const itemId = String(row.itemId);
    const existingItem = itemsById.get(itemId);
    const comboLabel = row.billableItemName || row.comboName || null;
    const recipeId = row.actualRecipeId || row.changeRecipeId;
    const recipeName = row.actualRecipeName || row.changeRecipeName;

    if (!existingItem) {
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

    existingItem.quantity += Number(row.quantity ?? 0);

    if (!existingItem.despatchItemId && row.menuPlanItemId != null) {
      existingItem.despatchItemId = String(row.menuPlanItemId);
    }

    if (!existingItem.recipeId && recipeId != null) {
      existingItem.recipeId = String(recipeId);
    }

    if (!existingItem.recipeName && recipeName != null) {
      existingItem.recipeName = String(recipeName);
    }

    if (comboLabel && !existingItem.comboNames.includes(comboLabel)) {
      existingItem.comboNames.push(comboLabel);
    }
  }

  return Array.from(itemsById.values()).map((item) => ({
    ...item,
    comboNamesLabel: item.comboNames.join(', '),
  }));
}

async function getSessionDataCustomers({ orderDate, sessionId }) {
  await ensureCustomersTable();

  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT
        s.customerId,
        COALESCE(c.code, s.code) AS code,
        COALESCE(c.name, s.name) AS name,
        s.sortOrder,
        s.totalPaxValue,
        s.totalMainPaxValue,
        s.payloadJson,
        c.addressLine1,
        c.addressLine2,
        c.city
      FROM ${SESSION_DATA_CUSTOMERS_TABLE} s
      LEFT JOIN ${CUSTOMERS_TABLE} c ON c.id = s.customerId
      WHERE s.orderDate = ? AND s.sessionId = ?
      ORDER BY s.sortOrder ASC, name ASC;
    `,
    [orderDate, String(sessionId)]
  );

  return rows.map((row) => {
    let parsedPayload = null;

    try {
      parsedPayload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
    } catch {
      parsedPayload = null;
    }

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
    `
      SELECT syncedAt
      FROM ${SESSION_DATA_SYNC_TABLE}
      WHERE orderDate = ? AND sessionId = ?;
    `,
    [orderDate, String(sessionId)]
  );

  return row?.syncedAt ?? null;
}

export async function loadSessionCustomersWithInitialSync({ orderDate, sessionId }) {
  await ensureSessionDataTables();

  if (!orderDate || !sessionId) {
    return {
      customers: [],
      syncedAt: null,
    };
  }

  const count = await getSessionDataCustomersCount({ orderDate, sessionId });

  if (count > 0) {
    const [customers, syncedAt] = await Promise.all([
      getSessionDataCustomers({ orderDate, sessionId }),
      getSessionDataSyncAt({ orderDate, sessionId }),
    ]);

    return {
      customers,
      syncedAt,
    };
  }

  const { unitId, customers } = await fetchSessionDataFromApi({ orderDate, sessionId });
  const syncedAt = await replaceSessionDataCustomers({
    orderDate,
    sessionId,
    unitId,
    customers,
  });

  return {
    customers: await getSessionDataCustomers({ orderDate, sessionId }),
    syncedAt,
  };
}

export async function syncSessionCustomersFromApi({ orderDate, sessionId }) {
  await ensureSessionDataTables();

  if (!orderDate || !sessionId) {
    return {
      customers: [],
      syncedAt: null,
    };
  }

  const { unitId, customers } = await fetchSessionDataFromApi({ orderDate, sessionId });
  const syncedAt = await replaceSessionDataCustomers({
    orderDate,
    sessionId,
    unitId,
    customers,
  });

  return {
    customers: await getSessionDataCustomers({ orderDate, sessionId }),
    syncedAt,
  };
}

export async function loadCustomersWithInitialSync() {
  await ensureCustomersTable();
  const count = await getCustomersCount();

  if (count === 0) {
    const customersFromApi = await fetchCustomersFromApi();
    await replaceCustomers(customersFromApi);
    return getCustomers();
  }

  const localCustomers = await getCustomers();

  if (localCustomers.length === 0) {
    const customersFromApi = await fetchCustomersFromApi();
    await replaceCustomers(customersFromApi);
    return getCustomers();
  }

  return localCustomers;
}

export async function refreshCustomersFromApi() {
  await ensureCustomersTable();
  const customersFromApi = await fetchCustomersFromApi();
  await replaceCustomers(customersFromApi);
  return getCustomers();
}
