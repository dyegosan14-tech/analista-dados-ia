import { describe, expect, it } from 'vitest';
import { suggestChart } from '../src/services/chartSelector';

describe('suggestChart', () => {
  it('retorna null para resultado com 1 linha ou 1 coluna', () => {
    expect(suggestChart(['total'], [[10]])).toBeNull();
    expect(suggestChart(['categoria', 'total'], [['Cama', 10]])).toBeNull();
    expect(suggestChart(['nome'], [['a'], ['b']])).toBeNull();
  });

  it('retorna null quando não há coluna numérica', () => {
    expect(
      suggestChart(
        ['a', 'b'],
        [
          ['x', 'y'],
          ['z', 'w'],
        ],
      ),
    ).toBeNull();
  });

  it('usa linha para meses (YYYY-MM)', () => {
    const chart = suggestChart(
      ['mes', 'receita'],
      [
        ['2026-01', 10],
        ['2026-02', 20],
        ['2026-03', 15],
      ],
    );
    expect(chart?.type).toBe('line');
    expect(chart?.labels).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(chart?.datasets[0]?.data).toEqual([10, 20, 15]);
  });

  it('usa pizza para poucas categorias com valores positivos', () => {
    const chart = suggestChart(
      ['canal', 'pedidos'],
      [
        ['site', 50],
        ['app', 30],
        ['loja', 20],
      ],
    );
    expect(chart?.type).toBe('pie');
  });

  it('usa barras quando há muitas categorias', () => {
    const rows = Array.from({ length: 10 }, (_, i) => [`Produto ${i}`, i + 1]);
    expect(suggestChart(['produto', 'qtd'], rows)?.type).toBe('bar');
  });

  it('usa barras quando há mais de uma série, mesmo com poucas categorias', () => {
    const chart = suggestChart(
      ['regiao', 'receita', 'lucro'],
      [
        ['Sul', 10, 4],
        ['Norte', 8, 3],
      ],
    );
    expect(chart?.type).toBe('bar');
    expect(chart?.datasets).toHaveLength(2);
  });

  it('não usa pizza com valores negativos', () => {
    const chart = suggestChart(
      ['x', 'saldo'],
      [
        ['a', 5],
        ['b', -2],
      ],
    );
    expect(chart?.type).toBe('bar');
  });

  it('limita o número de pontos', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [`item ${i}`, i]);
    expect(suggestChart(['item', 'valor'], rows)?.labels).toHaveLength(30);
  });
});
