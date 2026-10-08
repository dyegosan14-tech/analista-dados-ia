import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const authRouter = Router();

// A senha configurada é transformada em hash bcrypt na inicialização e nunca fica em texto puro na comparação.
const passwordHash = bcrypt.hashSync(config.appPassword, 10);

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .render('login', { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  },
});

authRouter.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  // Sempre executa as duas verificações para não vazar qual campo estava errado (nem por tempo de resposta).
  const userOk = crypto.timingSafeEqual(sha256(username), sha256(config.appUsername));
  const passwordOk = await bcrypt.compare(password, passwordHash);

  if (!userOk || !passwordOk) {
    return res.status(401).render('login', { error: 'Usuário ou senha inválidos.' });
  }

  // Gera um novo ID de sessão após o login (evita fixação de sessão).
  req.session.regenerate((err) => {
    if (err)
      return res.status(500).render('login', { error: 'Não foi possível iniciar a sessão.' });
    req.session.user = username;
    req.session.history = [];
    res.redirect('/');
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('analista.sid');
    res.redirect('/login');
  });
});
