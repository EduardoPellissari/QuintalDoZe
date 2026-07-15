const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

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
const PASSWORD_VERSION = 'pbkdf2-sha256';

let pgReady = false;
let writeQueue = Promise.resolve();

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return;
    }

    if (/\.(html)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }

    if (/\.(css|js|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

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
      { id: 101, name: 'Prato Executivo', category: 'Pratos', price: 28.90, description: 'Arroz, feijão, salada e proteína do dia', active: true, soldOut: false, usage: 'orders' },
      { id: 102, name: 'Porção de Batata', category: 'Porções', price: 24.00, description: 'Batata frita crocante', active: true, soldOut: false, usage: 'orders' },
      { id: 103, name: 'Refrigerante Lata', category: 'Bebidas', price: 6.50, description: '350 ml', active: true, soldOut: false, usage: 'orders' }
    ],
    quotes: [],
    orders: [],
    cashSessions: [],
    customers: [],
    settings: defaultSettings(),
    activityLog: []
  };
}

function defaultSettings() {
  return {
    restaurantName: 'Quintal do Zé',
    tableCount: 30,
    onboardingCompleted: false,
    trainingMode: false,
    receiptMessage: 'Obrigado pela preferência. Volte sempre!'
  };
}

function normalizeSettings(settings) {
  const defaults = defaultSettings();
  const safeSettings = settings && typeof settings === 'object' ? settings : {};
  const tableCount = Math.max(Math.min(Number(safeSettings.tableCount || defaults.tableCount), 200), 1);

  return {
    ...defaults,
    ...safeSettings,
    restaurantName: String(safeSettings.restaurantName || defaults.restaurantName).trim() || defaults.restaurantName,
    tableCount,
    onboardingCompleted: safeSettings.onboardingCompleted === true,
    trainingMode: safeSettings.trainingMode === true,
    receiptMessage: String(safeSettings.receiptMessage || defaults.receiptMessage).trim() || defaults.receiptMessage
  };
}

function productUsage(value) {
  return String(value) === 'quotes' ? 'quotes' : 'orders';
}

function normalizeProduct(product) {
  const safeProduct = product && typeof product === 'object' ? product : {};
  const stockEnabled = safeProduct.stockEnabled === true;
  const stockQty = Math.max(Number(safeProduct.stockQty || 0), 0);
  const soldOut = stockEnabled && stockQty <= 0 ? true : safeProduct.soldOut === true;

  return {
    ...safeProduct,
    active: safeProduct.active !== false,
    soldOut,
    usage: productUsage(safeProduct.usage),
    stockEnabled,
    stockQty,
    lowStockAt: Math.max(Number(safeProduct.lowStockAt ?? 5), 0)
  };
}

function productMatchesUsage(product, usage) {
  if (!usage) return true;
  return productUsage(product.usage) === usage;
}

function normalizeUser(user) {
  const safeUser = user && typeof user === 'object' ? user : {};
  return {
    ...safeUser,
    active: safeUser.active !== false
  };
}

function normalizeCustomer(customer) {
  const safeCustomer = customer && typeof customer === 'object' ? customer : {};
  return {
    ...safeCustomer,
    id: safeCustomer.id,
    name: String(safeCustomer.name || '').trim(),
    phone: String(safeCustomer.phone || '').trim(),
    quotesCount: Math.max(Number(safeCustomer.quotesCount || 0), 0),
    totalQuoted: Math.max(Number(safeCustomer.totalQuoted || 0), 0),
    lastQuoteId: safeCustomer.lastQuoteId || null,
    lastQuoteAt: safeCustomer.lastQuoteAt || null,
    lastEventType: safeCustomer.lastEventType || '',
    eventTypes: Array.isArray(safeCustomer.eventTypes) ? safeCustomer.eventTypes : [],
    createdAt: safeCustomer.createdAt || new Date().toISOString(),
    updatedAt: safeCustomer.updatedAt || new Date().toISOString()
  };
}

function passwordDigest(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function timingSafeHexEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function setUserPassword(user, password) {
  const { salt, hash } = passwordDigest(password);
  user.passwordSalt = salt;
  user.passwordHash = hash;
  user.passwordVersion = PASSWORD_VERSION;
  user.passwordUpdatedAt = new Date().toISOString();
  delete user.password;
  return user;
}

function verifyUserPassword(user, password) {
  if (!user || !password) return false;

  if (user.passwordHash && user.passwordSalt) {
    const { hash } = passwordDigest(password, user.passwordSalt);
    return timingSafeHexEqual(hash, user.passwordHash);
  }

  return String(user.password || '') === String(password || '');
}

function sanitizedBackup(db) {
  return {
    exportedAt: new Date().toISOString(),
    storage: STORAGE_MODE,
    data: {
      users: (db.users || []).map(publicUser),
      products: db.products || [],
      quotes: db.quotes || [],
      orders: db.orders || [],
      cashSessions: db.cashSessions || [],
      customers: db.customers || [],
      settings: normalizeSettings(db.settings),
      activityLog: db.activityLog || []
    }
  };
}

function paymentMethod(value) {
  const allowed = ['pix', 'dinheiro', 'debito', 'credito', 'voucher', 'misto'];
  return allowed.includes(String(value)) ? String(value) : 'pix';
}

function eventStatus(value) {
  const allowed = ['agendado', 'confirmado', 'finalizado', 'cancelado'];
  return allowed.includes(String(value)) ? String(value) : 'agendado';
}

function itemBasePrice(item) {
  return Number(item?.basePrice ?? item?.price ?? 0);
}

function itemExtraPrice(item) {
  return Math.max(Number(item?.extraPrice || 0), 0);
}

function itemUnitPrice(item) {
  return itemBasePrice(item) + itemExtraPrice(item);
}

function itemLineTotal(item) {
  return itemUnitPrice(item) * Number(item?.qty || 1);
}

function normalizeOrderItem(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const qty = Math.max(Number(safeItem.qty || 1), 0);
  const basePrice = Math.max(itemBasePrice(safeItem), 0);
  const extraPrice = itemExtraPrice(safeItem);

  return {
    id: safeItem.id ?? null,
    name: String(safeItem.name || safeItem.description || '').trim(),
    qty,
    price: basePrice,
    basePrice,
    extraPrice,
    note: String(safeItem.note || safeItem.itemNote || '').trim()
  };
}

function sanitizeOrderItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeOrderItem)
    .filter((item) => item.name && item.qty > 0);
}

function orderSubtotal(order) {
  if (Number(order?.subtotal || 0) > 0) return Number(order.subtotal);
  return (order?.items || []).reduce((sum, item) => sum + itemLineTotal(item), 0);
}

function normalizeOrder(order) {
  const safeOrder = order && typeof order === 'object' ? order : {};
  const items = sanitizeOrderItems(safeOrder.items);
  const subtotal = orderSubtotal({ ...safeOrder, items });
  const serviceFee = Math.max(Number(safeOrder.serviceFee || 0), 0);
  const discount = Math.max(Number(safeOrder.discount || 0), 0);
  const total = Math.max(Number(safeOrder.total ?? subtotal + serviceFee - discount), 0);

  return {
    ...safeOrder,
    items,
    subtotal,
    serviceFee,
    discount,
    total,
    paymentMethod: safeOrder.paymentMethod || '',
    paymentNote: safeOrder.paymentNote || '',
    paymentSplitCount: Math.max(Number(safeOrder.paymentSplitCount || 0), 0),
    cancelReason: safeOrder.cancelReason || '',
    canceledAt: safeOrder.canceledAt || null,
    tableMoves: Array.isArray(safeOrder.tableMoves) ? safeOrder.tableMoves : [],
  };
}

function openOrderForTable(order, table) {
  return String(order.table || '') === String(table || '') && !order.paid && order.status !== 'cancelado';
}

function isOpenOrder(order) {
  return !order.paid && order.status !== 'cancelado';
}

function isEventOrder(order) {
  return order?.source === 'quote' || Boolean(order?.quoteId) || /^evento\b/i.test(String(order?.table || ''));
}

function isKitchenOrder(order) {
  return !isEventOrder(order) && !['cancelado', 'entregue'].includes(order.status);
}

function filterOrdersForRequest(orders, query = {}) {
  const view = String(query.view || '').trim();
  const status = String(query.status || '').trim();
  const table = String(query.table || '').trim();
  const date = String(query.date || '').trim();
  const source = String(query.source || '').trim();
  const limit = Math.max(Number(query.limit || 0), 0);

  let rows = Array.isArray(orders) ? [...orders] : [];

  if (view === 'open') rows = rows.filter(isOpenOrder);
  if (view === 'kitchen') rows = rows.filter(isKitchenOrder);
  if (view === 'active') rows = rows.filter((order) => isOpenOrder(order) || isKitchenOrder(order));
  if (status) rows = rows.filter((order) => String(order.status || '') === status);
  if (table) rows = rows.filter((order) => String(order.table || '') === table);
  if (date) rows = rows.filter((order) => localDate(order.createdAt) === date);
  if (source) rows = rows.filter((order) => String(order.source || '') === source);

  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return limit ? rows.slice(0, limit) : rows;
}

function applyPaymentToOrder(order, payment, paidAt) {
  const subtotal = orderSubtotal(order);

  order.subtotal = subtotal;
  order.serviceFee = Math.max(Number(payment.serviceFee || 0), 0);
  order.discount = Math.max(Number(payment.discount || 0), 0);
  order.total = Math.max(subtotal + order.serviceFee - order.discount, 0);
  order.paymentMethod = paymentMethod(payment.paymentMethod);
  order.paymentNote = String(payment.paymentNote || '').trim();
  order.paymentSplitCount = Math.max(Number(payment.paymentSplitCount || payment.splitCount || 0), 0);
  order.paid = true;
  order.paidAt = paidAt;

  if (!['cancelado', 'entregue'].includes(order.status)) {
    order.status = 'entregue';
    if (!order.deliveredAt) order.deliveredAt = paidAt;
  }
}

function splitAmount(amount, weights) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let used = 0;

  return weights.map((weight, index) => {
    if (!amount || !totalWeight) return 0;
    if (index === weights.length - 1) return Number((amount - used).toFixed(2));

    const part = Number((amount * (weight / totalWeight)).toFixed(2));
    used += part;
    return part;
  });
}

function normalizeDb(dbCandidate) {
  const defaults = defaultDb();
  const db = dbCandidate && typeof dbCandidate === 'object' ? dbCandidate : {};

  db.settings = normalizeSettings(db.settings || defaults.settings);
  if (!Array.isArray(db.users)) db.users = defaults.users;
  db.users = db.users.map(normalizeUser);
  if (!Array.isArray(db.products)) db.products = [];
  db.products = db.products.map(normalizeProduct);
  if (!Array.isArray(db.quotes)) db.quotes = [];
  if (!Array.isArray(db.orders)) db.orders = [];
  db.orders = db.orders.map(normalizeOrder);
  if (!Array.isArray(db.cashSessions)) db.cashSessions = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  db.customers = db.customers.map(normalizeCustomer).filter((customer) => customer.name);
  if (!Array.isArray(db.activityLog)) db.activityLog = [];

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

function logAction(db, type, message, data = {}) {
  const entry = {
    id: nextId(db.activityLog || []),
    type,
    message,
    data,
    createdAt: new Date().toISOString()
  };

  db.activityLog = [entry, ...(db.activityLog || [])].slice(0, 500);
  return entry;
}

function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function cashSalesForDate(db, dateValue) {
  return (db.orders || [])
    .filter((order) => order.paid && localDate(order.paidAt || order.createdAt) === dateValue)
    .filter((order) => order.paymentMethod === 'dinheiro')
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    passwordUpdatedAt: user.passwordUpdatedAt || null
  };
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function customerIdentity(name, phone) {
  const digits = phoneDigits(phone);
  if (digits) return `phone:${digits}`;

  return `name:${String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()}`;
}

function upsertCustomerFromQuote(db, quote) {
  if (!quote?.clientName) return null;

  db.customers = Array.isArray(db.customers) ? db.customers.map(normalizeCustomer) : [];

  const identity = customerIdentity(quote.clientName, quote.phone);
  const now = new Date().toISOString();
  let customer = db.customers.find((item) => item.identity === identity);

  if (!customer && phoneDigits(quote.phone)) {
    const digits = phoneDigits(quote.phone);
    customer = db.customers.find((item) => phoneDigits(item.phone) === digits);
  }

  if (!customer) {
    customer = {
      id: nextId(db.customers),
      identity,
      name: quote.clientName,
      phone: quote.phone || '',
      quotesCount: 0,
      totalQuoted: 0,
      lastQuoteId: null,
      lastQuoteAt: null,
      lastEventType: '',
      eventTypes: [],
      createdAt: now,
      updatedAt: now
    };
    db.customers.push(customer);
  }

  const quoteIds = new Set(Array.isArray(customer.quoteIds) ? customer.quoteIds.map(String) : []);
  quoteIds.add(String(quote.id));

  customer.identity = identity;
  customer.name = quote.clientName || customer.name;
  customer.phone = quote.phone || customer.phone || '';
  customer.quoteIds = Array.from(quoteIds);
  customer.quotesCount = customer.quoteIds.length;
  const relatedQuotes = (db.quotes || []).filter((item) => customer.quoteIds.includes(String(item.id)));
  customer.totalQuoted = relatedQuotes.reduce((sum, item) => sum + Number(item.total || 0), 0);
  customer.lastQuoteId = quote.id;
  customer.lastQuoteAt = quote.updatedAt || quote.createdAt || now;
  customer.lastEventType = quote.eventType || customer.lastEventType || '';
  customer.eventTypes = Array.from(new Set([...(customer.eventTypes || []), quote.eventType].filter(Boolean))).slice(-8);
  customer.training = relatedQuotes.length > 0 && relatedQuotes.every((item) => item.training === true);
  customer.updatedAt = now;

  return normalizeCustomer(customer);
}

function applyStockForOrder(db, items) {
  const requested = new Map();

  items.forEach((item) => {
    if (item.id === null || item.id === undefined) return;
    const key = String(item.id);
    requested.set(key, (requested.get(key) || 0) + Number(item.qty || 1));
  });

  const stockProducts = [...requested.entries()]
    .map(([id, qty]) => ({ product: db.products.find((item) => String(item.id) === id), qty }))
    .filter((entry) => entry.product && entry.product.stockEnabled === true);

  const unavailable = stockProducts.find(({ product, qty }) => Number(product.stockQty || 0) < qty);
  if (unavailable) {
    return `${unavailable.product.name} tem apenas ${Number(unavailable.product.stockQty || 0)} unidade(s) em estoque.`;
  }

  stockProducts.forEach(({ product, qty }) => {
    product.stockQty = Math.max(Number(product.stockQty || 0) - qty, 0);
    if (product.stockQty <= 0) product.soldOut = true;
  });

  return '';
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

app.get('/api/backup', asyncHandler(async (req, res) => {
  const db = await readDb();
  const date = localDate(new Date());
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-quintal-do-ze-${date}.json"`);
  res.json(sanitizedBackup(db));
}));

app.get('/api/settings', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(normalizeSettings(db.settings));
}));

app.put('/api/settings', asyncHandler(async (req, res) => {
  const db = await readDb();
  const previousTrainingMode = db.settings?.trainingMode === true;
  db.settings = normalizeSettings({
    ...db.settings,
    ...req.body
  });

  if (previousTrainingMode !== db.settings.trainingMode) {
    logAction(db, 'settings', `Modo treinamento ${db.settings.trainingMode ? 'ativado' : 'desativado'}`, { trainingMode: db.settings.trainingMode });
  } else {
    logAction(db, 'settings', 'Configurações do sistema atualizadas', { settings: db.settings });
  }

  await writeDb(db);
  res.json(db.settings);
}));

app.get('/api/customers', asyncHandler(async (req, res) => {
  const db = await readDb();
  const customers = [...(db.customers || [])]
    .map(normalizeCustomer)
    .sort((a, b) => new Date(b.lastQuoteAt || b.updatedAt || 0) - new Date(a.lastQuoteAt || a.updatedAt || 0));

  res.json(customers);
}));

app.delete('/api/training-data', asyncHandler(async (req, res) => {
  const db = await readDb();
  const before = {
    orders: db.orders.length,
    quotes: db.quotes.length,
    customers: db.customers.length,
    cashSessions: db.cashSessions.length
  };

  db.orders = db.orders.filter((order) => order.training !== true);
  db.quotes = db.quotes.filter((quote) => quote.training !== true);
  db.customers = db.customers.filter((customer) => customer.training !== true);
  db.cashSessions = db.cashSessions.filter((session) => session.training !== true);

  const removed = {
    orders: before.orders - db.orders.length,
    quotes: before.quotes - db.quotes.length,
    customers: before.customers - db.customers.length,
    cashSessions: before.cashSessions - db.cashSessions.length
  };

  logAction(db, 'training', 'Dados de treinamento apagados', removed);
  await writeDb(db);
  res.json({ ok: true, removed });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const db = await readDb();
  const user = db.users.find((u) => String(u.email).toLowerCase() === email);
  if (!user || !verifyUserPassword(user, password)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  if (user.active === false) return res.status(403).json({ error: 'Usuário desativado. Fale com o administrador.' });

  if (!user.passwordHash && user.password) {
    setUserPassword(user, password);
    await writeDb(db);
  }

  res.json(publicUser(user));
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.users.map(publicUser));
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const db = await readDb();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  if (!email || !password || !req.body.role) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e perfil.' });
  if (db.users.some((u) => String(u.email).toLowerCase() === email)) return res.status(409).json({ error: 'Já existe usuário com este e-mail.' });

  const user = {
    id: nextId(db.users),
    name: String(req.body.name || '').trim() || email,
    email,
    role: String(req.body.role),
    active: req.body.active !== false
  };
  setUserPassword(user, password);

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
  if (req.body.active !== undefined) user.active = req.body.active !== false;
  if (String(req.body.password || '').trim()) setUserPassword(user, String(req.body.password).trim());

  await writeDb(db);
  res.json(publicUser(user));
}));

app.put('/api/users/:id/status', asyncHandler(async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => String(u.id) === String(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  user.active = req.body.active !== false;

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
  const usage = ['orders', 'quotes'].includes(String(req.query.usage || '')) ? String(req.query.usage) : '';
  res.json(db.products.filter((product) => productMatchesUsage(product, usage)));
}));

app.post('/api/products', asyncHandler(async (req, res) => {
  const db = await readDb();
  if (!req.body.name || req.body.price === undefined || req.body.price === '') return res.status(400).json({ error: 'Preencha nome e preço.' });

  const product = normalizeProduct({
    id: nextId(db.products),
    name: String(req.body.name).trim(),
    category: String(req.body.category || 'Geral').trim(),
    price: Number(req.body.price),
    description: String(req.body.description || '').trim(),
    active: req.body.active !== false,
    soldOut: req.body.soldOut === true,
    usage: productUsage(req.body.usage),
    stockEnabled: req.body.stockEnabled === true,
    stockQty: Number(req.body.stockQty || 0),
    lowStockAt: Number(req.body.lowStockAt ?? 5)
  });

  db.products.push(product);
  logAction(db, 'product', `Produto cadastrado: ${product.name}`, { productId: product.id });
  await writeDb(db);
  res.json(product);
}));

app.put('/api/products/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const product = db.products.find((p) => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  product.name = String(req.body.name || product.name).trim();
  product.category = String(req.body.category || 'Geral').trim();
  product.price = Number(req.body.price ?? product.price);
  product.description = String(req.body.description || '').trim();
  product.active = req.body.active !== false;
  product.soldOut = req.body.soldOut === true;
  if (req.body.usage) product.usage = productUsage(req.body.usage);
  product.stockEnabled = req.body.stockEnabled === true;
  product.stockQty = Math.max(Number(req.body.stockQty || 0), 0);
  product.lowStockAt = Math.max(Number(req.body.lowStockAt ?? product.lowStockAt ?? 5), 0);

  const normalizedProduct = normalizeProduct(product);
  Object.assign(product, normalizedProduct);

  logAction(db, 'product', `Produto atualizado: ${product.name}`, { productId: product.id, soldOut: product.soldOut, stockQty: product.stockQty });
  await writeDb(db);
  res.json(normalizeProduct(product));
}));

app.delete('/api/products/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const product = db.products.find((p) => String(p.id) === String(req.params.id));
  db.products = db.products.filter((p) => String(p.id) !== String(req.params.id));
  if (product) logAction(db, 'product', `Produto excluído: ${product.name}`, { productId: product.id });
  await writeDb(db);
  res.json({ ok: true });
}));

app.put('/api/products/:id/sold-out', asyncHandler(async (req, res) => {
  const db = await readDb();
  const product = db.products.find((p) => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  product.soldOut = req.body.soldOut === true;
  if (product.stockEnabled === true && product.soldOut === false && Number(product.stockQty || 0) <= 0) {
    product.stockQty = 1;
  }
  product.active = product.active !== false;
  logAction(db, 'product', `${product.name} marcado como ${product.soldOut ? 'esgotado' : 'disponível'}`, { productId: product.id, soldOut: product.soldOut });

  await writeDb(db);
  res.json(normalizeProduct(product));
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
      validUntil: String(body.validUntil || '').trim(),
      commercialNotes: String(body.commercialNotes || '').trim(),
      status: String(body.status || existingQuote?.status || 'rascunho'),
      items,
      total: quoteTotal(items),
      convertedOrderId: existingQuote?.convertedOrderId || null,
      createdAt: existingQuote?.createdAt || now,
      updatedAt: now
    }
  };
}

function defaultCommercialNotes() {
  return 'Valores sujeitos à disponibilidade. Entrega, montagem e itens extras serão considerados conforme combinado na proposta.';
}

function moneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function quoteDateBR(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

function quotePdfFileName(quote) {
  const client = String(quote.clientName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'cliente';

  return `orcamento-quintal-do-ze-${quote.id}-${client}.pdf`;
}

function drawInfoBox(doc, x, y, width, height, label, value) {
  const isValidity = String(label || '').toLowerCase().includes('validade');

  doc
    .roundedRect(x, y, width, height, 11)
    .fillAndStroke(isValidity ? '#ffefb4' : '#fff6da', isValidity ? '#f6c400' : '#e7cd7a');
  doc
    .fillColor(isValidity ? '#171511' : '#6d5f3e')
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text(String(label || '').toUpperCase(), x + 10, y + 9, { width: width - 20 });
  doc
    .fillColor('#171511')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(String(value || '-'), x + 10, y + 24, {
      width: width - 20,
      height: height - 30,
      ellipsis: true
    });
}

function drawQuotePdfHeader(doc, quote, quoteNumber) {
  const logoPath = path.join(__dirname, 'public', 'assets', 'logo.jpg');
  const x = 36;
  const y = 34;
  const width = doc.page.width - 72;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff7df');
  doc
    .roundedRect(x, y, width, 104, 19)
    .fillAndStroke('#11100d', '#f6c400');

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x + 18, y + 18, { fit: [68, 68] });
  } else {
    doc
      .roundedRect(x + 18, y + 18, 68, 68, 14)
      .fill('#f6c400');
  }

  doc
    .roundedRect(x + 102, y + 19, 116, 17, 8)
    .fill('#f6c400')
    .fillColor('#171511')
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text('PROPOSTA COMERCIAL', x + 112, y + 24);

  doc
    .fillColor('#fff4c2')
    .font('Helvetica-Bold')
    .fontSize(23)
    .text('Orçamento Quintal', x + 102, y + 40, { width: width - 286, lineBreak: false });
  doc
    .fontSize(23)
    .text('do Zé', x + 102, y + 64, { width: width - 286, lineBreak: false });
  doc
    .fillColor('#dfd2ad')
    .font('Helvetica')
    .fontSize(8.5)
    .text('Café da tarde, happy hour, coffee break e eventos personalizados.', x + 102, y + 89, { width: width - 238, lineBreak: false });

  doc
    .fillColor('#cfc3a4')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('ORÇAMENTO', x + width - 152, y + 28, { width: 130, align: 'right' });
  doc
    .fillColor('#f6c400')
    .fontSize(20)
    .text(`#${quoteNumber}`, x + width - 152, y + 45, { width: 130, align: 'right' });

  return y + 128;
}

function drawQuotePdf(quote, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const quoteNumber = String(quote.id || '').slice(-6).padStart(4, '0');
  const pageWidth = doc.page.width;
  const left = 36;
  const contentWidth = pageWidth - 72;
  const columnGap = 12;
  const columnWidth = (contentWidth - columnGap) / 2;
  doc.pipe(stream);
  let y = drawQuotePdfHeader(doc, quote, quoteNumber);

  const info = [
    ['Cliente', quote.clientName || '-'],
    ['Contato', quote.phone || '-'],
    ['Evento', quote.eventType || '-'],
    ['Validade', quoteDateBR(quote.validUntil)],
    ['Data', quoteDateBR(quote.eventDate)],
    ['Horário', quote.eventTime || '-'],
    ['Pessoas', quote.guests ? `${quote.guests}` : '-'],
    ['Local', quote.location || '-'],
  ];

  info.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawInfoBox(doc, left + col * (columnWidth + columnGap), y + row * 58, columnWidth, 48, label, value);
  });

  y += Math.ceil(info.length / 2) * 58 + 20;

  if (quote.notes) {
    doc
      .roundedRect(left, y, contentWidth, 52, 12)
      .fillAndStroke('#fff0bd', '#e7cd7a');
    doc
      .fillColor('#6d5f3e')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('OBSERVAÇÕES', left + 12, y + 10);
    doc
      .fillColor('#171511')
      .font('Helvetica')
      .fontSize(10)
      .text(String(quote.notes), left + 12, y + 24, { width: contentWidth - 24, height: 22, ellipsis: true });
    y += 70;
  }

  const commercialNotes = String(quote.commercialNotes || '').trim() || defaultCommercialNotes();
  const nextSteps = 'Próximo passo: responda esta mensagem para confirmar ou solicitar ajustes.';
  const commercialText = `${commercialNotes} ${nextSteps}`;
  if (commercialText) {
    doc
      .roundedRect(left, y, contentWidth, 58, 12)
      .fillAndStroke('#fff0bd', '#e7cd7a');
    doc
      .fillColor('#6d5f3e')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CONDIÇÕES E PRÓXIMOS PASSOS', left + 12, y + 10);
    doc
      .fillColor('#171511')
      .font('Helvetica')
      .fontSize(9.5)
      .text(commercialText, left + 12, y + 24, { width: contentWidth - 24, height: 26, ellipsis: true });
    y += 76;
  }

  doc
    .fillColor('#171511')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('Itens do orçamento', left, y);
  y += 30;

  const tableTop = y;
  doc
    .roundedRect(left, tableTop, contentWidth, 28, 10)
    .fill('#f6c400');
  doc
    .fillColor('#171511')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('ITEM', left + 12, tableTop + 10, { width: 235 })
    .text('QTD.', left + 285, tableTop + 10, { width: 46, align: 'right' })
    .text('VALOR UNIT.', left + 350, tableTop + 10, { width: 76, align: 'right' })
    .text('TOTAL', left + 440, tableTop + 10, { width: 66, align: 'right' });

  y = tableTop + 34;

  (quote.items || []).forEach((item) => {
    if (y > 698) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff7df');
      y = 42;
    }

    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const total = qty * unitPrice;
    const descriptionHeight = doc.heightOfString(String(item.description || 'Item'), { width: 235 });
    const rowHeight = Math.max(34, descriptionHeight + 18);

    doc
      .roundedRect(left, y, contentWidth, rowHeight, 9)
      .fillAndStroke('#fffaf0', '#ead391');
    doc
      .fillColor('#171511')
      .font('Helvetica')
      .fontSize(10)
      .text(String(item.description || 'Item'), left + 12, y + 10, { width: 235 });
    doc
      .font('Helvetica-Bold')
      .text(qty, left + 285, y + 10, { width: 46, align: 'right' })
      .text(moneyBR(unitPrice), left + 350, y + 10, { width: 76, align: 'right' })
      .text(moneyBR(total), left + 440, y + 10, { width: 66, align: 'right' });

    y += rowHeight + 6;
  });

  y += 8;
  if (y > 730) {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff7df');
    y = 42;
  }

  doc
    .roundedRect(left, y, contentWidth, 54, 14)
    .fillAndStroke('#11100d', '#f6c400');
  const totalAmountWidth = 190;
  const totalAmountX = left + contentWidth - totalAmountWidth - 18;
  doc
    .fillColor('#e7dcc2')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Total do orçamento', left + 155, y + 20, { width: totalAmountX - left - 175, align: 'right', lineBreak: false });
  doc
    .fillColor('#f6c400')
    .fontSize(22)
    .text(moneyBR(quote.total), totalAmountX, y + 16, { width: totalAmountWidth, align: 'right', lineBreak: false });

  y += 78;
  doc
    .fillColor('#7b6d51')
    .font('Helvetica')
    .fontSize(8)
    .text('Quintal do Zé', left, y)
    .text('Documento gerado pelo sistema de pedidos.', left, y, { width: contentWidth, align: 'right' });

  doc.end();
}

app.get('/api/quotes', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(db.quotes);
}));

app.post('/api/quotes', asyncHandler(async (req, res) => {
  const db = await readDb();
  const result = quoteBody(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  const quote = { ...result.quote, id: nextId(db.quotes), training: db.settings?.trainingMode === true };
  db.quotes.push(quote);
  upsertCustomerFromQuote(db, quote);

  logAction(db, 'quote', `Orçamento criado: ${quote.clientName}`, { quoteId: quote.id, total: quote.total });
  await writeDb(db);
  res.json(quote);
}));

app.put('/api/quotes/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const index = db.quotes.findIndex((quote) => String(quote.id) === String(req.params.id));
  if (index < 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  const result = quoteBody(req.body, db.quotes[index]);
  if (result.error) return res.status(400).json({ error: result.error });

  db.quotes[index] = { ...result.quote, id: db.quotes[index].id, training: db.quotes[index].training === true };
  upsertCustomerFromQuote(db, db.quotes[index]);
  logAction(db, 'quote', `Orçamento atualizado: ${db.quotes[index].clientName}`, { quoteId: db.quotes[index].id, total: db.quotes[index].total });
  await writeDb(db);
  res.json(db.quotes[index]);
}));

app.delete('/api/quotes/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const quote = db.quotes.find((item) => String(item.id) === String(req.params.id));
  db.quotes = db.quotes.filter((quote) => String(quote.id) !== String(req.params.id));
  if (quote) logAction(db, 'quote', `Orçamento excluído: ${quote.clientName}`, { quoteId: quote.id });
  await writeDb(db);
  res.json({ ok: true });
}));

app.get('/api/quotes/:id/pdf', asyncHandler(async (req, res) => {
  const db = await readDb();
  const quote = db.quotes.find((item) => String(item.id) === String(req.params.id));
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${quotePdfFileName(quote)}"`);

  drawQuotePdf(quote, res);
}));

app.post('/api/quotes/:id/approve', asyncHandler(async (req, res) => {
  const db = await readDb();
  const quote = db.quotes.find((item) => String(item.id) === String(req.params.id));
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  if (quote.convertedOrderId) {
    const existingOrder = db.orders.find((order) => String(order.id) === String(quote.convertedOrderId));
    return res.json({ ok: true, quote, order: existingOrder || null, alreadyConverted: true });
  }

  const now = new Date().toISOString();
  const table = String(req.body.table || `Evento ${quote.id}`).trim();
  const waiter = String(req.body.waiter || 'Orçamento').trim();
  const items = sanitizeOrderItems((quote.items || []).map((item) => ({
    id: item.productId || null,
    name: item.description,
    qty: item.qty,
    price: item.unitPrice,
    basePrice: item.unitPrice,
    extraPrice: 0,
    note: 'Item vindo do orçamento'
  })));
  const total = items.reduce((sum, item) => sum + itemLineTotal(item), 0);

  if (!items.length) return res.status(400).json({ error: 'O orçamento precisa ter itens para virar pedido.' });

  const notes = [
    `Evento: ${quote.eventType}`,
    quote.clientName ? `Cliente: ${quote.clientName}` : '',
    quote.phone ? `Contato: ${quote.phone}` : '',
    quote.eventDate ? `Data: ${quote.eventDate}` : '',
    quote.eventTime ? `Horário: ${quote.eventTime}` : '',
    quote.guests ? `Pessoas: ${quote.guests}` : '',
    quote.location ? `Local: ${quote.location}` : '',
    quote.notes ? `Obs.: ${quote.notes}` : '',
  ].filter(Boolean).join(' | ');

  const order = {
    id: nextId(db.orders),
    table,
    waiter,
    items,
    notes,
    status: 'pendente',
    paid: false,
    subtotal: total,
    serviceFee: 0,
    discount: 0,
    total,
    paymentMethod: '',
    paymentNote: '',
    paymentSplitCount: 0,
    cancelReason: '',
    source: 'quote',
    quoteId: quote.id,
    eventStatus: 'agendado',
    eventClient: quote.clientName || '',
    eventType: quote.eventType || '',
    eventDate: quote.eventDate || '',
    eventTime: quote.eventTime || '',
    eventGuests: Number(quote.guests || 0),
    eventLocation: quote.location || '',
    createdAt: now,
    startedAt: null,
    readyAt: null,
    deliveredAt: null,
    paidAt: null,
    canceledAt: null,
    tableMoves: [],
    training: quote.training === true || db.settings?.trainingMode === true
  };

  db.orders.push(order);
  quote.status = 'aprovado';
  quote.convertedOrderId = order.id;
  quote.updatedAt = now;

  logAction(db, 'quote', `Orçamento aprovado e enviado como pedido: ${quote.clientName}`, { quoteId: quote.id, orderId: order.id });
  await writeDb(db);
  res.json({ ok: true, quote, order });
}));

app.get('/api/orders', asyncHandler(async (req, res) => {
  const db = await readDb();
  res.json(filterOrdersForRequest(db.orders, req.query));
}));

app.get('/api/orders/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((item) => String(item.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json(order);
}));

app.put('/api/orders/:id/event-status', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Evento não encontrado.' });
  if (!isEventOrder(order)) return res.status(400).json({ error: 'Este pedido não é um evento.' });

  const previousStatus = order.eventStatus || 'agendado';
  const nextStatus = eventStatus(req.body.eventStatus || req.body.status);
  order.eventStatus = nextStatus;

  if (nextStatus === 'cancelado' && order.status !== 'cancelado') {
    order.status = 'cancelado';
    order.cancelReason = String(req.body.cancelReason || 'Evento cancelado').trim();
    order.canceledAt = new Date().toISOString();
  }

  logAction(db, 'event', `Evento #${order.id} alterado para ${nextStatus}`, { orderId: order.id, previousStatus, nextStatus });
  await writeDb(db);
  res.json(order);
}));

app.post('/api/orders', asyncHandler(async (req, res) => {
  const db = await readDb();
  const table = String(req.body.table || '').trim();
  const waiter = String(req.body.waiter || '').trim();
  const items = sanitizeOrderItems(req.body.items);

  if (!table || !waiter || !items.length) return res.status(400).json({ error: 'Informe mesa/comanda, garçom e itens.' });

  const stockError = db.settings?.trainingMode === true ? '' : applyStockForOrder(db, items);
  if (stockError) return res.status(409).json({ error: stockError });

  const total = items.reduce((sum, item) => sum + itemLineTotal(item), 0);
  const order = {
    id: nextId(db.orders),
    table,
    waiter,
    items,
    notes: String(req.body.notes || '').trim(),
    status: 'pendente',
    paid: false,
    subtotal: total,
    serviceFee: 0,
    discount: 0,
    total,
    paymentMethod: '',
    paymentNote: '',
    paymentSplitCount: 0,
    cancelReason: '',
    createdAt: new Date().toISOString(),
    startedAt: null,
    readyAt: null,
    deliveredAt: null,
    paidAt: null,
    canceledAt: null,
    tableMoves: [],
    training: db.settings?.trainingMode === true
  };

  db.orders.push(order);
  logAction(db, 'order', `Pedido criado na mesa/comanda ${table}`, { orderId: order.id, table, waiter, total });
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
  if (nextStatus === 'cancelado' && previousStatus !== 'cancelado') {
    order.cancelReason = String(req.body.cancelReason || '').trim();
    order.canceledAt = now;
  }

  logAction(db, 'order', `Pedido #${order.id} alterado para ${nextStatus}`, { orderId: order.id, previousStatus, nextStatus });
  await writeDb(db);
  res.json(order);
}));

app.put('/api/orders/:id/pay', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  applyPaymentToOrder(order, req.body, new Date().toISOString());

  logAction(db, 'cash', `Pedido #${order.id} pago`, { orderId: order.id, table: order.table, total: order.total, paymentMethod: order.paymentMethod });
  await writeDb(db);
  res.json(order);
}));

app.post('/api/tables/pay', asyncHandler(async (req, res) => {
  const db = await readDb();
  const table = String(req.body.table || '').trim();
  if (!table) return res.status(400).json({ error: 'Informe a mesa/comanda.' });

  const tableOrders = db.orders.filter((order) => openOrderForTable(order, table));
  if (!tableOrders.length) return res.status(404).json({ error: 'Nenhum pedido aberto para esta mesa/comanda.' });

  const serviceFee = Math.max(Number(req.body.serviceFee || 0), 0);
  const discount = Math.max(Number(req.body.discount || 0), 0);
  const subtotals = tableOrders.map(orderSubtotal);
  const serviceParts = splitAmount(serviceFee, subtotals);
  const discountParts = splitAmount(discount, subtotals);
  const paidAt = new Date().toISOString();

  tableOrders.forEach((order, index) => {
    applyPaymentToOrder(order, {
      paymentMethod: req.body.paymentMethod,
      paymentNote: req.body.paymentNote,
      paymentSplitCount: req.body.paymentSplitCount || req.body.splitCount,
      serviceFee: serviceParts[index],
      discount: discountParts[index],
    }, paidAt);
  });

  logAction(db, 'cash', `Mesa/comanda ${table} fechada`, {
    table,
    orders: tableOrders.map((order) => order.id),
    total: tableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    paymentMethod: paymentMethod(req.body.paymentMethod)
  });
  await writeDb(db);
  res.json({
    ok: true,
    table,
    orders: tableOrders,
    subtotal: subtotals.reduce((sum, value) => sum + value, 0),
    serviceFee,
    discount,
    paymentSplitCount: Math.max(Number(req.body.paymentSplitCount || req.body.splitCount || 0), 0),
    total: tableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
  });
}));

app.post('/api/tables/transfer', asyncHandler(async (req, res) => {
  const db = await readDb();
  const fromTable = String(req.body.fromTable || req.body.table || '').trim();
  const toTable = String(req.body.toTable || '').trim();

  if (!fromTable || !toTable) return res.status(400).json({ error: 'Informe a mesa de origem e a mesa de destino.' });
  if (fromTable === toTable) return res.status(400).json({ error: 'A mesa de destino precisa ser diferente da atual.' });

  const tableOrders = db.orders.filter((order) => openOrderForTable(order, fromTable));
  if (!tableOrders.length) return res.status(404).json({ error: 'Nenhum pedido aberto para mover nesta mesa/comanda.' });

  const movedAt = new Date().toISOString();
  tableOrders.forEach((order) => {
    order.tableMoves = Array.isArray(order.tableMoves) ? order.tableMoves : [];
    order.tableMoves.push({ fromTable, toTable, movedAt });
    order.table = toTable;
  });

  logAction(db, 'table', `Mesa/comanda ${fromTable} movida/juntada para ${toTable}`, { fromTable, toTable, moved: tableOrders.length });
  await writeDb(db);
  res.json({ ok: true, fromTable, toTable, moved: tableOrders.length, orders: tableOrders });
}));

app.get('/api/cash-sessions/current', asyncHandler(async (req, res) => {
  const db = await readDb();
  const current = (db.cashSessions || []).find((session) => session.status === 'open') || null;
  res.json({
    current,
    sessions: [...(db.cashSessions || [])].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)).slice(0, 20)
  });
}));

app.get('/api/cash-sessions', asyncHandler(async (req, res) => {
  const db = await readDb();
  const date = String(req.query.date || '').trim();
  const sessions = [...(db.cashSessions || [])]
    .filter((session) => !date || session.date === date)
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  res.json(sessions);
}));

app.post('/api/cash-sessions/open', asyncHandler(async (req, res) => {
  const db = await readDb();
  const current = (db.cashSessions || []).find((session) => session.status === 'open');
  if (current) return res.status(409).json({ error: 'Já existe um caixa aberto.' });

  const openedAt = new Date().toISOString();
  const session = {
    id: nextId(db.cashSessions || []),
    date: localDate(openedAt),
    status: 'open',
    openingAmount: Math.max(Number(req.body.openingAmount || 0), 0),
    note: String(req.body.note || '').trim(),
    entries: [],
    openedAt,
    closedAt: null,
    countedCash: null,
    expectedCash: null,
    difference: null,
    closeNote: '',
    training: db.settings?.trainingMode === true
  };

  db.cashSessions.push(session);
  logAction(db, 'cash-session', `Caixa aberto com ${session.openingAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, { sessionId: session.id });
  await writeDb(db);
  res.json(session);
}));

app.post('/api/cash-sessions/entry', asyncHandler(async (req, res) => {
  const db = await readDb();
  const session = (db.cashSessions || []).find((item) => item.status === 'open');
  if (!session) return res.status(404).json({ error: 'Abra o caixa antes de registrar movimentações.' });

  const type = String(req.body.type) === 'sangria' ? 'sangria' : 'suprimento';
  const amount = Math.max(Number(req.body.amount || 0), 0);
  if (!amount) return res.status(400).json({ error: 'Informe um valor maior que zero.' });

  const entry = {
    id: nextId(session.entries || []),
    type,
    amount,
    note: String(req.body.note || '').trim(),
    createdAt: new Date().toISOString()
  };

  session.entries = [...(session.entries || []), entry];
  logAction(db, 'cash-session', `${type === 'sangria' ? 'Sangria' : 'Suprimento'} registrado no caixa`, { sessionId: session.id, amount });
  await writeDb(db);
  res.json(session);
}));

app.post('/api/cash-sessions/close', asyncHandler(async (req, res) => {
  const db = await readDb();
  const session = (db.cashSessions || []).find((item) => item.status === 'open');
  if (!session) return res.status(404).json({ error: 'Nenhum caixa aberto para fechar.' });

  const entries = session.entries || [];
  const supplies = entries.filter((entry) => entry.type === 'suprimento').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const withdrawals = entries.filter((entry) => entry.type === 'sangria').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cashSales = cashSalesForDate(db, session.date);
  const expectedCash = Number((Number(session.openingAmount || 0) + supplies - withdrawals + cashSales).toFixed(2));
  const countedCash = Math.max(Number(req.body.countedCash || 0), 0);

  session.status = 'closed';
  session.closedAt = new Date().toISOString();
  session.countedCash = countedCash;
  session.expectedCash = expectedCash;
  session.difference = Number((countedCash - expectedCash).toFixed(2));
  session.closeNote = String(req.body.note || '').trim();

  logAction(db, 'cash-session', `Caixa fechado com diferença de ${session.difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, { sessionId: session.id, expectedCash, countedCash });
  await writeDb(db);
  res.json(session);
}));

app.get('/api/activity-log', asyncHandler(async (req, res) => {
  const db = await readDb();
  const date = String(req.query.date || '').trim();
  const rows = (db.activityLog || [])
    .filter((entry) => !date || localDate(entry.createdAt) === date)
    .slice(0, 100);
  res.json(rows);
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

  logAction(db, 'kitchen', `Dia da cozinha encerrado`, { closed });
  await writeDb(db);
  res.json({ ok: true, closed });
}));

app.delete('/api/orders/:id', asyncHandler(async (req, res) => {
  const db = await readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  db.orders = db.orders.filter((o) => String(o.id) !== String(req.params.id));
  if (order) logAction(db, 'order', `Pedido #${order.id} excluído`, { orderId: order.id, table: order.table });
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
