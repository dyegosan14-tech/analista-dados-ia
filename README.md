# 📊 Analista de Dados com IA

Aplicação web em que você **pergunta em português** sobre os dados de uma loja e recebe a **resposta em texto, tabela e gráfico**. Por trás, um agente de IA (Claude, via _tool use_) escreve a consulta SQL, o servidor **valida e executa em modo somente leitura**, e a IA interpreta o resultado.

> Projeto de portfólio. Todos os dados são **fictícios** (loja de enxoval e casa, 12 meses de vendas).

<!-- Substitua pelos seus prints/GIF depois de rodar o projeto -->

![Tela principal](docs/screenshot-home.png)
![Resultado com gráfico e SQL](docs/screenshot-resultado.png)

## O que ele faz

1. Você digita (ou clica numa sugestão): _"Como evoluiu a receita mês a mês?"_
2. A IA recebe o schema do banco e chama a ferramenta `executar_sql`.
3. O servidor **valida** a SQL, executa em conexão **somente leitura**, com limite de linhas e tempo.
4. A IA lê o resultado e escreve uma resposta curta.
5. A interface mostra **texto + tabela + gráfico** (barra, linha ou pizza, escolhido automaticamente) e o painel **"Ver SQL gerada"**.

Recursos: sugestões clicáveis · histórico das últimas 10 perguntas da sessão · exportação CSV (pronto para o Excel em pt-BR) · estados de carregamento e erros amigáveis · login com sessão.

## Stack

| Camada    | Tecnologia                                                |
| --------- | --------------------------------------------------------- |
| Backend   | Node.js 20+, TypeScript, Express 5                        |
| IA        | API da Anthropic (`@anthropic-ai/sdk`) com _tool use_     |
| Banco     | SQLite (`better-sqlite3`) com dados fictícios             |
| Frontend  | EJS + Tailwind CSS + Chart.js (sem inline scripts)        |
| Segurança | Helmet (CSP), bcrypt, express-session, express-rate-limit |
| Testes    | Vitest (55 testes) · ESLint · Prettier                    |

## Como rodar no VS Code

**Pré-requisitos:** [Node.js 20 ou superior](https://nodejs.org/) (recomendado 22 LTS), [VS Code](https://code.visualstudio.com/) e uma chave da API da Anthropic ([console.anthropic.com](https://console.anthropic.com/)).

1. **Abra a pasta no VS Code:** `Arquivo > Abrir Pasta...` e escolha `analista-dados-ia`. (Aceite instalar as extensões recomendadas.)
2. **Abra o terminal:** `Terminal > Novo Terminal` (atalho `` Ctrl+` ``).
3. **Instale as dependências:**
   ```bash
   npm install
   ```
4. **Crie o arquivo `.env`** a partir do exemplo e preencha a chave:
   ```bash
   cp .env.example .env
   ```
   Abra o `.env` e troque `ANTHROPIC_API_KEY` pela sua chave. Troque também `APP_PASSWORD` e `SESSION_SECRET`.
5. **Rode em modo desenvolvimento** (o banco fictício é criado automaticamente na primeira execução):
   ```bash
   npm run dev
   ```
6. Acesse **http://localhost:3000** e entre com o usuário e a senha do `.env` (padrão se você não definir: `admin` / `admin123`).

Para depurar com breakpoints, use `F5` (configuração "Depurar servidor (tsx)").

## Exemplos de perguntas

1. Quais são os 5 produtos que mais geraram receita?
2. Como evoluiu a receita mês a mês nos últimos 12 meses?
3. Qual a receita total por região?
4. Qual categoria tem a maior margem de lucro?
5. Qual o ticket médio por canal de venda?
6. Quais as 10 cidades com mais clientes?
7. Quantos pedidos foram cancelados por mês?
8. Quais produtos da categoria Cama mais vendem entre junho e agosto?
9. Como a Black Friday (novembro) se compara aos outros meses em receita?
10. Quem são os 10 clientes que mais compraram e de qual cidade são?

## Decisões de segurança

Como a IA escreve SQL, **nada do que ela gera é confiável**. Há várias camadas independentes:

- **Validador de SQL** (`src/services/sqlValidator.ts`): aceita só `SELECT`/`WITH … SELECT`; bloqueia `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `PRAGMA`, `ATTACH`, `load_extension`, tabelas internas `sqlite_*`, comentários e **múltiplas instruções**. Palavras dentro de strings/identificadores não geram falso positivo.
- **Banco somente leitura:** conexão aberta com `readonly: true` e `PRAGMA query_only = ON`, mesmo que o validador falhe.
- **Limites:** máximo de 200 linhas (`MAX_ROWS`) e timeout de 5 s (`QUERY_TIMEOUT_MS`). Cada consulta roda em uma _worker thread_ que é encerrada se estourar o tempo.
- **Dados ≠ instruções:** o resultado das consultas volta para a IA dentro de `<dados_da_consulta>`, e o _system prompt_ manda tratá-lo apenas como dado (defesa contra _prompt injection_ vindo do banco).
- **Chave da API só no servidor:** o navegador nunca a vê.
- **Login e sessão:** senha com bcrypt, comparação em tempo constante, cookie `httpOnly` + `sameSite=lax`, ID de sessão renovado no login.
- **Rate limit:** 12 perguntas/min por IP e 10 tentativas de login/15 min.
- **Helmet + CSP restritiva:** apenas recursos do próprio servidor, sem scripts inline; a resposta da IA é inserida como texto (`textContent`), nunca como HTML.
- **CSV seguro:** células de texto que começam com `=`, `+`, `-` ou `@` são neutralizadas (injeção de fórmula).

## Estrutura

```
src/
  server.ts, app.ts, config.ts
  db/          connection.ts · schema.ts · seed.ts
  services/    aiAgent.ts · sqlValidator.ts · sqlExecutor.ts · chartSelector.ts · csv.ts
  routes/      auth.ts · pages.ts · ask.ts
  middleware/  requireAuth.ts
  views/       index.ejs · login.ejs · error.ejs · partials/
  public/      app.js · styles.css (gerado)
  styles/      input.css (Tailwind)
scripts/       seed.ts
tests/         validador, executor, agente (com cliente simulado), gráfico, CSV
```

## Scripts

| Comando          | O que faz                                                   |
| ---------------- | ----------------------------------------------------------- |
| `npm run dev`    | Servidor com reload + Tailwind em modo _watch_              |
| `npm run build`  | Gera o CSS e compila o TypeScript para `dist/`              |
| `npm start`      | Roda a versão compilada (`dist/`)                           |
| `npm run seed`   | Recria o banco fictício do zero (**pare o servidor antes**) |
| `npm test`       | Roda os testes (Vitest)                                     |
| `npm run lint`   | ESLint                                                      |
| `npm run format` | Prettier                                                    |

## Testes

```bash
npm test
```

Cobrem o validador (comandos proibidos, comentários, múltiplas instruções, tentativas de injeção, falsos positivos), o executor (limite de linhas, timeout, erros), o agente de IA com um cliente simulado (fluxo completo, correção de SQL com erro, SQL maliciosa, limite de passos), a escolha de gráfico e o CSV.

## Docker (opcional)

```bash
docker build -t analista-dados-ia .
docker run --rm -p 3000:3000 --env-file .env -e NODE_ENV=production analista-dados-ia
```

Em produção o servidor se recusa a iniciar com a senha ou o segredo de sessão padrão. Atrás de HTTPS, use `COOKIE_SECURE=true` e `TRUST_PROXY=true`.

## Banco de dados fictício

`clientes` (300, com cidade, estado e região), `produtos` (50, em 5 categorias), `pedidos` (3.000) e `itens_pedido`, cobrindo os 12 meses fechados anteriores ao mês atual. Há sazonalidade (inverno vende mais Cama, Black Friday e Natal puxam novembro/dezembro) e variação por região (Nordeste compra mais Banho, Sul mais Cama). Os dados são gerados de forma determinística pelo `seed`.

## Solução de problemas

- **`ANTHROPIC_API_KEY não está configurada`**: preencha o `.env` e reinicie o `npm run dev`.
- **"A chave da API ... é inválida"**: confira se copiou a chave inteira e se a conta tem créditos.
- **"O modelo configurado não foi encontrado"**: ajuste `ANTHROPIC_MODEL` no `.env` para um modelo disponível na sua conta.
- **`EADDRINUSE` (porta em uso)**: mude `PORT` no `.env`.
- **Erro ao instalar `better-sqlite3`**: use Node 20 ou superior (22 LTS é o ideal) e rode `npm install` de novo.
- **Quero recomeçar o banco**: pare o servidor e rode `npm run seed`.

## Ideias de evolução

- Persistir histórico e usuários em banco (hoje a sessão fica em memória; em produção use um _session store_ como Redis).
- Gráficos escolhidos pela própria IA (ex.: empilhado, dispersão) e dashboards salvos.
- Perguntas de acompanhamento com contexto ("agora só no Nordeste").
- Conectar a bancos reais (PostgreSQL/SQL Server) com usuário de leitura e _views_ curadas.
- Cache de perguntas repetidas e métricas de custo/latência por consulta.
- Testes de interface com Playwright.

## Autor

Desenvolvido por **Dyego Santos** · [github.com/dyegosan14-tech](https://github.com/dyegosan14-tech)

Licença MIT.
