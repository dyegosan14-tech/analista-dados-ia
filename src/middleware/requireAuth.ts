import type { NextFunction, Request, Response } from 'express';

/** Páginas: redireciona para o login quando não há sessão. */
export function requireAuthPage(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) return next();
  res.redirect('/login');
}

/** API: responde 401 em JSON. */
export function requireAuthApi(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Sessão expirada. Faça login novamente.', loginRequired: true });
}
