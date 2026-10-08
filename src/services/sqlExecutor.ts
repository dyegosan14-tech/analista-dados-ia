import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { config, ROOT } from '../config';
import { validateSql } from './sqlValidator';

export type QueryResult = {
  sql: string;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
};

export class QueryError extends Error {}

export type ExecuteOptions = {
  dbPath?: string;
  maxRows?: number;
  timeoutMs?: number;
};

const nodeRequire = createRequire(path.join(ROOT, 'package.json'));

/**
 * Código do worker (JavaScript puro, executado via eval). Cada consulta roda em uma
 * thread separada com conexão SOMENTE LEITURA, o que permite encerrar a thread caso
 * a consulta passe do tempo limite (o better-sqlite3 não tem timeout nativo).
 */
const WORKER_CODE = `
const { parentPort, workerData } = require('node:worker_threads');
try {
  const Database = require(workerData.modulePath);
  const db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  const stmt = db.prepare(workerData.sql);
  if (!stmt.reader) throw new Error('A consulta não retorna linhas.');
  const columns = stmt.columns().map((c) => c.name);
  const rows = stmt.raw(true).all();
  db.close();
  parentPort.postMessage({ ok: true, columns, rows });
} catch (err) {
  parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
}
`;

function friendlySqliteError(message: string): string {
  return message.replace(/^SqliteError:\s*/i, '');
}

export async function executeReadOnlyQuery(
  rawSql: string,
  options: ExecuteOptions = {},
): Promise<QueryResult> {
  const dbPath = options.dbPath ?? config.dbPath;
  const maxRows = options.maxRows ?? config.maxRows;
  const timeoutMs = options.timeoutMs ?? config.queryTimeoutMs;

  const validation = validateSql(rawSql);
  if (!validation.ok) throw new QueryError(validation.reason);

  // Limita as linhas no próprio SQLite; pedimos 1 a mais para saber se houve corte.
  const limitedSql = `SELECT * FROM (${validation.sql}) LIMIT ${maxRows + 1}`;

  return new Promise<QueryResult>((resolve, reject) => {
    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: {
        modulePath: nodeRequire.resolve('better-sqlite3'),
        dbPath,
        sql: limitedSql,
      },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new QueryError(
            `A consulta passou do tempo limite de ${timeoutMs} ms. Simplifique-a ou filtre mais os dados.`,
          ),
        ),
      );
    }, timeoutMs);

    worker.on(
      'message',
      (msg: { ok: boolean; columns?: string[]; rows?: unknown[][]; error?: string }) => {
        finish(() => {
          if (!msg.ok)
            return reject(new QueryError(friendlySqliteError(msg.error ?? 'Erro desconhecido.')));
          const allRows = msg.rows ?? [];
          const truncated = allRows.length > maxRows;
          resolve({
            sql: validation.sql,
            columns: msg.columns ?? [],
            rows: truncated ? allRows.slice(0, maxRows) : allRows,
            truncated,
          });
        });
      },
    );

    worker.on('error', (err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      finish(() => reject(new QueryError(`Falha ao executar a consulta: ${detail}`)));
    });

    worker.on('exit', (code) => {
      finish(() => reject(new QueryError(`A consulta foi encerrada (código ${code}).`)));
    });
  });
}
