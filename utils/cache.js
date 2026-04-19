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

  for (const table of TABLES_TO_CLEAR) {
    try {
      const existingTable = await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
        [table]
      );

      if (!existingTable) {
        console.log(`Skipped ${table} because it does not exist`);
        continue;
      }

      await db.execAsync(`DELETE FROM ${table};`);
      console.log(`Cleared ${table}`);
    } catch (error) {
      console.log(`Error clearing ${table}:`, error);
    }
  }
}
