import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/services/csv';

describe('toCsv', () => {
  it('gera BOM, separador ; e decimal com vírgula (padrão pt-BR)', () => {
    const csv = toCsv(['produto', 'preco'], [['Toalha', 19.9]]);
    expect(csv).toBe('\uFEFFproduto;preco\r\nToalha;19,9\r\n');
  });

  it('permite CSV padrão (vírgula e ponto)', () => {
    const csv = toCsv(['a', 'b'], [['x', 1.5]], { delimiter: ',', decimalSeparator: '.' });
    expect(csv).toBe('\uFEFFa,b\r\nx,1.5\r\n');
  });

  it('escapa aspas, separadores e quebras de linha', () => {
    const csv = toCsv(['t'], [['diz "oi"; ok'], ['linha1\nlinha2']]);
    expect(csv).toContain('"diz ""oi""; ok"');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it('neutraliza injeção de fórmula em textos, sem afetar números negativos', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['=1+1', -5],
        ['@SOMA(A1)', null],
      ],
    );
    expect(csv).toContain("'=1+1;-5");
    expect(csv).toContain("'@SOMA(A1);");
  });
});
