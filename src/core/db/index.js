import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'cookerp_mobile.db';

let databasePromise = null;

export function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return databasePromise;
}
