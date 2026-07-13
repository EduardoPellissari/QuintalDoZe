/* ==================================================
   TELA DO GARÇOM
   Textos editáveis em: public/js/textos.js
   ================================================== */

requireRole(['garcom', 'admin']);

setupNav([{ href: '/garcom.html', labelKey: 'menu.pedidos', active: true }]);

setText('areaSmall', txt('garcom.area', 'Área do garçom'));
setText('pageTitle', txt('garcom.titulo', 'Novo pedido'));
setText('pageSub', txt('garcom.subtitulo', 'Crie comandas para enviar à cozinha.'));

let products = [];
let cart = [];
let selectedCategory = txt('garcom.todos', 'Todos');
let openOrders = [];

// Altere este numero se o restaurante tiver mais ou menos mesas fixas.
const TOTAL_TABLES = 30;

async function init() {
  const [orderProducts, orders] = await Promise.all([
    API.get('/api/products?usage=orders'),
    API.get('/api/orders'),
  ]);

  products = orderProducts.filter((product) => product.active !== false);
  openOrders = orders.filter(isOpenOrder);
  render();
}

function productId(id) {
  return String(id);
}

function getCategories() {
  const categories = products
    .map((product) => (product.category || txt('garcom.geral', 'Geral')).trim() || txt('garcom.geral', 'Geral'))
    .filter(Boolean);

  return [txt('garcom.todos', 'Todos'), ...Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
}

function getFilteredProducts() {
  if (selectedCategory === txt('garcom.todos', 'Todos')) return products;
  return products.filter((product) => ((product.category || txt('garcom.geral', 'Geral')).trim() || txt('garcom.geral', 'Geral')) === selectedCategory);
}

function add(id) {
  const product = products.find((item) => productId(item.id) === productId(id));
  if (!product) return;

  const line = cart.find((item) => productId(item.id) === productId(id));

  if (line) line.qty++;
  else cart.push({ ...product, qty: 1 });

  renderCart();
}

function dec(id) {
  const line = cart.find((item) => productId(item.id) === productId(id));
  if (!line) return;

  line.qty--;

  if (line.qty <= 0) {
    cart = cart.filter((item) => productId(item.id) !== productId(id));
  }

  renderCart();
}

function selectCategory(category) {
  selectedCategory = category;
  renderMenu();
}

function isOpenOrder(order) {
  return !order.paid && order.status !== 'cancelado';
}

function configuredTables() {
  return Array.from({ length: TOTAL_TABLES }, (_, index) => String(index + 1));
}

function normalizedTable(value) {
  const table = String(value || '').trim();
  if (/^\d+$/.test(table)) return String(Number(table));
  return table;
}

function occupiedTables() {
  return new Set(openOrders.map((order) => normalizedTable(order.table)).filter(Boolean));
}

function availableTables() {
  const occupied = occupiedTables();
  return configuredTables().filter((table) => !occupied.has(table));
}

async function refreshOpenOrders() {
  const orders = await API.get('/api/orders');
  openOrders = orders.filter(isOpenOrder);
}

async function syncTableSuggestions() {
  try {
    await refreshOpenOrders();
    renderTableSuggestions();
  } catch (err) {
    console.warn('Nao foi possivel atualizar as mesas disponiveis.', err);
  }
}

function renderTableSuggestions() {
  const element = document.getElementById('tableSuggestions');
  const datalist = document.getElementById('availableTablesList');
  if (!element || !datalist) return;

  const freeTables = availableTables();
  const usedTables = Array.from(occupiedTables())
    .filter((table) => configuredTables().includes(table))
    .sort((a, b) => Number(a) - Number(b));

  datalist.innerHTML = freeTables.map((table) => `<option value="${htmlAttr(table)}">Mesa ${htmlAttr(table)} livre</option>`).join('');

  element.innerHTML = `
    <div class="table-picker-head">
      <span>${freeTables.length} mesa(s) livre(s)</span>
      <small>${usedTables.length} em uso</small>
    </div>

    <div class="table-picker-grid">
      ${freeTables.length ? freeTables.map((table) => `
        <button type="button" class="table-picker-chip" onclick="selectTableSuggestion('${htmlAttr(table)}')">${htmlAttr(table)}</button>
      `).join('') : '<p class="muted">Todas as mesas cadastradas estão em uso.</p>'}
    </div>

    ${usedTables.length ? `
      <p class="table-picker-note">
        Mesas em uso não aparecem na seleção rápida: ${usedTables.join(', ')}.
        Para adicionar mais itens em uma delas, digite o numero manualmente.
      </p>
    ` : `
      <p class="table-picker-note">Se precisar usar uma comanda fora da lista, digite manualmente.</p>
    `}
  `;
}

function selectTableSuggestion(table) {
  const input = document.getElementById('table');
  if (!input) return;
  input.value = table;
  input.focus();
}

function render() {
  document.getElementById('content').innerHTML = `
    <div class="grid g2">
      <section class="panel waiter-menu-panel">
        <div class="waiter-menu-head">
          <div>
            <h3>${txt('garcom.cardapioTitulo', 'Cardápio')}</h3>
            <p class="muted">${txt('garcom.cardapioDescricao', 'Escolha uma categoria para encontrar os itens com mais rapidez.')}</p>
          </div>
        </div>

        <div id="categoryMenu" class="category-menu"></div>
        <div id="menuGrid" class="menu-grid"></div>
      </section>

      <section class="panel waiter-order-panel">
        <h3>${txt('garcom.comandaTitulo', 'Comanda')}</h3>

        <form id="orderForm">
          <div class="form-row">
            <label>${txt('garcom.mesa', 'Mesa/Comanda')}
              <input id="table" required list="availableTablesList" placeholder="Escolha uma mesa livre ou digite manualmente">
              <datalist id="availableTablesList"></datalist>
            </label>

            <label>${txt('garcom.garcom', 'Garçom')}
              <input id="waiter" required placeholder="${txt('garcom.garcomPlaceholder', 'Digite o nome')}">
            </label>
          </div>

          <div id="tableSuggestions" class="table-picker"></div>

          <label>${txt('garcom.observacoes', 'Observações')}
            <textarea id="notes" placeholder="${txt('garcom.observacoesPlaceholder', 'Ex: sem cebola, ponto da carne...')}"></textarea>
          </label>

          <div id="cart"></div>

          <button class="primary" type="submit">${txt('garcom.enviar', 'Enviar para cozinha')}</button>
        </form>
      </section>
    </div>
  `;

  document.getElementById('orderForm').onsubmit = send;
  renderTableSuggestions();
  renderMenu();
  renderCart();
}

function renderMenu() {
  const categoryMenu = document.getElementById('categoryMenu');
  const menuGrid = document.getElementById('menuGrid');

  if (!categoryMenu || !menuGrid) return;

  const categories = getCategories();
  const filteredProducts = getFilteredProducts();

  categoryMenu.innerHTML = categories
    .map((category) => `
      <button
        type="button"
        class="category-pill ${category === selectedCategory ? 'active' : ''}"
        onclick="selectCategory('${category.replace(/'/g, "\\'")}')"
      >
        ${category}
      </button>
    `)
    .join('');

  menuGrid.innerHTML = filteredProducts.length
    ? filteredProducts.map((product) => `
      <div class="item menu-product-card">
        <div>
          <b>${product.name}</b>
          <small class="muted">${product.category || txt('garcom.geral', 'Geral')}</small>
        </div>

        ${product.description ? `<p>${product.description}</p>` : `<p class="muted">${txt('garcom.semDescricao', 'Sem descrição cadastrada.')}</p>`}

        <div class="cart-line">
          <span class="price">${money(product.price)}</span>
          <button class="soft" type="button" onclick="add('${productId(product.id)}')">${txt('garcom.adicionar', 'Adicionar')}</button>
        </div>
      </div>
    `).join('')
    : `
      <div class="panel empty-menu-category">
        <h3>${txt('garcom.vazioTitulo', 'Nenhum item nesta categoria')}</h3>
        <p class="muted">${txt('garcom.vazioDescricao', 'Cadastre produtos no Admin ou escolha outra categoria.')}</p>
      </div>
    `;
}

function renderCart() {
  const element = document.getElementById('cart');
  if (!element) return;

  const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  element.innerHTML = `
    <h3>${txt('garcom.itens', 'Itens')}</h3>

    ${cart.length ? cart.map((item) => `
      <div class="cart-line">
        <div>
          <b>${item.name}</b>
          <small class="muted">${money(item.price)} ${txt('garcom.cada', 'cada')}</small>
        </div>

        <div class="qty">
          <button type="button" onclick="dec('${productId(item.id)}')">-</button>
          <b>${item.qty}</b>
          <button type="button" onclick="add('${productId(item.id)}')">+</button>
        </div>
      </div>
    `).join('') : `<p class="muted">${txt('garcom.nenhumItem', 'Nenhum item adicionado.')}</p>`}

    <div class="metric" style="margin-top:12px">
      <b>${txt('garcom.total', 'Total')}</b>
      <b class="price">${money(total)}</b>
    </div>
  `;
}

async function send(event) {
  event.preventDefault();

  if (!cart.length) return toast(txt('garcom.erroSemItem', 'Adicione pelo menos um item.'));

  try {
    await API.post('/api/orders', {
      table: document.getElementById('table').value,
      waiter: document.getElementById('waiter').value,
      notes: document.getElementById('notes').value,
      items: cart.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
      })),
    });

    toast(txt('garcom.pedidoEnviado', 'Pedido enviado para cozinha.'));
    cart = [];
    document.getElementById('orderForm').reset();
    await refreshOpenOrders();
    renderTableSuggestions();
    renderCart();
  } catch (err) {
    toast(err.message);
  }
}

window.selectTableSuggestion = selectTableSuggestion;

init();
setInterval(syncTableSuggestions, 15000);
