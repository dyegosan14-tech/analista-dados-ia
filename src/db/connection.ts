import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from '../config';
import { seedDatabase } from './seed';

let readonlyDb: Database.Database | null = null;

/** Garante que o banco existe (cria e popula com dados fictícios na primeira execução). */
export function ensureDatabase(): void {
  if (!fs.existsSync(config.dbPath)) {
    console.log('Banco não encontrado. Gerando dados fictícios (seed)...');
    seedDatabase(config.dbPath);
  }
}

/** Conexão SOMENTE LEITURA usada pela aplicação. */
export function getReadonlyDb(): Database.Database {
  if (!readonlyDb) {
    ensureDatabase();
    readonlyDb = new Database(config.dbPath, { readonly: true, fileMustExist: true });
    readonlyDb.pragma('query_only = ON');
  }
  return readonlyDb;
}
