import crypto from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { requireAuthApi } from '../middleware/requireAuth';
import { AgentError, askQuestion } from '../services/aiAgent';
import { toCsv } from '../services/csv';
import type { HistoryEntry } from '../types';

export const askRouter = Router();

const MAX_HISTORY = 10;

const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Você fez perguntas demais em pouco tempo. Aguarde um minuto e tente de novo.',
  },
});

askRouter.use(requireAuthApi);

askRouter.post('/ask', askLimiter, express.json({ limit: '10kb' }), async (req, res) => {
  const raw: unknown = req.body?.question;
  const question = typeof raw === 'string' ? raw.trim() : '';

  if (!question) {
    return res.status(400).json({ error: 'Digite uma pergunta.' });
  }
  if (question.length > config.maxQuestionLength) {
    return res
      .status(400)
      .json({ error: `A pergunta pode ter no máximo ${config.maxQuestionLength} caracteres.` });
  }

  try {
    const result = await askQuestion(question);
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      question,
      ...result,
      createdAt: new Date().toISOString(),
    };
    req.session.history = [entry, ...(req.session.history ?? [])].slice(0, MAX_HISTORY);
    res.json(entry);
  } catch (err) {
    const agentError = err instanceof AgentError ? err : new AgentError('Erro inesperado.');
    if (!(err instanceof AgentError)) console.error('Erro inesperado em /api/ask:', err);
    res.status(agentError.status).json({ error: agentError.userMessage });
  }
});

askRouter.get('/history', (req, res) => {
  const list = (req.session.history ?? []).map(({ id, question, createdAt }) => ({
    id,
    question,
    createdAt,
  }));
  res.json(list);
});

askRouter.get('/history/:id', (req, res) => {
  const entry = req.session.history?.find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Pergunta não encontrada no histórico.' });
  res.json(entry);
});

askRouter.get('/history/:id/csv', (req, res) => {
  const entry = req.session.history?.find((item) => item.id === req.params.id);
  if (!entry || entry.columns.length === 0) {
    return res.status(404).json({ error: 'Não há resultado para exportar.' });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="resultado-${entry.id.slice(0, 8)}.csv"`,
  );
  res.send(toCsv(entry.columns, entry.rows));
});
