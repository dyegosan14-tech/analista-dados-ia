import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Raiz do projeto: funciona tanto em src/ (dev com tsx) quanto em dist/ (build).
export const ROOT = path.resolve(__dirname, '..');

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: toInt(process.env.PORT, 3000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
  sessionSecret: process.env.SESSION_SECRET?.trim() || 'dev-only-secret-troque-em-producao',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  appUsername: process.env.APP_USERNAME?.trim() || 'admin',
  appPassword: process.env.APP_PASSWORD || 'admin123',
  usingDefaultPassword: !process.env.APP_PASSWORD,
  usingDefaultSecret: !process.env.SESSION_SECRET,
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/loja.db'),
  maxRows: toInt(process.env.MAX_ROWS, 200),
  queryTimeoutMs: toInt(process.env.QUERY_TIMEOUT_MS, 5000),
  maxQuestionLength: 500,
  maxAgentSteps: 5,
  paths: {
    views: path.join(ROOT, 'src', 'views'),
    public: path.join(ROOT, 'src', 'public'),
    chartJs: path.join(ROOT, 'node_modules', 'chart.js', 'dist'),
  },
} as const;
