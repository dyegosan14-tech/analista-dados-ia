import type { ChartSpec } from './services/chartSelector';

export type HistoryEntry = {
  id: string;
  question: string;
  answer: string;
  sql: string | null;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  chart: ChartSpec | null;
  createdAt: string;
};

declare module 'express-session' {
  interface SessionData {
    user?: string;
    history?: HistoryEntry[];
  }
}
