import { getDatabase } from '../../core/db';

// Tables cleared on user-triggered cache wipe.
// Add new module tables here when adding modules.
const TRANSIENT_TABLES = [
  'UtensilMovements',
  'UtensilMovementSync',
  'SessionDataCustomers',
  'SessionDataSync',
  'SessionDataCombos',
  'SessionDataItems',
];

export async function clearAppCache() {
  const db = await getDatabase();
  for (const table of TRANSIENT_TABLES) {
    try {
      const exists = await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
        [table]
      );
      if (!exists) {
        console.log(`Skipped ${table} (table does not exist)`);
        continue;
      }
      await db.execAsync(`DELETE FROM ${table};`);
      console.log(`Cleared ${table}`);
    } catch (error) {
      console.log(`Error clearing ${table}:`, error);
    }
  }
}
