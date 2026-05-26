const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function defaultDb() {
  return {
    users: [
      { id: 1, name: 'Administrador', email: 'admin@quintaldoze.local', password: 'quintaldoze123', role: 'admin' },
      { id: 2, name: 'Garçom', email: 'garcom@quintaldoze.local', password: 'quintaldoze123', role: 'garcom' },
      { id: 3, name: 'Cozinha', email: 'cozinha@quintaldoze.local', password: 'quintaldoze123', role: 'cozinha' },
      { id: 4, name: 'Caixa', email: 'caixa@quintaldoze.local', password: 'quintaldoze123', role: 'caixa' }
    ],
    products: [
      { id: 101, name: 'Prato Executivo', category: 'Pratos', price: 28.90, description: 'Arroz, feijão, salada e proteína do dia', active: true },
      { id: 102, name: 'Porção de Batata', category: 'Porções', price: 24.00, description: 'Batata frita crocante', active: true },
      { id: 103, name: 'Refrigerante Lata', category: 'Bebidas', price: 6.50, description: '350 ml', active: true }
    ],
    orders: []
  };
}

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(raw);
    if (!Array.isArray(db.users)) db.users = defaultDb().users;
    if (!Array.isArray(db.products)) db.products = [];
    if (!Array.isArray(db.orders)) db.orders = [];
    return db;
  } catch (err) {
    const db = defaultDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function nextId(list) {
  return list.length ? Math.max(...list.map(item => Number(item.id) || 0)) + 1 : Date.now();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Quintal do Zé Local' }));

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  const db = readDb();
  const user = db.users.find(u => String(u.email).toLowerCase() === email && String(u.password) === password);
  if (!user) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  res.json(publicUser(user));
});

app.get('/api/users', (req, res) => {
  const db = readDb();
  res.json(db.users.map(publicUser));
});

app.post('/api/users', (req, res) => {
  const db = readDb();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !req.body.password || !req.body.role) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e perfil.' });
  if (db.users.some(u => String(u.email).toLowerCase() === email)) return res.status(409).json({ error: 'Já existe usuário com este e-mail.' });
  const user = { id: nextId(db.users), name: String(req.body.name || '').trim() || email, email, password: String(req.body.password), role: String(req.body.role) };
  db.users.push(user);
  writeDb(db);
  res.json(publicUser(user));
});

app.put('/api/users/:id', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => String(u.id) === String(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !req.body.role) return res.status(400).json({ error: 'Preencha e-mail e perfil.' });
  const duplicate = db.users.find(u => String(u.email).toLowerCase() === email && String(u.id) !== String(user.id));
  if (duplicate) return res.status(409).json({ error: 'Outro usuário já usa este e-mail.' });
  user.name = String(req.body.name || '').trim() || email;
  user.email = email;
  user.role = String(req.body.role);
  if (req.body.password) user.password = String(req.body.password);
  writeDb(db);
  res.json(publicUser(user));
});

app.delete('/api/users/:id', (req, res) => {
  const db = readDb();
  db.users = db.users.filter(u => String(u.id) !== String(req.params.id));
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/products', (req, res) => res.json(readDb().products));

app.post('/api/products', (req, res) => {
  const db = readDb();
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
  writeDb(db);
  res.json(product);
});

app.put('/api/products/:id', (req, res) => {
  const db = readDb();
  const product = db.products.find(p => String(p.id) === String(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  product.name = String(req.body.name || product.name).trim();
  product.category = String(req.body.category || 'Geral').trim();
  product.price = Number(req.body.price || product.price);
  product.description = String(req.body.description || '').trim();
  product.active = req.body.active !== false;
  writeDb(db);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const db = readDb();
  db.products = db.products.filter(p => String(p.id) !== String(req.params.id));
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/orders', (req, res) => res.json(readDb().orders));

app.post('/api/orders', (req, res) => {
  const db = readDb();
  const table = String(req.body.table || '').trim();
  const waiter = String(req.body.waiter || '').trim();
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!table || !waiter || !items.length) return res.status(400).json({ error: 'Informe mesa/comanda, garçom e itens.' });
  const total = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 1)), 0);
  const order = {
    id: nextId(db.orders), table, waiter, items,
    notes: String(req.body.notes || '').trim(),
    status: 'pendente', paid: false, total,
    createdAt: new Date().toISOString(), startedAt: null, readyAt: null, deliveredAt: null, paidAt: null
  };
  db.orders.push(order);
  writeDb(db);
  res.json(order);
});

app.put('/api/orders/:id/status', (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const allowed = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];
  const previousStatus = order.status;
  const nextStatus = allowed.includes(req.body.status) ? req.body.status : order.status;
  order.status = nextStatus;

  const now = new Date().toISOString();
  if (nextStatus === 'preparando' && previousStatus !== 'preparando' && !order.startedAt) order.startedAt = now;
  if (nextStatus === 'pronto' && previousStatus !== 'pronto' && !order.readyAt) order.readyAt = now;
  if (nextStatus === 'entregue' && previousStatus !== 'entregue' && !order.deliveredAt) order.deliveredAt = now;

  writeDb(db);
  res.json(order);
});

app.put('/api/orders/:id/pay', (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  order.paid = true;
  order.paidAt = new Date().toISOString();
  writeDb(db);
  res.json(order);
});


app.post('/api/orders/close-day', (req, res) => {
  const db = readDb();
  const now = new Date();
  const sameDay = (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) &&
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
  };

  let closed = 0;
  db.orders.forEach(order => {
    if (sameDay(order.createdAt) && !['cancelado', 'entregue'].includes(order.status)) {
      order.status = 'entregue';
      if (!order.deliveredAt) order.deliveredAt = now.toISOString();
      closed += 1;
    }
  });

  writeDb(db);
  res.json({ ok: true, closed });
});

app.delete('/api/orders/:id', (req, res) => {
  const db = readDb();
  db.orders = db.orders.filter(o => String(o.id) !== String(req.params.id));
  writeDb(db);
  res.json({ ok: true });
});

// Rotas diretas sem wildcard problemático.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('Quintal do Zé rodando com sucesso!');
  console.log(`Computador: http://localhost:${PORT}`);
  getLocalIps().forEach(ip => console.log(`Celular/tablet: http://${ip}:${PORT}`));
  console.log('Login admin: admin@quintaldoze.local / 123456');
  console.log('========================================');
});
