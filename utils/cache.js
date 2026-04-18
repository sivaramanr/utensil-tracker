import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'utensil_tracker.db';

const TABLES_TO_CLEAR = [
  'UtensilMovements',
  'UtensilMovementSync',
  'SessionDataCustomers',
  'SessionDataSync',
  'SessionDataCombos',
  'SessionDataItems',
];

let databasePromise;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function clearAppCache() {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const table of TABLES_TO_CLEAR) {
      try {
        await db.runAsync(`DELETE FROM ${table};`);
        console.log(`Cleared ${table}`);
      } catch (error) {
        console.log(`Error clearing ${table}:`, error);
      }
    }
  });
}
