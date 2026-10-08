import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';

// ---------- gerador pseudoaleatório determinístico (mesmos dados a cada seed) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260401);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// ---------- dados base ----------
type Regiao = 'Nordeste' | 'Sudeste' | 'Sul' | 'Centro-Oeste' | 'Norte';
const CATEGORIAS = ['Cama', 'Banho', 'Mesa', 'Decoração', 'Cozinha'] as const;
type Categoria = (typeof CATEGORIAS)[number];

const CIDADES: { cidade: string; estado: string; regiao: Regiao }[] = [
  { cidade: 'Recife', estado: 'PE', regiao: 'Nordeste' },
  { cidade: 'Olinda', estado: 'PE', regiao: 'Nordeste' },
  { cidade: 'Jaboatão dos Guararapes', estado: 'PE', regiao: 'Nordeste' },
  { cidade: 'Caruaru', estado: 'PE', regiao: 'Nordeste' },
  { cidade: 'Salvador', estado: 'BA', regiao: 'Nordeste' },
  { cidade: 'Fortaleza', estado: 'CE', regiao: 'Nordeste' },
  { cidade: 'Natal', estado: 'RN', regiao: 'Nordeste' },
  { cidade: 'João Pessoa', estado: 'PB', regiao: 'Nordeste' },
  { cidade: 'Maceió', estado: 'AL', regiao: 'Nordeste' },
  { cidade: 'Aracaju', estado: 'SE', regiao: 'Nordeste' },
  { cidade: 'São Luís', estado: 'MA', regiao: 'Nordeste' },
  { cidade: 'Teresina', estado: 'PI', regiao: 'Nordeste' },
  { cidade: 'São Paulo', estado: 'SP', regiao: 'Sudeste' },
  { cidade: 'Campinas', estado: 'SP', regiao: 'Sudeste' },
  { cidade: 'Rio de Janeiro', estado: 'RJ', regiao: 'Sudeste' },
  { cidade: 'Belo Horizonte', estado: 'MG', regiao: 'Sudeste' },
  { cidade: 'Uberlândia', estado: 'MG', regiao: 'Sudeste' },
  { cidade: 'Vitória', estado: 'ES', regiao: 'Sudeste' },
  { cidade: 'Curitiba', estado: 'PR', regiao: 'Sul' },
  { cidade: 'Porto Alegre', estado: 'RS', regiao: 'Sul' },
  { cidade: 'Florianópolis', estado: 'SC', regiao: 'Sul' },
  { cidade: 'Joinville', estado: 'SC', regiao: 'Sul' },
  { cidade: 'Brasília', estado: 'DF', regiao: 'Centro-Oeste' },
  { cidade: 'Goiânia', estado: 'GO', regiao: 'Centro-Oeste' },
  { cidade: 'Campo Grande', estado: 'MS', regiao: 'Centro-Oeste' },
  { cidade: 'Cuiabá', estado: 'MT', regiao: 'Centro-Oeste' },
  { cidade: 'Manaus', estado: 'AM', regiao: 'Norte' },
  { cidade: 'Belém', estado: 'PA', regiao: 'Norte' },
  { cidade: 'Palmas', estado: 'TO', regiao: 'Norte' },
];

const PESO_REGIAO: Record<Regiao, number> = {
  Nordeste: 0.35,
  Sudeste: 0.3,
  Sul: 0.14,
  'Centro-Oeste': 0.12,
  Norte: 0.09,
};

// Preferência de categoria por região (variação regional)
const PREFERENCIA_REGIAO: Record<Regiao, Record<Categoria, number>> = {
  Nordeste: { Cama: 0.8, Banho: 1.4, Mesa: 1.0, Decoração: 0.9, Cozinha: 1.0 },
  Sudeste: { Cama: 1.1, Banho: 1.0, Mesa: 1.0, Decoração: 1.2, Cozinha: 1.0 },
  Sul: { Cama: 1.5, Banho: 0.8, Mesa: 1.0, Decoração: 1.1, Cozinha: 0.9 },
  'Centro-Oeste': { Cama: 1.0, Banho: 1.1, Mesa: 1.1, Decoração: 1.0, Cozinha: 1.0 },
  Norte: { Cama: 0.7, Banho: 1.3, Mesa: 0.9, Decoração: 0.9, Cozinha: 1.3 },
};

// Sazonalidade geral por mês (1 = janeiro)
const SAZONAL_MES: Record<number, number> = {
  1: 0.8,
  2: 0.8,
  3: 0.9,
  4: 1.0,
  5: 1.35,
  6: 1.1,
  7: 1.0,
  8: 1.0,
  9: 0.9,
  10: 1.0,
  11: 1.7,
  12: 1.5,
};

// Sazonalidade por categoria (inverno = mais Cama; fim de ano = mais Mesa e Decoração)
function sazonalCategoria(cat: Categoria, mes: number): number {
  const inverno = mes >= 5 && mes <= 8;
  const fimDeAno = mes === 11 || mes === 12;
  if (cat === 'Cama') return inverno ? 1.6 : 1;
  if (cat === 'Mesa') return fimDeAno ? 1.6 : 1;
  if (cat === 'Decoração') return fimDeAno ? 1.3 : 1;
  if (cat === 'Banho') return mes >= 11 || mes <= 2 ? 1.3 : 1;
  return 1;
}

const PRODUTOS: Record<Categoria, { nomes: string[]; preco: [number, number] }> = {
  Cama: {
    preco: [59, 389],
    nomes: [
      'Jogo de Lençol Casal 200 Fios',
      'Jogo de Lençol Solteiro 150 Fios',
      'Edredom Casal Dupla Face',
      'Cobertor Microfibra Casal',
      'Manta Soft Queen',
      'Travesseiro Fibra Siliconada',
      'Fronha Avulsa Percal',
      'Colcha Matelassê Casal',
      'Protetor de Colchão Impermeável',
      'Cobre-leito Piquet King',
    ],
  },
  Banho: {
    preco: [19, 249],
    nomes: [
      'Toalha de Banho Fio Penteado',
      'Toalha de Rosto Felpuda',
      'Toalha de Piso Antiderrapante',
      'Roupão Microfibra Adulto',
      'Jogo de Toalhas 5 Peças',
      'Toalha de Praia Veludo',
      'Toalha Fralda Bebê',
      'Kit Banheiro 3 Peças',
      'Tapete de Banheiro Chenille',
      'Toalha de Lavabo Bordada',
    ],
  },
  Mesa: {
    preco: [15, 219],
    nomes: [
      'Toalha de Mesa Retangular 6 Lugares',
      'Jogo Americano 4 Peças',
      'Caminho de Mesa Linho',
      'Guardanapo de Tecido Kit 6',
      'Toalha de Mesa Redonda',
      'Porta Copos Kit 6',
      'Jogo Americano Palha',
      'Toalha de Natal Estampada',
      'Capa de Cadeira Elástica',
      'Toalha de Mesa Impermeável',
    ],
  },
  Decoração: {
    preco: [29, 459],
    nomes: [
      'Almofada Veludo 45x45',
      'Capa de Almofada Linho',
      'Cortina Blackout 2,80m',
      'Cortina Voal Branca',
      'Tapete de Sala Shaggy',
      'Manta Decorativa para Sofá',
      'Cesto Organizador de Algodão',
      'Puff Redondo Suede',
      'Passadeira de Cozinha',
      'Capa de Sofá Retrátil',
    ],
  },
  Cozinha: {
    preco: [9, 99],
    nomes: [
      'Pano de Prato Algodão Kit 5',
      'Avental de Cozinha Estampado',
      'Luva Térmica Silicone',
      'Jogo de Panos de Copa',
      'Pano Multiuso Microfibra',
      'Pano de Chão Alvejado',
      'Kit Pano de Prato Bordado',
      'Avental Churrasco Jeans',
      'Porta Pano com Velcro',
      'Tábua de Corte Bambu',
    ],
  },
};

const NOMES = [
  'Ana',
  'Beatriz',
  'Carlos',
  'Daniela',
  'Eduardo',
  'Fernanda',
  'Gabriel',
  'Helena',
  'Igor',
  'Juliana',
  'Lucas',
  'Mariana',
  'Nicolas',
  'Olívia',
  'Paulo',
  'Rafaela',
  'Samuel',
  'Tatiana',
  'Vinícius',
  'Yasmin',
  'Marcos',
  'Camila',
  'Rodrigo',
  'Letícia',
  'Felipe',
  'Patrícia',
  'André',
  'Larissa',
  'Bruno',
  'Renata',
  'Thiago',
  'Aline',
  'Diego',
  'Priscila',
  'Gustavo',
  'Vanessa',
];
const SOBRENOMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Pereira',
  'Lima',
  'Carvalho',
  'Almeida',
  'Ribeiro',
  'Gomes',
  'Martins',
  'Barbosa',
  'Rocha',
  'Cavalcanti',
  'Araújo',
  'Nascimento',
  'Moreira',
  'Ferreira',
  'Costa',
  'Dias',
  'Teixeira',
  'Mendes',
  'Freitas',
  'Lacerda',
  'Albuquerque',
];

const CANAIS = ['site', 'app', 'marketplace', 'loja_fisica', 'whatsapp'] as const;
const PESO_CANAL = [35, 20, 20, 20, 5];

// ---------- seed ----------
export function seedDatabase(dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);

  // Período: 12 meses fechados anteriores ao mês atual
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const startDate = new Date(
    Date.UTC(endMonthStart.getUTCFullYear(), endMonthStart.getUTCMonth() - 12, 1),
  );
  const endDate = new Date(
    Date.UTC(endMonthStart.getUTCFullYear(), endMonthStart.getUTCMonth(), 0),
  );

  // Produtos
  const produtos: {
    id: number;
    nome: string;
    categoria: Categoria;
    preco: number;
    custo: number;
    popularidade: number;
  }[] = [];
  let produtoId = 1;
  for (const categoria of CATEGORIAS) {
    const { nomes, preco } = PRODUTOS[categoria];
    nomes.forEach((nome, index) => {
      const base =
        preco[0] + (preco[1] - preco[0]) * (index / (nomes.length - 1)) * (0.7 + rand() * 0.6);
      const precoFinal = round2(Math.min(preco[1], Math.max(preco[0], base)) - 0.01);
      produtos.push({
        id: produtoId++,
        nome,
        categoria,
        preco: precoFinal,
        custo: round2(precoFinal * (0.42 + rand() * 0.2)),
        popularidade: 1 / (1 + index * 0.35), // produtos "da frente" vendem mais
      });
    });
  }

  // Clientes
  const clientes: { id: number; regiao: Regiao; cadastro: Date }[] = [];
  const regioes = Object.keys(PESO_REGIAO) as Regiao[];
  const cadastroInicio = new Date(
    Date.UTC(startDate.getUTCFullYear() - 1, startDate.getUTCMonth(), 1),
  );
  const spanDays = Math.round((endDate.getTime() - cadastroInicio.getTime()) / 86400000);

  const insertCliente = db.prepare(
    'INSERT INTO clientes (id, nome, cidade, estado, regiao, data_cadastro) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertProduto = db.prepare(
    'INSERT INTO produtos (id, nome, categoria, preco, custo) VALUES (?, ?, ?, ?, ?)',
  );
  const insertPedido = db.prepare(
    'INSERT INTO pedidos (id, cliente_id, data, status, canal) VALUES (?, ?, ?, ?, ?)',
  );
  const insertItem = db.prepare(
    'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
  );

  const run = db.transaction(() => {
    for (const p of produtos) insertProduto.run(p.id, p.nome, p.categoria, p.preco, p.custo);

    for (let id = 1; id <= 300; id++) {
      const regiao = weightedPick(
        regioes,
        regioes.map((r) => PESO_REGIAO[r]),
      );
      const local = pick(CIDADES.filter((c) => c.regiao === regiao));
      const cadastro = new Date(cadastroInicio.getTime() + randInt(0, spanDays) * 86400000);
      const nome = `${pick(NOMES)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
      clientes.push({ id, regiao, cadastro });
      insertCliente.run(id, nome, local.cidade, local.estado, regiao, isoDate(cadastro));
    }

    // Meses do período e seus pesos
    const meses: { ano: number; mes: number; dias: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 1));
      const dias = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      meses.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dias });
    }
    const pesosMes = meses.map((m) => SAZONAL_MES[m.mes] ?? 1);

    const TOTAL_PEDIDOS = 3000;
    const pedidos: { data: Date; clienteId: number; regiao: Regiao; mes: number }[] = [];

    for (let n = 0; n < TOTAL_PEDIDOS; n++) {
      const m = weightedPick(meses, pesosMes);
      // Black Friday concentra vendas no fim de novembro
      const dia = m.mes === 11 && rand() < 0.55 ? randInt(20, m.dias) : randInt(1, m.dias);
      const data = new Date(Date.UTC(m.ano, m.mes - 1, dia));

      // cliente já cadastrado na data do pedido
      let cliente = pick(clientes);
      for (let tries = 0; tries < 30 && cliente.cadastro > data; tries++) cliente = pick(clientes);
      if (cliente.cadastro > data) {
        cliente = clientes.reduce((a, b) => (a.cadastro < b.cadastro ? a : b));
      }
      pedidos.push({ data, clienteId: cliente.id, regiao: cliente.regiao, mes: m.mes });
    }

    pedidos.sort((a, b) => a.data.getTime() - b.data.getTime());

    pedidos.forEach((pedido, index) => {
      const pedidoId = index + 1;
      const diasAtras = Math.round((today.getTime() - pedido.data.getTime()) / 86400000);
      let status: string;
      if (diasAtras > 25) status = rand() < 0.92 ? 'entregue' : 'cancelado';
      else status = weightedPick(['entregue', 'enviado', 'pendente', 'cancelado'], [45, 30, 18, 7]);

      insertPedido.run(
        pedidoId,
        pedido.clienteId,
        isoDate(pedido.data),
        status,
        weightedPick(CANAIS, PESO_CANAL),
      );

      const qtdItens = weightedPick([1, 2, 3, 4], [50, 30, 14, 6]);
      const pesosProdutos = produtos.map(
        (p) =>
          p.popularidade *
          PREFERENCIA_REGIAO[pedido.regiao][p.categoria] *
          sazonalCategoria(p.categoria, pedido.mes),
      );
      const usados = new Set<number>();
      const desconto = pedido.mes === 11 ? 0.1 + rand() * 0.1 : rand() < 0.15 ? 0.05 : 0;

      for (let i = 0; i < qtdItens; i++) {
        const produto = weightedPick(produtos, pesosProdutos);
        if (usados.has(produto.id)) continue;
        usados.add(produto.id);
        const quantidade = weightedPick([1, 2, 3], [70, 22, 8]);
        insertItem.run(pedidoId, produto.id, quantidade, round2(produto.preco * (1 - desconto)));
      }
    });
  });

  run();
  db.pragma('journal_mode = DELETE');
  const totais = {
    clientes: (db.prepare('SELECT COUNT(*) AS n FROM clientes').get() as { n: number }).n,
    produtos: (db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }).n,
    pedidos: (db.prepare('SELECT COUNT(*) AS n FROM pedidos').get() as { n: number }).n,
    itens: (db.prepare('SELECT COUNT(*) AS n FROM itens_pedido').get() as { n: number }).n,
  };
  db.close();
  console.log(
    `Seed concluído: ${totais.clientes} clientes, ${totais.produtos} produtos, ${totais.pedidos} pedidos, ${totais.itens} itens (${isoDate(startDate)} a ${isoDate(endDate)}).`,
  );
}
