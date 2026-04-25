import { getDatabase } from '../../../core/db';
import { apiGet } from '../../../core/api/client';
import { normalizeApiList } from '../../../core/utils/normalize';

const CONTACTS_TABLE = 'FeedbackContacts';

let ensureContactsTablePromise = null;

export async function ensureContactsTable() {
  if (!ensureContactsTablePromise) {
    ensureContactsTablePromise = (async () => {
      const db = await getDatabase();
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${CONTACTS_TABLE} (
          contactId   TEXT NOT NULL,
          customerId  TEXT NOT NULL,
          entityId    TEXT,
          title       TEXT,
          firstname   TEXT,
          lastname    TEXT,
          isActive    INTEGER,
          description TEXT,
          designation TEXT,
          mobileNo1   TEXT,
          mobileNo2   TEXT,
          syncedAt    TEXT NOT NULL,
          PRIMARY KEY (contactId, customerId)
        );
      `);
      await db.runAsync(`
        CREATE INDEX IF NOT EXISTS idx_feedback_contacts_customer
        ON ${CONTACTS_TABLE} (customerId);
      `);
    })().catch((err) => { ensureContactsTablePromise = null; throw err; });
  }
  await ensureContactsTablePromise;
}

async function getContactsCount({ customerId }) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count FROM ${CONTACTS_TABLE} WHERE customerId = ?;`,
    [String(customerId)]
  );
  return Number(row?.count ?? 0);
}

export async function getContacts({ customerId }) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM ${CONTACTS_TABLE} WHERE customerId = ?
     ORDER BY firstname ASC, lastname ASC;`,
    [String(customerId)]
  );
  return rows.map(mapRow);
}

export async function getTotalContactsCount() {
  await ensureContactsTable();
  const db = await getDatabase();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS count FROM ${CONTACTS_TABLE};`);
  return Number(row?.count ?? 0);
}

async function fetchContactsFromApi({ customerId }) {
  const payload = await apiGet(`/businessentity/${customerId}/contact`, {
    label: 'Contacts API',
  });
  return normalizeApiList(payload).map((item) => ({
    contactId:   item?.contactId != null  ? String(item.contactId)  : null,
    entityId:    item?.entityId != null   ? String(item.entityId)   : null,
    title:       item?.title ?? null,
    firstname:   item?.firstname ?? null,
    lastname:    item?.lastname ?? null,
    isActive:    item?.isActive != null   ? Boolean(item.isActive)  : null,
    description: item?.description ?? null,
    designation: item?.designation ?? null,
    mobileNo1:   item?.mobileNo1 ?? null,
    mobileNo2:   item?.mobileNo2 || null,
  })).filter((c) => c.contactId);
}

async function replaceContacts({ customerId, contacts }) {
  const db = await getDatabase();
  const syncedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM ${CONTACTS_TABLE} WHERE customerId = ?;`,
      [String(customerId)]
    );
    for (const c of contacts) {
      await db.runAsync(
        `INSERT INTO ${CONTACTS_TABLE}
         (contactId, customerId, entityId, title, firstname, lastname,
          isActive, description, designation, mobileNo1, mobileNo2, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [c.contactId, String(customerId), c.entityId, c.title, c.firstname, c.lastname,
         c.isActive != null ? (c.isActive ? 1 : 0) : null,
         c.description, c.designation, c.mobileNo1, c.mobileNo2, syncedAt]
      );
    }
  });
}

export async function loadContactsWithInitialSync({ customerId }) {
  await ensureContactsTable();
  if (!customerId) return [];
  const count = await getContactsCount({ customerId });
  if (count > 0) return getContacts({ customerId });
  const fetched = await fetchContactsFromApi({ customerId });
  await replaceContacts({ customerId, contacts: fetched });
  return getContacts({ customerId });
}

export async function refreshContactsFromApi({ customerId }) {
  await ensureContactsTable();
  if (!customerId) return [];
  const fetched = await fetchContactsFromApi({ customerId });
  await replaceContacts({ customerId, contacts: fetched });
  return getContacts({ customerId });
}

function mapRow(row) {
  return {
    contactId:   row.contactId,
    customerId:  row.customerId,
    entityId:    row.entityId,
    title:       row.title,
    firstname:   row.firstname,
    lastname:    row.lastname,
    isActive:    row.isActive != null ? Boolean(row.isActive) : null,
    description: row.description,
    designation: row.designation,
    mobileNo1:   row.mobileNo1,
    mobileNo2:   row.mobileNo2,
    syncedAt:    row.syncedAt,
  };
}
