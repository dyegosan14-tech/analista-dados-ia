import { describe, expect, it } from 'vitest';
import { validateSql } from '../src/services/sqlValidator';

const ok = (sql: string) => {
  const result = validateSql(sql);
  expect(result.ok, `deveria aceitar: ${sql}`).toBe(true);
};
const blocked = (sql: unknown) => {
  const result = validateSql(sql);
  expect(result.ok, `deveria bloquear: ${String(sql)}`).toBe(false);
};

describe('validateSql — consultas permitidas', () => {
  it('aceita SELECT simples', () => {
    ok('SELECT * FROM produtos');
    ok("select nome, preco from produtos where categoria = 'Cama' order by preco desc limit 5");
  });

  it('aceita SELECT com agregações e JOINs', () => {
    ok(`SELECT p.categoria, SUM(i.quantidade * i.preco_unitario) AS receita
        FROM itens_pedido i JOIN produtos p ON p.id = i.produto_id
        JOIN pedidos o ON o.id = i.pedido_id
        WHERE o.status != 'cancelado' GROUP BY p.categoria ORDER BY receita DESC`);
  });

  it('aceita CTE (WITH ... SELECT)', () => {
    ok('WITH t AS (SELECT categoria, COUNT(*) n FROM produtos GROUP BY categoria) SELECT * FROM t');
  });

  it('aceita ponto e vírgula final e espaços extras', () => {
    const result = validateSql('  SELECT 1;  ');
    expect(result).toEqual({ ok: true, sql: 'SELECT 1' });
  });

  it('aceita a função REPLACE() (só bloqueia REPLACE INTO)', () => {
    ok("SELECT REPLACE(nome, 'Toalha', 'Toalhinha') FROM produtos");
  });

  it('não confunde palavras proibidas dentro de strings ou identificadores', () => {
    ok("SELECT * FROM produtos WHERE nome LIKE '%drop%' OR nome = 'update; delete'");
    ok('SELECT nome AS "delete" FROM produtos');
    ok("SELECT 'it''s; DROP TABLE x' AS texto");
  });

  it('aceita strftime e funções de data', () => {
    ok("SELECT strftime('%Y-%m', data) AS mes, COUNT(*) FROM pedidos GROUP BY mes");
  });
});

describe('validateSql — comandos proibidos', () => {
  it.each([
    "INSERT INTO produtos (nome) VALUES ('x')",
    'UPDATE produtos SET preco = 0',
    'DELETE FROM pedidos',
    'DROP TABLE clientes',
    'ALTER TABLE produtos ADD COLUMN x TEXT',
    'CREATE TABLE x (id INTEGER)',
    "REPLACE INTO produtos (id, nome) VALUES (1, 'x')",
    'TRUNCATE TABLE pedidos',
    'PRAGMA table_info(produtos)',
    "ATTACH DATABASE 'outro.db' AS o",
    'DETACH DATABASE o',
    'VACUUM',
    'BEGIN',
    'COMMIT',
  ])('bloqueia: %s', (sql) => blocked(sql));

  it('bloqueia comandos escondidos dentro de CTE', () => {
    blocked('WITH t AS (SELECT 1) DELETE FROM pedidos');
    blocked("WITH t AS (SELECT 1) INSERT INTO produtos(nome) VALUES ('x')");
  });

  it('bloqueia variações de caixa e espaçamento', () => {
    blocked('dRoP   tAbLe clientes');
    blocked('SELECT 1 FROM produtos WHERE 1=1 UNION SELECT 1 FROM x; \n DrOp TABLE y');
  });
});

describe('validateSql — injeção e múltiplas instruções', () => {
  it('bloqueia múltiplas instruções', () => {
    blocked('SELECT 1; SELECT 2');
    blocked('SELECT 1; DROP TABLE clientes');
    blocked('SELECT * FROM produtos; DELETE FROM pedidos;');
  });

  it('bloqueia comentários (usados para esconder trechos)', () => {
    blocked('SELECT * FROM produtos -- WHERE 1=1');
    blocked('SELECT * FROM produtos /* ; DROP TABLE x */');
    blocked('SELECT 1 /**/; DROP TABLE x');
  });

  it('bloqueia tentativa de fechar a string e injetar comando', () => {
    blocked("SELECT * FROM produtos WHERE nome = 'a'; DROP TABLE produtos; --'");
    blocked("SELECT * FROM produtos WHERE nome = 'a' ; DELETE FROM pedidos");
  });

  it('bloqueia aspas sem fechamento', () => {
    blocked("SELECT * FROM produtos WHERE nome = 'abc");
    blocked('SELECT "abc FROM produtos');
  });

  it('bloqueia funções PRAGMA e tabelas internas do SQLite', () => {
    blocked("SELECT * FROM pragma_table_info('produtos')");
    blocked('SELECT name FROM sqlite_master');
    blocked('SELECT * FROM sqlite_schema');
  });

  it('bloqueia load_extension', () => {
    blocked("SELECT load_extension('evil.so')");
  });

  it('bloqueia entradas que não começam com SELECT/WITH', () => {
    blocked('EXPLAIN SELECT 1');
    blocked('VALUES (1)');
    blocked('(SELECT 1)');
    blocked('   ');
    blocked('');
  });

  it('bloqueia entradas que não são texto', () => {
    blocked(null);
    blocked(undefined);
    blocked(42);
    blocked({ sql: 'SELECT 1' });
  });

  it('bloqueia SQL gigante e caractere nulo', () => {
    blocked('SELECT ' + '1,'.repeat(3000) + '1');
    blocked('SELECT 1\u0000; DROP TABLE x');
  });
});
