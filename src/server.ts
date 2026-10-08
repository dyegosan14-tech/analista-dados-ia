import { createApp } from './app';
import { config } from './config';
import { ensureDatabase, getReadonlyDb } from './db/connection';

function main() {
  if (config.isProd && (config.usingDefaultPassword || config.usingDefaultSecret)) {
    console.error('Em produção, defina APP_PASSWORD e SESSION_SECRET no ambiente (.env).');
    process.exit(1);
  }

  ensureDatabase();
  getReadonlyDb(); // abre a conexão de leitura já na inicialização (falha cedo se algo estiver errado)

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`\n  Analista de Dados com IA rodando em http://localhost:${config.port}\n`);
    if (!config.anthropicApiKey) {
      console.warn(
        '  ⚠  ANTHROPIC_API_KEY não definida: as perguntas vão falhar até você configurar o .env.',
      );
    }
    if (config.usingDefaultPassword) {
      console.warn(
        `  ⚠  Usando login padrão (${config.appUsername} / admin123). Defina APP_PASSWORD no .env.`,
      );
    }
    console.log(`  Modelo: ${config.anthropicModel}\n`);
  });
}

main();
