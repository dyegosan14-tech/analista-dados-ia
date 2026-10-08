export type ChartType = 'bar' | 'line' | 'pie';

export type ChartSpec = {
  type: ChartType;
  labels: string[];
  datasets: { label: string; data: number[] }[];
};

const MAX_POINTS_BAR = 30;
const MAX_POINTS_LINE = 60;
const MAX_SERIES = 4;

const TIME_LABEL = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function isNumericColumn(rows: unknown[][], index: number): boolean {
  let hasNumber = false;
  for (const row of rows) {
    const value = row[index];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    hasNumber = true;
  }
  return hasNumber;
}

/**
 * Escolhe automaticamente o tipo de gráfico pelo formato dos dados:
 * - 1ª coluna é rótulo (texto/data) e as demais colunas numéricas viram séries;
 * - rótulos de tempo (ano, mês, dia) -> linha;
 * - poucas categorias, 1 série e valores positivos -> pizza;
 * - caso contrário -> barras.
 * Retorna null quando o resultado não faz sentido como gráfico.
 */
export function suggestChart(columns: string[], rows: unknown[][]): ChartSpec | null {
  if (columns.length < 2 || rows.length < 2) return null;

  const numericIndexes: number[] = [];
  for (let c = 1; c < columns.length; c++) {
    if (isNumericColumn(rows, c)) numericIndexes.push(c);
  }
  if (numericIndexes.length === 0) return null;

  const allLabels = rows.map((row) => String(row[0] ?? '(vazio)'));
  const isTime = allLabels.every((label) => TIME_LABEL.test(label));
  const seriesIndexes = numericIndexes.slice(0, MAX_SERIES);

  const limit = isTime ? MAX_POINTS_LINE : MAX_POINTS_BAR;
  const labels = allLabels.slice(0, limit);
  const datasets = seriesIndexes.map((c) => ({
    label: columns[c] as string,
    data: rows.slice(0, limit).map((row) => Number(row[c] ?? 0)),
  }));

  let type: ChartType = 'bar';
  if (isTime) {
    type = 'line';
  } else if (
    datasets.length === 1 &&
    labels.length <= 6 &&
    (datasets[0]?.data ?? []).every((v) => v >= 0) &&
    (datasets[0]?.data ?? []).reduce((a, b) => a + b, 0) > 0
  ) {
    type = 'pie';
  }

  return { type, labels, datasets };
}
