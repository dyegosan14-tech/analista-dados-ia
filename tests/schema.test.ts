import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { getStoreKpis, SCHEMA_SQL } from '../src/db/schema';

describe('getStoreKpis', () => {
  it('calcula métricas corretamente a partir do banco de dados', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    db.prepare(
      "INSERT INTO clientes (id, nome, cidade, estado, regiao, data_cadastro) VALUES (1, 'Ana', 'SP', 'SP', 'Sudeste', '2026-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO clientes (id, nome, cidade, estado, regiao, data_cadastro) VALUES (2, 'Bruno', 'RJ', 'RJ', 'Sudeste', '2026-01-02')",
    ).run();

    db.prepare(
      "INSERT INTO produtos (id, nome, categoria, preco, custo) VALUES (1, 'Lençol', 'Cama', 100, 50)",
    ).run();

    // Pedido 1: Concluído (Receita = 2 * 100 = 200)
    db.prepare(
      "INSERT INTO pedidos (id, cliente_id, data, status, canal) VALUES (1, 1, '2026-01-10', 'entregue', 'site')",
    ).run();
    db.prepare(
      'INSERT INTO itens_pedido (id, pedido_id, produto_id, quantidade, preco_unitario) VALUES (1, 1, 1, 2, 100)',
    ).run();

    // Pedido 2: Cancelado (deve ser desconsiderado na receita e no total de pedidos)
    db.prepare(
      "INSERT INTO pedidos (id, cliente_id, data, status, canal) VALUES (2, 2, '2026-01-11', 'cancelado', 'app')",
    ).run();
    db.prepare(
      'INSERT INTO itens_pedido (id, pedido_id, produto_id, quantidade, preco_unitario) VALUES (2, 2, 1, 1, 100)',
    ).run();

    const kpis = getStoreKpis(db);

    expect(kpis.totalClientes).toBe(2);
    expect(kpis.totalProdutos).toBe(1);
    expect(kpis.totalPedidos).toBe(1);
    expect(kpis.receitaTotal).toBe(200);
    expect(kpis.ticketMedio).toBe(200);

    db.close();
  });

  it('retorna zeros com segurança para banco vazio', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    const kpis = getStoreKpis(db);

    expect(kpis.totalClientes).toBe(0);
    expect(kpis.totalProdutos).toBe(0);
    expect(kpis.totalPedidos).toBe(0);
    expect(kpis.receitaTotal).toBe(0);
    expect(kpis.ticketMedio).toBe(0);

    db.close();
  });
});
