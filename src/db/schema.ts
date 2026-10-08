import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  regiao TEXT NOT NULL,
  data_cadastro TEXT NOT NULL
);

CREATE TABLE produtos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  preco REAL NOT NULL,
  custo REAL NOT NULL
);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  data TEXT NOT NULL,
  status TEXT NOT NULL,
  canal TEXT NOT NULL
);

CREATE TABLE itens_pedido (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade INTEGER NOT NULL,
  preco_unitario REAL NOT NULL
);

CREATE INDEX idx_pedidos_data ON pedidos(data);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_itens_pedido ON itens_pedido(pedido_id);
CREATE INDEX idx_itens_produto ON itens_pedido(produto_id);
`;

const TABLES = ['clientes', 'produtos', 'pedidos', 'itens_pedido'] as const;

function distinct(db: Database.Database, table: string, column: string): string[] {
  const rows = db.prepare(`SELECT DISTINCT ${column} AS v FROM ${table} ORDER BY 1`).all() as {
    v: string;
  }[];
  return rows.map((r) => r.v);
}

/** Descreve o schema real do banco (colunas + valores possíveis) para o prompt da IA. */
export function describeSchema(db: Database.Database): string {
  const lines: string[] = [];
  for (const table of TABLES) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
      type: string;
    }[];
    lines.push(`- ${table}(${cols.map((c) => `${c.name} ${c.type}`).join(', ')})`);
  }

  const range = db.prepare('SELECT MIN(data) AS inicio, MAX(data) AS fim FROM pedidos').get() as {
    inicio: string;
    fim: string;
  };

  lines.push('');
  lines.push(
    'Relacionamentos: pedidos.cliente_id -> clientes.id; itens_pedido.pedido_id -> pedidos.id; itens_pedido.produto_id -> produtos.id.',
  );
  lines.push('Valores possíveis:');
  lines.push(`- pedidos.status: ${distinct(db, 'pedidos', 'status').join(', ')}`);
  lines.push(`- pedidos.canal: ${distinct(db, 'pedidos', 'canal').join(', ')}`);
  lines.push(`- produtos.categoria: ${distinct(db, 'produtos', 'categoria').join(', ')}`);
  lines.push(`- clientes.regiao: ${distinct(db, 'clientes', 'regiao').join(', ')}`);
  lines.push(`- clientes.estado: ${distinct(db, 'clientes', 'estado').join(', ')}`);
  lines.push(
    `Período dos pedidos: ${range.inicio} até ${range.fim} (datas no formato ISO YYYY-MM-DD).`,
  );
  return lines.join('\n');
}

export type StoreKpis = {
  totalPedidos: number;
  receitaTotal: number;
  totalClientes: number;
  totalProdutos: number;
  ticketMedio: number;
};

export function getStoreKpis(db: Database.Database): StoreKpis {
  try {
    const result = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM pedidos WHERE status != 'cancelado') as totalPedidos,
          (SELECT ROUND(SUM(ip.quantidade * ip.preco_unitario), 2)
             FROM itens_pedido ip
             JOIN pedidos p ON p.id = ip.pedido_id
            WHERE p.status != 'cancelado') as receitaTotal,
          (SELECT COUNT(DISTINCT id) FROM clientes) as totalClientes,
          (SELECT COUNT(DISTINCT id) FROM produtos) as totalProdutos`,
      )
      .get() as {
        totalPedidos: number | null;
        receitaTotal: number | null;
        totalClientes: number | null;
        totalProdutos: number | null;
      };

    const totalPedidos = result?.totalPedidos ?? 0;
    const receitaTotal = result?.receitaTotal ?? 0;
    const totalClientes = result?.totalClientes ?? 0;
    const totalProdutos = result?.totalProdutos ?? 0;
    const ticketMedio = totalPedidos > 0 ? Number((receitaTotal / totalPedidos).toFixed(2)) : 0;

    return {
      totalPedidos,
      receitaTotal,
      totalClientes,
      totalProdutos,
      ticketMedio,
    };
  } catch {
    return {
      totalPedidos: 0,
      receitaTotal: 0,
      totalClientes: 0,
      totalProdutos: 0,
      ticketMedio: 0,
    };
  }
}
