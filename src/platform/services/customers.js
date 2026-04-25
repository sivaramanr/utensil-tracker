import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../../core/db';
import { apiGet } from '../../core/api/client';
import { getWorkInfo } from '../../core/auth';
import { normalizeApiList } from '../../core/utils/normalize';

export const CUSTOMERS_TABLE = 'Customers';
const CUSTOMERS_LAST_SYNC_KEY = 'customers_last_sync_at';

let ensureCustomersTablePromise = null;

export async function ensureCustomersTable() {
  if (!ensureCustomersTablePromise) {
    ensureCustomersTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
          id TEXT PRIMARY KEY, code TEXT, name TEXT, isActive BOOLEAN,
          "order" INTEGER, addressLine1 TEXT, addressLine2 TEXT, city TEXT,
          district TEXT, state TEXT, country TEXT, pincode TEXT,
          startDate TEXT, stopDate TEXT
        );
      `);
    })().catch((err) => { ensureCustomersTablePromise = null; throw err; });
  }
  await ensureCustomersTablePromise;
}

export async function getCustomers() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT id, code, name, isActive, "order", addressLine1, addressLine2, city,
     district, state, country, pincode, startDate, stopDate
     FROM ${CUSTOMERS_TABLE} ORDER BY "order" ASC;`
  );
  return rows.map((row) => ({
    id: String(row.id),
    code: row.code,
    name: row.name,
    isActive: Boolean(row.isActive),
    order: row.order,
    companyAddress: {
      line1: row.addressLine1, line2: row.addressLine2, city: row.city,
      district: row.district, state: row.state, country: row.country, pincode: row.pincode,
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

async function fetchCustomersFromApi() {
  const workInfo = await getWorkInfo();
  const unitId = workInfo?.companyId;
  const payload = await apiGet('/businessentity', {
    params: { entityType: 'CUSTOMER', page: '0', size: '200', unitId: String(unitId ?? '1'), isActive: 'true' },
    label: 'Customers API',
  });
  console.log('[CUSTOMERS][API][RAW_RESPONSE]', payload);
  const list = normalizeApiList(payload)
    .map((item) => ({
      id: item?.id != null ? String(item.id) : null,
      code: item?.code != null ? String(item.code) : null,
      name: item?.name != null ? String(item.name) : null,
      isActive: Boolean(item?.isActive),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : null,
      companyAddress: {
        line1: item?.companyAddress?.line1 ?? null, line2: item?.companyAddress?.line2 ?? null,
        city: item?.companyAddress?.city ?? null, district: item?.companyAddress?.district ?? null,
        state: item?.companyAddress?.state ?? null, country: item?.companyAddress?.country ?? null,
        pincode: item?.companyAddress?.pincode ?? null,
      },
      startDate: item?.startDate ?? null,
      stopDate: item?.stopDate ?? null,
    }))
    .filter((item) => item.id)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  console.log('[CUSTOMERS][API][NORMALIZED_COUNT]', list.length);
  return list;
}

async function replaceCustomers(customers) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ${CUSTOMERS_TABLE};`);
    for (const c of customers) {
      await db.runAsync(
        `INSERT INTO ${CUSTOMERS_TABLE}
         (id, code, name, isActive, "order", addressLine1, addressLine2, city,
          district, state, country, pincode, startDate, stopDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        c.id, c.code, c.name, c.isActive ? 1 : 0, c.order,
        c.companyAddress.line1, c.companyAddress.line2, c.companyAddress.city,
        c.companyAddress.district, c.companyAddress.state, c.companyAddress.country,
        c.companyAddress.pincode, c.startDate, c.stopDate
      );
    }
  });
  await AsyncStorage.setItem(CUSTOMERS_LAST_SYNC_KEY, new Date().toISOString());
}

export async function getCustomersLastSyncAt() {
  return AsyncStorage.getItem(CUSTOMERS_LAST_SYNC_KEY);
}

export async function loadCustomersWithInitialSync() {
  await ensureCustomersTable();
  const count = await getCustomersCount();
  if (count > 0) {
    const local = await getCustomers();
    if (local.length > 0) return local;
  }
  const fromApi = await fetchCustomersFromApi();
  await replaceCustomers(fromApi);
  return getCustomers();
}

export async function refreshCustomersFromApi() {
  await ensureCustomersTable();
  await replaceCustomers(await fetchCustomersFromApi());
  return getCustomers();
}
