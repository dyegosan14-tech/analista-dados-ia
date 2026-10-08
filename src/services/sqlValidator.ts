export type ValidationResult = { ok: true; sql: string } | { ok: false; reason: string };

const MAX_SQL_LENGTH = 5000;

/**
 * Palavras proibidas (verificadas fora de strings e identificadores entre aspas).
 * "REPLACE" é uma função válida de texto, por isso só bloqueamos "REPLACE INTO".
 */
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|truncate|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension|writefile|readfile|fts3_tokenizer)\b/i;
const REPLACE_INTO = /\breplace\s+into\b/i;
const PRAGMA_FUNCTIONS = /\bpragma_\w*/i;
const INTERNAL_TABLES = /\bsqlite_\w*/i;

type MaskResult = { masked: string } | { error: string };

/**
 * Percorre a SQL e substitui o conteúdo de strings ('...') e identificadores
 * ("...", `...`, [...]) por espaços, para que palavras dentro deles não sejam
 * confundidas com comandos. Rejeita comentários e aspas sem fechamento.
 */
function maskLiterals(sql: string): MaskResult {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1];

    if (ch === '-' && next === '-') return { error: 'Comentários (--) não são permitidos.' };
    if (ch === '/' && next === '*') return { error: 'Comentários (/* */) não são permitidos.' };

    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const closing = ch === '[' ? ']' : ch;
      let j = i + 1;
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === closing) {
          // aspas duplicadas dentro do literal ('' ou "") são escape
          if (closing !== ']' && sql[j + 1] === closing) {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) return { error: 'Aspas ou colchetes sem fechamento.' };
      out += ch + ' '.repeat(j - i - 1) + closing;
      i = j + 1;
      continue;
    }

    out += ch;
    i++;
  }

  return { masked: out };
}

export function validateSql(input: unknown): ValidationResult {
  if (typeof input !== 'string') return { ok: false, reason: 'A SQL precisa ser um texto.' };

  const sql = input
    .trim()
    .replace(/;+\s*$/, '')
    .trim();
  if (!sql) return { ok: false, reason: 'A SQL está vazia.' };
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, reason: 'A SQL é grande demais.' };
  if (sql.includes('\u0000')) return { ok: false, reason: 'Caracteres inválidos na SQL.' };

  const masking = maskLiterals(sql);
  if ('error' in masking) return { ok: false, reason: masking.error };
  const { masked } = masking;

  if (masked.includes(';')) {
    return { ok: false, reason: 'Apenas uma instrução SQL por vez é permitida.' };
  }

  if (!/^\s*(select|with)\b/i.test(masked)) {
    return { ok: false, reason: 'Apenas consultas SELECT (ou WITH ... SELECT) são permitidas.' };
  }

  const forbidden = masked.match(FORBIDDEN_KEYWORDS);
  if (forbidden) {
    return { ok: false, reason: `Comando não permitido: ${forbidden[0].toUpperCase()}.` };
  }
  if (REPLACE_INTO.test(masked)) {
    return { ok: false, reason: 'Comando não permitido: REPLACE INTO.' };
  }
  if (PRAGMA_FUNCTIONS.test(masked)) {
    return { ok: false, reason: 'Funções PRAGMA não são permitidas.' };
  }
  if (INTERNAL_TABLES.test(masked)) {
    return { ok: false, reason: 'Tabelas internas do SQLite não podem ser consultadas.' };
  }

  return { ok: true, sql };
}
