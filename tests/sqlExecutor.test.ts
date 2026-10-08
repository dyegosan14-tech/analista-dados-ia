import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeReadOnlyQuery, QueryError } from '../src/services/sqlExecutor';

let dir: string;
let dbPath: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analista-'));
  dbPath = path.join(dir, 'teste.db');
  const db = new Database(dbPath);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)');
  const insert = db.prepare('INSERT INTO t (nome) VALUES (?)');
  for (let i = 1; i <= 50; i++) insert.run(`item ${i}`);
  db.close();
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('executeReadOnlyQuery', () => {
  it('executa SELECT e devolve colunas e linhas', async () => {
    const result = await executeReadOnlyQuery('SELECT id, nome FROM t ORDER BY id LIMIT 3', {
      dbPath,
    });
    expect(result.columns).toEqual(['id', 'nome']);
    expect(result.rows).toEqual([
      [1, 'item 1'],
      [2, 'item 2'],
      [3, 'item 3'],
    ]);
    expect(result.truncated).toBe(false);
  });

  it('funciona com CTE', async () => {
    const result = await executeReadOnlyQuery(
      'WITH x AS (SELECT COUNT(*) AS n FROM t) SELECT n FROM x',
      { dbPath },
    );
    expect(result.rows).toEqual([[50]]);
  });

  it('limita o número de linhas e sinaliza o corte', async () => {
    const result = await executeReadOnlyQuery('SELECT id FROM t ORDER BY id', {
      dbPath,
      maxRows: 10,
    });
    expect(result.rows).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('rejeita SQL proibida antes de executar', async () => {
    await expect(executeReadOnlyQuery('DELETE FROM t', { dbPath })).rejects.toBeInstanceOf(
      QueryError,
    );
    await expect(executeReadOnlyQuery('SELECT 1; DROP TABLE t', { dbPath })).rejects.toBeInstanceOf(
      QueryError,
    );
    const check = await executeReadOnlyQuery('SELECT COUNT(*) FROM t', { dbPath });
    expect(check.rows).toEqual([[50]]);
  });

  it('devolve erro amigável para SQL inválida', async () => {
    await expect(
      executeReadOnlyQuery('SELECT coluna_que_nao_existe FROM t', { dbPath }),
    ).rejects.toThrow(/no such column/i);
  });

  it('interrompe consultas que passam do tempo limite', async () => {
    const started = Date.now();
    await expect(
      executeReadOnlyQuery(
        'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c',
        { dbPath, timeoutMs: 400 },
      ),
    ).rejects.toThrow(/tempo limite/i);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
