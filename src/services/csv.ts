export type CsvOptions = {
  /** Excel em pt-BR espera ponto e vírgula como separador. */
  delimiter?: string;
  /** Excel em pt-BR espera vírgula como separador decimal. */
  decimalSeparator?: string;
};

const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(value: unknown, delimiter: string, decimal: string): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (typeof value === 'number') {
    text = String(value);
    if (decimal !== '.') text = text.replace('.', decimal);
  } else {
    text = String(value);
    // Evita "injeção de fórmula" ao abrir o CSV no Excel/Sheets.
    if (FORMULA_START.test(text)) text = `'${text}`;
  }

  if (
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text.includes(delimiter)
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(columns: string[], rows: unknown[][], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ';';
  const decimal = options.decimalSeparator ?? ',';

  const lines = [
    columns.map((c) => formatCell(c, delimiter, decimal)).join(delimiter),
    ...rows.map((row) => row.map((cell) => formatCell(cell, delimiter, decimal)).join(delimiter)),
  ];

  // BOM para o Excel reconhecer UTF-8 (acentos).
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
