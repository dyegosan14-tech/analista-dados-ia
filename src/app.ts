import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { config } from './config';
import { askRouter } from './routes/ask';
import { authRouter } from './routes/auth';
import { pagesRouter } from './routes/pages';
import './types';

export function createApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', config.paths.views);

  // Cabeçalhos de segurança. CSP restritiva: só recursos do próprio servidor, sem scripts inline.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  app.use(
    session({
      name: 'analista.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use('/static', express.static(config.paths.public, { maxAge: config.isProd ? '1h' : 0 }));
  app.use(
    '/vendor/chartjs',
    express.static(config.paths.chartJs, { maxAge: config.isProd ? '1d' : 0 }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(authRouter);
  app.use(pagesRouter);
  app.use('/api', askRouter);

  app.use((req, res) => {
    if (req.path.startsWith('/api/'))
      return res.status(404).json({ error: 'Rota não encontrada.' });
    res.status(404).render('error', {
      title: 'Página não encontrada',
      message: 'A página que você procura não existe.',
    });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const isJsonParse = err instanceof SyntaxError && 'body' in err;
    if (!isJsonParse) console.error('Erro não tratado:', err);
    const status = isJsonParse ? 400 : 500;
    const message = isJsonParse ? 'JSON inválido.' : 'Erro interno do servidor.';
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
    res.status(status).render('error', { title: 'Ops!', message });
  });

  return app;
}
