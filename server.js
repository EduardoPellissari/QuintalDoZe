const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'db.json'));

let pool = null;
if (DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DATABASE_URL });
}

const STORAGE_MODE = pool ? 'postgres' : 'file';

let pgReady = false;
let writeQueue = Promise.resolve();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function queueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

function defaultDb() {
  return {
    users: [
      { id: 1, name: 'Administrador', email: 'admin@quintaldoze', password: 'quintaldoze123', role: 'admin' },
      { id: 2, name: 'Garçom', email: 'garcom@quintaldoze', password: 'quintaldoze123', role: 'garcom' },
      { id: 3, name: 'Cozinha', email: 'cozinha@quintaldoze', password: 'quintaldoze123', role: 'cozinha' },
      { id: 4, name: 'Caixa', email: 'caixa@quintaldoze', password: 'quintaldoze123', role: 'caixa' }
    ],
    products: [
      { id: 101, name: 'Prato Executivo', category: 'Pratos', price: 28.90, description: 'Arroz, feijão, salada e proteína do dia', active: true },
      { id: 102, name: 'Porção de Batata', category: 'Porções', price: 24.00, description: 'Batata frita crocante', active: true },
      { id: 103, name: 'Refrigerante Lata', category: 'Bebidas', price: 6.50, description: '350 ml', active: true }
    ],
    quotes: [],
    orders: []
  };
}

function normalizeDb(dbCandidate) {
  const defaults = defaultDb();
  const db = dbCandidate && typeof dbCandidate === 'object' ? dbCandidate : {};

  if (!Array.isArray(db.users)) db.users = defaults.users;
  if (!Array.isArray(db.products)) db.products = [];
  if (!Array.isArray(db.quotes)) db.quotes = [];
  if (!Array.isArray(db.orders)) db.orders = [];

  return db;
}

async function ensureFileDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) await fs.promises.writeFile(DB_PATH, JSON.stringify(defaultDb(), null, 2));
}

async function readFileDb() {
  await ensureFileDb();

  try {
    const raw = await fs.promises.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeDb(parsed);
  } catch (err) {
    const db = defaultDb();
    await writeFileDb(db);
    return db;
  }
}

async function writeFileDb(db) {
  const safeDb = normalizeDb(db);
  const payload = JSON.stringify(safeDb, null, 2);

  await queueWrite(async () => {
    await ensureFileDb();
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.promises.writeFile(tmpPath, payload);
    await fs.promises.rename(tmpPath, DB_PATH);
  });
}

async function ensurePostgresDb() {
  if (!pool || pgReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const state = await pool.query('SELECT id FROM app_state WHERE id = 1');
  if (!state.rowCount) {
    await pool.query(
      'INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)',
      [JSON.stringify(defaultDb())]
    );
  }

  pgReady = true;
}

async function readPostgresDb() {
  await ensurePostgresDb();

  const state = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (!state.rowCount) return defaultDb();
  return normalizeDb(state.rows[0].data);
}

async function writePostgresDb(db) {
  const safeDb = normalizeDb(db);

  await ensurePostgresDb();
  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [JSON.stringify(safeDb)]
  );
}

async function readDb() {
  return STORAGE_MODE === 'postgres' ? readPostgresDb() : readFileDb();
}

async function writeDb(db) {
  if (STORAGE_MODE === 'postgres') return writePostgresDb(db);
  return writeFileDb(db);
}

function nextId(list) {
  return list.length ? Math.max(...list.map((item) => Number(item.id) || 0)) + 1 : Date.now();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function getLocalIps() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }

  return results;
}

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('[API ERROR]', err);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Quintal do Zé Local', storage: STORAGE_MODE }));

app.post('/api/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  const db = await readDb();
  const user = db.users.find((u) => String(u.email).toLowerCase() === email && String(u.password) === password);
  if (!user) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  res.json(publicUser(user));
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.users.map(publicUser));
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const db = await readDb();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !req.body.password || !req.body.role) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e perfil.' });
  if (db.users.some((u) => String(u.email).toLowerCase() === email)) return res.status(409).json({ error: 'Já existe usuário com este e-mail.' });

  const user = {
    id: nextId(db.users),
    name: String(req.body.name || '').trim() || email,
    email,
    password: String(req.body.password),
    role: String(req.body.role)
  };

  db.users.push(user);
  await writeDb(db);
  res.json(publicUser(user));
}));

app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => String(u.id) === String(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !req.body.role) return res.status(400).json({ error: 'Preencha e-mail e perfil.' });

  const duplicate = db.users.find((u) => String(u.email).toLowerCase() === email && String(u.id) !== String(user.id));
  if (duplicate) return res.status(409).json({ error: 'Outro usuário já usa este e-mail.' });

  user.name = String(req.body.name || '').trim() || email;
  user.email = email;
  user.role = String(req.body.role);
  if (req.body.password) user.password = String(req.body.password);

  await writeDb(db);
  res.json(publicUser(user));
}));

app.delete('/api/users/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  db.users = db.users.filter((u) => String(u.id) !== String(req.params.id));
  await writeDb(db);
  res.json({ ok: true });
}));

app.get('/api/products', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.products);
}));

app.post('/api/products', asyncHandler(async (req, res) => {
  const db = await readDb();
  if (!req.body.name || !req.body.price) return res.status(400).json({ error: 'Preencha nome e preço.' });

  const product = {
    id: nextId(db.products),
    name: String(req.body.name).trim(),
    category: String(req.body.category || 'Geral').trim(),
    price: Number(req.body.price),
    description: String(req.body.description || '').trim(),
    active: req.body.active !== false
  };

  db.products.push(product);
  await writeDb(db);
  res.json(product);
}));

app.put('/api/products/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const product = db.products.find((p) => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  product.name = String(req.body.name || product.name).trim();
  product.category = String(req.body.category || 'Geral').trim();
  product.price = Number(req.body.price || product.price);
  product.description = String(req.body.description || '').trim();
  product.active = req.body.active !== false;

  await writeDb(db);
  res.json(product);
}));

app.delete('/api/products/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  db.products = db.products.filter((p) => String(p.id) !== String(req.params.id));
  await writeDb(db);
  res.json({ ok: true });
}));

function sanitizeQuoteItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: item.productId ? Number(item.productId) || null : null,
      description: String(item.description || '').trim(),
      qty: Math.max(Number(item.qty || 1), 0),
      unitPrice: Math.max(Number(item.unitPrice || 0), 0)
    }))
    .filter((item) => item.description && item.qty > 0);
}

function quoteTotal(items) {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}

function quoteBody(body, existingQuote = null) {
  const items = sanitizeQuoteItems(body.items);
  const clientName = String(body.clientName || '').trim();
  const eventType = String(body.eventType || '').trim();

  if (!clientName) return { error: 'Informe o nome do cliente.' };
  if (!eventType) return { error: 'Escolha o tipo de evento.' };
  if (!items.length) return { error: 'Adicione pelo menos um item ao orçamento.' };

  const now = new Date().toISOString();

  return {
    quote: {
      id: existingQuote?.id,
      clientName,
      phone: String(body.phone || '').trim(),
      eventType,
      eventDate: String(body.eventDate || '').trim(),
      eventTime: String(body.eventTime || '').trim(),
      guests: Number(body.guests || 0),
      location: String(body.location || '').trim(),
      notes: String(body.notes || '').trim(),
      status: String(body.status || existingQuote?.status || 'rascunho'),
      items,
      total: quoteTotal(items),
      createdAt: existingQuote?.createdAt || now,
      updatedAt: now
    }
  };
}

app.get('/api/quotes', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.quotes);
}));

app.post('/api/quotes', asyncHandler(async (req, res) => {
  const db = await readDb();
  const result = quoteBody(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  const quote = { ...result.quote, id: nextId(db.quotes) };
  db.quotes.push(quote);

  await writeDb(db);
  res.json(quote);
}));

app.put('/api/quotes/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const index = db.quotes.findIndex((quote) => String(quote.id) === String(req.params.id));
  if (index < 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  const result = quoteBody(req.body, db.quotes[index]);
  if (result.error) return res.status(400).json({ error: result.error });

  db.quotes[index] = { ...result.quote, id: db.quotes[index].id };
  await writeDb(db);
  res.json(db.quotes[index]);
}));

app.delete('/api/quotes/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  db.quotes = db.quotes.filter((quote) => String(quote.id) !== String(req.params.id));
  await writeDb(db);
  res.json({ ok: true });
}));

app.get('/api/orders', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.orders);
}));

app.post('/api/orders', asyncHandler(async (req, res) => {
  const db = await readDb();
  const table = String(req.body.table || '').trim();
  const waiter = String(req.body.waiter || '').trim();
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (!table || !waiter || !items.length) return res.status(400).json({ error: 'Informe mesa/comanda, garçom e itens.' });

  const total = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 1)), 0);
  const order = {
    id: nextId(db.orders),
    table,
    waiter,
    items,
    notes: String(req.body.notes || '').trim(),
    status: 'pendente',
    paid: false,
    total,
    createdAt: new Date().toISOString(),
    startedAt: null,
    readyAt: null,
    deliveredAt: null,
    paidAt: null
  };

  db.orders.push(order);
  await writeDb(db);
  res.json(order);
}));

app.put('/api/orders/:id/status', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  const allowed = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];
  const previousStatus = order.status;
  const nextStatus = allowed.includes(req.body.status) ? req.body.status : order.status;
  order.status = nextStatus;

  const now = new Date().toISOString();
  if (nextStatus === 'preparando' && previousStatus !== 'preparando' && !order.startedAt) order.startedAt = now;
  if (nextStatus === 'pronto' && previousStatus !== 'pronto' && !order.readyAt) order.readyAt = now;
  if (nextStatus === 'entregue' && previousStatus !== 'entregue' && !order.deliveredAt) order.deliveredAt = now;

  await writeDb(db);
  res.json(order);
}));

app.put('/api/orders/:id/pay', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  order.paid = true;
  order.paidAt = new Date().toISOString();

  await writeDb(db);
  res.json(order);
}));

app.post('/api/orders/close-day', asyncHandler(async (req, res) => {
  const db = await readDb();
  const now = new Date();

  const sameDay = (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) &&
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
  };

  let closed = 0;
  db.orders.forEach((order) => {
    if (sameDay(order.createdAt) && !['cancelado', 'entregue'].includes(order.status)) {
      order.status = 'entregue';
      if (!order.deliveredAt) order.deliveredAt = now.toISOString();
      closed += 1;
    }
  });

  await writeDb(db);
  res.json({ ok: true, closed });
}));

app.delete('/api/orders/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  db.orders = db.orders.filter((o) => String(o.id) !== String(req.params.id));
  await writeDb(db);
  res.json({ ok: true });
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function startServer() {
  if (STORAGE_MODE === 'postgres') {
    await ensurePostgresDb();
    console.log('Armazenamento: Postgres (persistente no Render).');
  } else {
    await ensureFileDb();
    console.log(`Armazenamento: arquivo local (${DB_PATH}).`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('Quintal do Zé rodando com sucesso!');
    console.log(`Computador: http://localhost:${PORT}`);
    getLocalIps().forEach((ip) => console.log(`Celular/tablet: http://${ip}:${PORT}`));
    console.log(`Storage ativo: ${STORAGE_MODE}`);
    console.log('Login admin: admin@quintaldoze / quintaldoze123');
    console.log('========================================');
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
