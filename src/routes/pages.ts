import { Router } from 'express';
import { requireAuthPage } from '../middleware/requireAuth';

export const pagesRouter = Router();

export const SUGGESTED_QUESTIONS = [
  'Quais são os 5 produtos que mais geraram receita?',
  'Como evoluiu a receita mês a mês nos últimos 12 meses?',
  'Qual a receita total por região?',
  'Qual categoria tem a maior margem de lucro?',
  'Qual o ticket médio por canal de venda?',
  'Quais as 10 cidades com mais clientes?',
];

pagesRouter.get('/', requireAuthPage, (req, res) => {
  res.render('index', { user: req.session.user, suggestions: SUGGESTED_QUESTIONS });
});
