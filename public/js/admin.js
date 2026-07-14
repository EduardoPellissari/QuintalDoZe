/* ==================================================
   PAINEL ADMINISTRATIVO
   Textos editáveis em: public/js/textos.js
   ================================================== */

requireRole(['admin']);

setupNav([
  { type: 'group', label: 'Configuração' },
  { type: 'button', tab: 'users', labelKey: 'menu.usuarios', active: true },
  { type: 'button', tab: 'products', labelKey: 'menu.produtos' },
  { type: 'button', tab: 'quotes', label: '📋 Orçamentos' },
  { type: 'group', label: 'Operação' },
  { type: 'button', tab: 'cash', labelKey: 'menu.caixa' },
  { type: 'button', tab: 'reports', labelKey: 'menu.relatorios' },
  { type: 'group', label: 'Atalhos' },
  { type: 'button', tab: 'orders', labelKey: 'menu.pedidos' },
  { type: 'button', tab: 'kitchen', labelKey: 'menu.cozinha' },
]);

setText('areaSmall', txt('admin.area', 'Administração'));
setText('pageTitle', txt('admin.dashboardTitulo', 'Admin Dashboard'));
setText('pageSub', txt('admin.dashboardSubtitulo', 'Gerencie usuários, produtos, caixa e relatórios em um só painel.'));

let editingUser = null;
let editingProduct = null;
let editingQuote = null;
let pendingUserAccess = null;
let quoteProducts = [];
let quoteItems = [{ productId: null, description: '', qty: 1, unitPrice: 0 }];
let adminReportStartDate = todayDateValue();
let adminReportEndDate = todayDateValue();
let selectedAdminCashTable = '';
let activeAdminTab = 'users';
let adminCashLastSignature = '';
let adminCashAutoRefreshing = false;
let adminCashKnownOrderIds = new Set();
let adminCashFilter = 'all';

const quoteTypes = ['Café da tarde', 'Happy hour', 'Coffee break', 'Almoço/Jantar', 'Evento personalizado'];
const quoteStatuses = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const productUsageOptions = [
  { value: 'orders', label: 'Pedidos / Atendente' },
  { value: 'quotes', label: 'Orçamentos' },
];

const embeddedAdminPages = {
  orders: {
    title: 'Pedidos',
    subtitle: 'Crie comandas e envie pedidos para a cozinha.',
    src: '/garcom.html?embed=1',
  },
  kitchen: {
    title: 'Cozinha',
    subtitle: 'Acompanhe a fila da cozinha dentro do painel admin.',
    src: '/cozinha.html?embed=1',
  },
};

const content = document.getElementById('content');
let embeddedPreloadStarted = false;

document.getElementById('sideNav').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;

  stashEmbeddedAdminFrames();

  document.querySelectorAll('nav button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  activeAdminTab = button.dataset.tab || 'users';

  editingUser = null;
  editingProduct = null;
  editingQuote = null;
  quoteItems = [{ productId: null, description: '', qty: 1, unitPrice: 0 }];

  if (button.dataset.tab === 'users') renderUsers();
  if (button.dataset.tab === 'products') renderProducts();
  if (button.dataset.tab === 'quotes') renderQuotes();
  if (button.dataset.tab === 'cash') renderCash();
  if (button.dataset.tab === 'reports') renderReports();
  if (button.dataset.tab === 'orders') renderEmbeddedAdminPage('orders');
  if (button.dataset.tab === 'kitchen') renderEmbeddedAdminPage('kitchen');
});

function embeddedFrameCache() {
  let cache = document.getElementById('adminEmbeddedCache');
  if (!cache) {
    cache = document.createElement('div');
    cache.id = 'adminEmbeddedCache';
    cache.className = 'admin-embedded-cache';
    document.body.appendChild(cache);
  }
  return cache;
}

function ensureEmbeddedAdminFrame(key) {
  const page = embeddedAdminPages[key];
  const cache = embeddedFrameCache();
  let frame = document.getElementById(`adminEmbeddedFrame-${key}`);

  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = `adminEmbeddedFrame-${key}`;
    frame.className = 'admin-embedded-frame';
    frame.title = page.title;
    frame.loading = 'eager';
    frame.src = page.src;
    frame.dataset.loaded = 'false';
    frame.addEventListener('load', () => {
      frame.dataset.loaded = 'true';
      frame.closest('.admin-embedded-shell')?.classList.add('loaded');
    });
    cache.appendChild(frame);
  }

  return frame;
}

function stashEmbeddedAdminFrames() {
  const cache = embeddedFrameCache();
  content.querySelectorAll('.admin-embedded-frame').forEach((frame) => cache.appendChild(frame));
}

function preloadEmbeddedAdminPages() {
  if (embeddedPreloadStarted) return;
  embeddedPreloadStarted = true;

  const preload = () => {
    ensureEmbeddedAdminFrame('orders');
    ensureEmbeddedAdminFrame('kitchen');
  };

  if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 1800 });
  else setTimeout(preload, 700);
}

function renderEmbeddedAdminPage(key) {
  const page = embeddedAdminPages[key];
  if (!page) return;

  setText('pageTitle', page.title);
  setText('pageSub', page.subtitle);

  stashEmbeddedAdminFrames();
  const frame = ensureEmbeddedAdminFrame(key);

  content.innerHTML = `
    <section class="admin-embedded-shell ${frame.dataset.loaded === 'true' ? 'loaded' : ''}" id="adminEmbeddedShell">
      <div class="admin-embedded-loading">
        <b>Carregando ${htmlAttr(page.title)}...</b>
        <span>Essa tela ficará rápida depois do primeiro carregamento.</span>
      </div>
    </section>
  `;

  document.getElementById('adminEmbeddedShell').appendChild(frame);
}

function updateAdminNavCounters(snapshot = null) {
  const applyCounters = (orders) => {
    const openOrders = orders.filter((order) => !order.paid && order.status !== 'cancelado');
    const eventOrders = openOrders.filter(isEventOrder);
    const restaurantOrders = openOrders.filter((order) => !isEventOrder(order));
    const kitchenOrders = restaurantOrders.filter((order) => ['pendente', 'preparando'].includes(order.status));

    setNavBadge('orders', restaurantOrders.length, restaurantOrders.length ? 'warn' : '');
    setNavBadge('kitchen', kitchenOrders.length, kitchenOrders.length ? 'blue' : '');
    setNavBadge('cash', openOrders.length, openOrders.length ? 'warn' : '');
  };

  if (snapshot?.openOrders) {
    applyCounters(snapshot.openOrders);
    return Promise.resolve();
  }

  return API.get('/api/orders')
    .then(applyCounters)
    .catch((err) => console.warn('Nao foi possivel atualizar contadores do admin.', err));
}

async function renderUsers() {
  setText('pageTitle', txt('admin.usuarios.titulo', 'Admin Dashboard'));
  setText('pageSub', txt('admin.usuarios.subtitulo', 'Gerencie usuários e acessos do sistema.'));

  const users = await API.get('/api/users');

  content.innerHTML = `
    <div class="admin-layout admin-users">
      <section class="panel admin-form-large">
        <div class="admin-form-head">
          <div>
            <h3>${editingUser ? txt('admin.usuarios.formEditar', 'Editar usuário') : txt('admin.usuarios.formNovo', 'Adicionar usuário')}</h3>
            <p>${txt('admin.usuarios.formDescricao', 'Cadastre, edite e organize os acessos do sistema por função.')}</p>
          </div>
          <span class="badge ok">${txt('admin.usuarios.badge', 'Área administrativa')}</span>
        </div>

        <form id="userForm" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
          <div class="autofill-decoy" aria-hidden="true">
            <input type="text" name="username" autocomplete="username" tabindex="-1">
            <input type="password" name="password" autocomplete="current-password" tabindex="-1">
          </div>

          <div class="admin-form-grid">
            <label>${txt('admin.usuarios.nome', 'Nome')}
              <input id="uName" name="newUserName" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="${txt('admin.usuarios.placeholderNome', 'Ex: João')}" value="${editingUser?.name || ''}">
            </label>

            <label>${txt('admin.usuarios.email', 'E-mail')}
              <input id="uEmail" name="newUserEmail" type="email" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="${txt('admin.usuarios.placeholderEmail', 'email@quintaldoze.local')}" value="${editingUser?.email || ''}">
            </label>

            <label>${txt('admin.usuarios.senha', 'Senha')}
              <div class="password-action-row">
                <input id="uPass" name="newUserPassword" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" placeholder="${editingUser ? txt('admin.usuarios.placeholderSenhaEditar', 'Deixe em branco para manter') : txt('admin.usuarios.placeholderSenhaNova', 'Digite uma senha')}">
                <button id="toggleUserPassword" class="soft password-toggle-button" type="button">Mostrar</button>
                <button id="generateUserPassword" class="soft password-generate-button" type="button">Gerar</button>
              </div>
            </label>

            <label>${txt('admin.usuarios.perfil', 'Perfil')}
              <select id="uRole">
                <option value="admin">${txt('funcoes.admin', 'Administrador')}</option>
                <option value="garcom">${txt('funcoes.garcom', 'Garçom')}</option>
                <option value="cozinha">${txt('funcoes.cozinha', 'Cozinha')}</option>
                <option value="caixa">${txt('funcoes.caixa', 'Caixa')}</option>
              </select>
            </label>
          </div>

          <div class="form-actions-row">
            <button class="primary" type="submit">${editingUser ? txt('admin.usuarios.botaoSalvar', 'Salvar alterações') : txt('admin.usuarios.botaoAdicionar', 'Adicionar usuário')}</button>
            ${editingUser ? `<button class="soft" type="button" id="cancelUser">${txt('admin.usuarios.botaoCancelarEdicao', 'Cancelar edição')}</button>` : ''}
          </div>
        </form>
      </section>

      ${pendingUserAccess ? `
        <section class="panel access-copy-panel">
          <div class="admin-form-head">
            <div>
              <h3>${pendingUserAccess.copied ? 'Acesso copiado' : 'Acesso gerado'}</h3>
              <p>${pendingUserAccess.copied ? 'O acesso foi copiado automaticamente. Você também pode copiar novamente abaixo.' : 'Não foi possível copiar automaticamente. Copie abaixo antes de fechar.'}</p>
            </div>
            <span class="badge ${pendingUserAccess.copied ? 'ok' : 'warn'}">${pendingUserAccess.copied ? 'Copiado' : 'Copiar manualmente'}</span>
          </div>
          <textarea id="pendingUserAccessText" readonly>${htmlAttr(pendingUserAccess.text)}</textarea>
          <div class="form-actions-row">
            <button class="primary" type="button" onclick="copyPendingUserAccess()">Copiar acesso</button>
            <button class="soft" type="button" onclick="clearPendingUserAccess()">Ocultar</button>
          </div>
        </section>
      ` : ''}

      <section class="panel admin-list-box">
        <div class="admin-form-head">
          <div>
            <h3>${txt('admin.usuarios.listaTitulo', 'Usuários cadastrados')}</h3>
            <p>${txt('admin.usuarios.listaDescricao', 'Lista de usuários já salvos no sistema.')}</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>${txt('admin.usuarios.colNome', 'Nome')}</th>
                <th>${txt('admin.usuarios.colEmail', 'E-mail')}</th>
                <th>${txt('admin.usuarios.colPerfil', 'Perfil')}</th>
                <th>Status</th>
                <th>${txt('admin.usuarios.colAcoes', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              ${users.map((user) => `
                <tr class="${user.active === false ? 'inactive-row' : ''}">
                  <td>${user.name || '-'}</td>
                  <td>${user.email}</td>
                  <td><span class="badge">${roleLabel(user.role)}</span></td>
                  <td>${user.active === false ? '<span class="badge danger">Inativo</span>' : '<span class="badge ok">Ativo</span>'}</td>
                  <td>
                    <div class="actions">
                      <button class="soft" onclick="editUser(${user.id})">${txt('admin.usuarios.botaoSalvar', 'Editar').replace('Salvar alterações', 'Editar')}</button>
                      <button class="${user.active === false ? 'soft' : 'danger'}" onclick="toggleUserActive(${user.id}, ${user.active === false ? 'true' : 'false'})">${user.active === false ? 'Reativar' : 'Desativar'}</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  if (editingUser) document.getElementById('uRole').value = editingUser.role;
  preventNewUserAutofill();
  bindUserPasswordTools();

  const cancel = document.getElementById('cancelUser');
  if (cancel) {
    cancel.onclick = () => {
      editingUser = null;
      renderUsers();
    };
  }

  document.getElementById('userForm').onsubmit = saveUser;
}

function preventNewUserAutofill() {
  if (editingUser) return;

  let userInteracted = false;
  const fields = ['uName', 'uEmail', 'uPass']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  fields.forEach((field) => {
    field.addEventListener('focus', () => { userInteracted = true; }, { once: true });
    field.addEventListener('keydown', () => { userInteracted = true; }, { once: true });
    field.addEventListener('pointerdown', () => { userInteracted = true; }, { once: true });
  });

  const clearAutofill = () => {
    if (userInteracted || editingUser) return;
    fields.forEach((field) => { field.value = ''; });
  };

  requestAnimationFrame(clearAutofill);
  setTimeout(clearAutofill, 120);
  setTimeout(clearAutofill, 500);
}

function bindUserPasswordTools() {
  document.getElementById('toggleUserPassword')?.addEventListener('click', toggleUserPasswordVisibility);
  document.getElementById('generateUserPassword')?.addEventListener('click', generateUserPassword);
}

function toggleUserPasswordVisibility() {
  const input = document.getElementById('uPass');
  const button = document.getElementById('toggleUserPassword');
  if (!input || !button) return;

  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.textContent = visible ? 'Mostrar' : 'Ocultar';
}

function randomPassword(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = 'QZ-';

  for (let index = 0; index < length; index++) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return password;
}

function generateUserPassword() {
  const input = document.getElementById('uPass');
  const toggleButton = document.getElementById('toggleUserPassword');
  if (!input) return;

  input.value = randomPassword();
  input.type = 'text';
  if (toggleButton) toggleButton.textContent = 'Ocultar';
  input.focus();
  input.select();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  return copied;
}

function userAccessText(email, password, role) {
  return [
    'Acesso Quintal do Zé',
    `E-mail: ${email}`,
    `Senha: ${password}`,
    `Perfil: ${roleLabel(role)}`,
  ].join('\n');
}

async function copyUserAccess(email, password, role) {
  try {
    return await copyText(userAccessText(email, password, role));
  } catch (err) {
    console.warn('Nao foi possivel copiar o acesso automaticamente.', err);
    return false;
  }
}

async function saveUser(event) {
  event.preventDefault();

  const password = document.getElementById('uPass').value;
  const body = {
    name: document.getElementById('uName').value,
    email: document.getElementById('uEmail').value,
    password,
    role: document.getElementById('uRole').value,
  };

  try {
    if (editingUser) await API.put('/api/users/' + editingUser.id, body);
    else await API.post('/api/users', body);

    const copiedAccess = password ? await copyUserAccess(body.email, password, body.role) : false;
    pendingUserAccess = password ? {
      text: userAccessText(body.email, password, body.role),
      copied: copiedAccess,
    } : null;

    editingUser = null;
    toast(password
      ? copiedAccess ? 'Usuário salvo. Acesso copiado.' : 'Usuário salvo. Copie o acesso antes de sair da tela.'
      : txt('admin.usuarios.salvo', 'Usuário salvo.'));
    renderUsers();
  } catch (err) {
    toast(err.message);
  }
}

window.editUser = async (id) => {
  const users = await API.get('/api/users');
  editingUser = users.find((user) => Number(user.id) === Number(id));
  renderUsers();
};

window.deleteUser = async (id) => {
  if (!confirm(txt('admin.usuarios.confirmarExcluir', 'Excluir este usuário?'))) return;
  await API.del('/api/users/' + id);
  toast(txt('admin.usuarios.excluido', 'Usuário excluído.'));
  renderUsers();
};

window.toggleUserActive = async (id, active) => {
  const loggedUser = currentUser();
  if (!active && String(loggedUser?.id) === String(id)) return toast('Você não pode desativar o próprio acesso.');
  if (!active && !confirm('Desativar este funcionário? Ele não conseguirá acessar o sistema até ser reativado.')) return;
  await API.put('/api/users/' + id + '/status', { active });
  toast(active ? 'Funcionário reativado.' : 'Funcionário desativado.');
  renderUsers();
};

window.copyPendingUserAccess = async () => {
  const text = document.getElementById('pendingUserAccessText')?.value || pendingUserAccess?.text || '';
  if (!text) return;
  const copied = await copyText(text).catch(() => false);
  toast(copied ? 'Acesso copiado.' : 'Não foi possível copiar automaticamente.');
};

window.clearPendingUserAccess = () => {
  pendingUserAccess = null;
  renderUsers();
};

function productUsageValue(product) {
  return product?.usage === 'quotes' ? 'quotes' : 'orders';
}

function productUsageLabel(product) {
  const match = productUsageOptions.find((option) => option.value === productUsageValue(product));
  return match ? match.label : productUsageOptions[0].label;
}

function productStatusValue(product) {
  if (product?.active === false) return 'inactive';
  if (product?.soldOut === true) return 'soldOut';
  return 'active';
}

function productStatusLabel(product) {
  const value = productStatusValue(product);
  if (value === 'inactive') return 'Inativo';
  if (value === 'soldOut') return 'Esgotado';
  return 'Disponível';
}

function productStatusBadge(product) {
  const value = productStatusValue(product);
  if (value === 'inactive') return 'warn';
  if (value === 'soldOut') return 'danger';
  return 'ok';
}

function productAvailabilityPanel(products) {
  const orderProducts = products.filter((product) => productUsageValue(product) === 'orders' && product.active !== false);
  const available = orderProducts.filter((product) => product.soldOut !== true);
  const soldOut = orderProducts.filter((product) => product.soldOut === true);

  if (!orderProducts.length) return '';

  return `
    <section class="panel product-availability-panel">
      <div class="admin-form-head">
        <div>
          <h3>Disponibilidade rápida</h3>
          <p>Marque itens como esgotados para eles sumirem da tela de pedidos do atendente.</p>
        </div>
        <span class="badge ${soldOut.length ? 'warn' : 'ok'}">${soldOut.length} esgotado(s)</span>
      </div>

      <div class="availability-columns">
        <div>
          <h4>Disponíveis</h4>
          <div class="availability-list">
            ${available.length ? available.map((product) => `
              <button class="availability-chip" type="button" onclick="toggleSoldOut(${product.id}, true)">
                <span>${htmlAttr(product.name)}</span>
                <b>Esgotar</b>
              </button>
            `).join('') : '<p class="muted">Nenhum produto disponível para pedidos.</p>'}
          </div>
        </div>

        <div>
          <h4>Esgotados</h4>
          <div class="availability-list">
            ${soldOut.length ? soldOut.map((product) => `
              <button class="availability-chip sold-out" type="button" onclick="toggleSoldOut(${product.id}, false)">
                <span>${htmlAttr(product.name)}</span>
                <b>Disponibilizar</b>
              </button>
            `).join('') : '<p class="muted">Nenhum item esgotado agora.</p>'}
          </div>
        </div>
      </div>
    </section>
  `;
}

async function renderProducts() {
  setText('pageTitle', txt('admin.produtos.titulo', 'Produtos'));
  setText('pageSub', 'Separe os produtos do atendente e os itens usados somente nos orçamentos.');

  const products = await API.get('/api/products');
  const orderProducts = products.filter((product) => productUsageValue(product) === 'orders');
  const quoteOnlyProducts = products.filter((product) => productUsageValue(product) === 'quotes');
  const activeProducts = products.filter((product) => product.active !== false).length;
  const soldOutProducts = products.filter((product) => product.soldOut === true).length;

  content.innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${products.length}</b><span>${txt('admin.produtos.cardProdutos', 'Produtos')}</span></div>
      <div class="dash-card"><b>${orderProducts.length}</b><span>Pedidos / atendente</span></div>
      <div class="dash-card"><b>${quoteOnlyProducts.length}</b><span>Orçamentos</span></div>
      <div class="dash-card"><b>${soldOutProducts}</b><span>Esgotados</span></div>
    </section>

    ${productAvailabilityPanel(products)}

    <div class="admin-layout admin-products">
      <section class="panel admin-form-large">
        <div class="admin-form-head">
          <div>
            <h3>${editingProduct ? txt('admin.produtos.formEditar', 'Editar produto') : txt('admin.produtos.formNovo', 'Adicionar produto')}</h3>
            <p>Escolha se o item aparece nos pedidos do atendente ou somente nos orçamentos.</p>
          </div>
          <span class="badge ok">${productUsageLabel(editingProduct)}</span>
        </div>

        <form id="productForm">
          <div class="admin-form-grid">
            <label>${txt('admin.produtos.nome', 'Nome do produto')}
              <input id="pName" placeholder="${txt('admin.produtos.placeholderNome', 'Ex: Picanha na chapa')}" value="${editingProduct?.name || ''}">
            </label>

            <label>${txt('admin.produtos.categoria', 'Categoria')}
              <input id="pCat" placeholder="${txt('admin.produtos.placeholderCategoria', 'Ex: Pratos, Bebidas, Porções')}" value="${editingProduct?.category || ''}">
            </label>

            <label>${txt('admin.produtos.preco', 'Preço')}
              <input id="pPrice" type="number" step="0.01" placeholder="${txt('admin.produtos.placeholderPreco', 'Ex: 89.90')}" value="${editingProduct?.price || ''}">
            </label>

            <label>${txt('admin.produtos.status', 'Status')}
              <select id="pStatus">
                <option value="active">Disponível</option>
                <option value="soldOut">Esgotado</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>

            <label>Lista de uso
              <select id="pUsage">
                ${productUsageOptions.map((option) => `
                  <option value="${option.value}" ${productUsageValue(editingProduct) === option.value ? 'selected' : ''}>${option.label}</option>
                `).join('')}
              </select>
            </label>

            <label class="full">${txt('admin.produtos.descricao', 'Descrição')}
              <textarea id="pDesc" placeholder="${txt('admin.produtos.placeholderDescricao', 'Descreva o produto...')}">${editingProduct?.description || ''}</textarea>
            </label>
          </div>

          <div class="form-actions-row">
            <button class="primary" type="submit">${editingProduct ? txt('admin.produtos.botaoSalvar', 'Salvar alterações') : txt('admin.produtos.botaoAdicionar', 'Adicionar produto')}</button>
            ${editingProduct ? `<button class="soft" type="button" id="cancelProduct">${txt('admin.produtos.botaoCancelarEdicao', 'Cancelar edição')}</button>` : ''}
          </div>
        </form>
      </section>

      <section class="panel admin-list-box">
        <div class="admin-form-head">
          <div>
            <h3>${txt('admin.produtos.listaTitulo', 'Produtos cadastrados')}</h3>
            <p>${txt('admin.produtos.listaDescricao', 'Lista de itens já salvos no cardápio.')}</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>${txt('admin.produtos.colProduto', 'Produto')}</th>
                <th>${txt('admin.produtos.colCategoria', 'Categoria')}</th>
                <th>${txt('admin.produtos.colPreco', 'Preço')}</th>
                <th>Lista</th>
                <th>${txt('admin.produtos.colStatus', 'Status')}</th>
                <th>${txt('admin.produtos.colAcoes', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              ${products.map((product) => `
                <tr>
                  <td>${product.name}</td>
                  <td>${product.category || '-'}</td>
                  <td>${money(product.price)}</td>
                  <td><span class="badge ${productUsageValue(product) === 'quotes' ? 'warn' : 'ok'}">${productUsageLabel(product)}</span></td>
                  <td><span class="badge ${productStatusBadge(product)}">${productStatusLabel(product)}</span></td>
                  <td>
                    <div class="actions">
                      <button class="soft" onclick="editProduct(${product.id})">Editar</button>
                      ${productUsageValue(product) === 'orders' ? `<button class="${product.soldOut === true ? 'soft' : 'danger'} quick-soldout-button" onclick="toggleSoldOut(${product.id}, ${product.soldOut === true ? 'false' : 'true'})">${product.soldOut === true ? 'Disponibilizar' : 'Esgotar'}</button>` : ''}
                      <button class="danger" onclick="deleteProduct(${product.id})">Excluir</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  if (editingProduct) {
    document.getElementById('pStatus').value = productStatusValue(editingProduct);
    document.getElementById('pUsage').value = productUsageValue(editingProduct);
  }

  const cancel = document.getElementById('cancelProduct');
  if (cancel) {
    cancel.onclick = () => {
      editingProduct = null;
      renderProducts();
    };
  }

  document.getElementById('productForm').onsubmit = saveProduct;
}

async function saveProduct(event) {
  event.preventDefault();

  const status = document.getElementById('pStatus').value;
  const body = {
    name: document.getElementById('pName').value,
    category: document.getElementById('pCat').value,
    price: Number(document.getElementById('pPrice').value),
    description: document.getElementById('pDesc').value,
    active: status !== 'inactive',
    soldOut: status === 'soldOut',
    usage: document.getElementById('pUsage').value,
  };

  try {
    if (editingProduct) await API.put('/api/products/' + editingProduct.id, body);
    else await API.post('/api/products', body);

    editingProduct = null;
    toast(txt('admin.produtos.salvo', 'Produto salvo.'));
    renderProducts();
  } catch (err) {
    toast(err.message);
  }
}

window.editProduct = async (id) => {
  const products = await API.get('/api/products');
  editingProduct = products.find((product) => Number(product.id) === Number(id));
  renderProducts();
};

window.deleteProduct = async (id) => {
  if (!confirm(txt('admin.produtos.confirmarExcluir', 'Excluir este produto?'))) return;
  await API.del('/api/products/' + id);
  toast(txt('admin.produtos.excluido', 'Produto excluído.'));
  renderProducts();
};

window.toggleSoldOut = async (id, soldOut) => {
  await API.put('/api/products/' + id + '/sold-out', { soldOut });
  toast(soldOut ? 'Produto marcado como esgotado.' : 'Produto disponível novamente.');
  renderProducts();
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function quoteTotal(items = quoteItems) {
  return items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
}

function quoteStatusLabel(status) {
  const match = quoteStatuses.find((item) => item.value === status);
  return match ? match.label : status || 'Rascunho';
}

function quoteDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function quoteProductLabel(product) {
  const pieces = [
    product.name,
    product.category ? `(${product.category})` : '',
    money(product.price || 0),
  ].filter(Boolean);
  return pieces.join(' ');
}

function quoteItemDescriptionFromProduct(product) {
  return product.description ? `${product.name} - ${product.description}` : product.name;
}

function renderQuoteItemRows() {
  return quoteItems.map((item, index) => `
    <div class="quote-item-row">
      <label>Produto salvo
        <select class="quote-item-input quote-product-select" data-index="${index}" data-field="productId">
          <option value="">Selecionar produto...</option>
          ${quoteProducts.map((product) => `
            <option value="${product.id}" ${Number(item.productId || 0) === Number(product.id) ? 'selected' : ''}>
              ${escapeHtml(quoteProductLabel(product))}
            </option>
          `).join('')}
        </select>
      </label>

      <label>Item
        <input class="quote-item-input" data-index="${index}" data-field="description" placeholder="Ex: Mini sanduíches, bolo, salgados..." value="${escapeHtml(item.description)}">
      </label>

      <label>Qtd.
        <input class="quote-item-input" data-index="${index}" data-field="qty" type="number" min="1" step="1" value="${Number(item.qty || 1)}">
      </label>

      <label>Valor unitário
        <input class="quote-item-input" data-index="${index}" data-field="unitPrice" type="number" min="0" step="0.01" value="${Number(item.unitPrice || 0)}">
      </label>

      <div class="quote-item-total">
        <span data-row-total="${index}">${money(Number(item.qty || 0) * Number(item.unitPrice || 0))}</span>
        <button class="danger" type="button" onclick="removeQuoteItem(${index})">Remover</button>
      </div>
    </div>
  `).join('');
}

function updateQuoteTotal() {
  const element = document.getElementById('quoteTotal');
  if (element) element.textContent = money(quoteTotal());
}

function renderQuoteItemsOnly() {
  const element = document.getElementById('quoteItems');
  if (!element) return;
  element.innerHTML = renderQuoteItemRows();
  bindQuoteItemEvents();
  updateQuoteTotal();
}

function bindQuoteItemEvents() {
  document.querySelectorAll('.quote-item-input').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';

    input.addEventListener(eventName, (event) => {
      const index = Number(event.target.dataset.index);
      const field = event.target.dataset.field;
      if (!quoteItems[index]) return;

      if (field === 'productId') {
        const product = quoteProducts.find((item) => Number(item.id) === Number(event.target.value));
        quoteItems[index].productId = product ? product.id : null;

        if (product) {
          quoteItems[index].description = quoteItemDescriptionFromProduct(product);
          quoteItems[index].unitPrice = Number(product.price || 0);

          const descriptionInput = document.querySelector(`[data-index="${index}"][data-field="description"]`);
          const priceInput = document.querySelector(`[data-index="${index}"][data-field="unitPrice"]`);
          if (descriptionInput) descriptionInput.value = quoteItems[index].description;
          if (priceInput) priceInput.value = quoteItems[index].unitPrice;
        }
      } else {
        quoteItems[index][field] = ['qty', 'unitPrice'].includes(field)
          ? Number(event.target.value || 0)
          : event.target.value;
      }

      const rowTotal = document.querySelector(`[data-row-total="${index}"]`);
      if (rowTotal) {
        rowTotal.textContent = money(Number(quoteItems[index].qty || 0) * Number(quoteItems[index].unitPrice || 0));
      }
      updateQuoteTotal();
    });
  });
}

window.addQuoteItem = () => {
  quoteItems.push({ productId: null, description: '', qty: 1, unitPrice: 0 });
  renderQuoteItemsOnly();
};

window.removeQuoteItem = (index) => {
  quoteItems.splice(index, 1);
  if (!quoteItems.length) quoteItems = [{ productId: null, description: '', qty: 1, unitPrice: 0 }];
  renderQuoteItemsOnly();
};

async function renderQuotes() {
  setText('pageTitle', 'Orçamentos');
  setText('pageSub', 'Monte propostas para café da tarde, happy hour, coffee break e eventos.');

  const [quotes, products] = await Promise.all([
    API.get('/api/quotes'),
    API.get('/api/products?usage=quotes'),
  ]);
  quoteProducts = products
    .filter((product) => product.active !== false && product.soldOut !== true)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const sortedQuotes = [...quotes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const activeQuotes = quotes.filter((quote) => !['aprovado', 'cancelado'].includes(quote.status)).length;
  const approvedTotal = quotes
    .filter((quote) => quote.status === 'aprovado')
    .reduce((sum, quote) => sum + Number(quote.total || 0), 0);

  content.innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${quotes.length}</b><span>Orçamentos salvos</span></div>
      <div class="dash-card"><b>${activeQuotes}</b><span>Em andamento</span></div>
      <div class="dash-card"><b>${money(approvedTotal)}</b><span>Total aprovado</span></div>
    </section>

    <div class="admin-layout admin-quotes">
      <section class="panel admin-form-large">
        <div class="admin-form-head">
          <div>
            <h3>${editingQuote ? 'Editar orçamento' : 'Novo orçamento'}</h3>
            <p>Cadastre dados do evento, itens e valores para gerar uma proposta.</p>
          </div>
          <span class="badge ok">Eventos</span>
        </div>

        <form id="quoteForm">
          <div class="admin-form-grid">
            <label>Cliente
              <input id="qClientName" required placeholder="Nome do cliente" value="${escapeHtml(editingQuote?.clientName || '')}">
            </label>

            <label>WhatsApp / telefone
              <input id="qPhone" placeholder="(00) 00000-0000" value="${escapeHtml(editingQuote?.phone || '')}">
            </label>

            <label>Tipo de evento
              <select id="qEventType">
                ${quoteTypes.map((type) => `<option value="${escapeHtml(type)}" ${editingQuote?.eventType === type ? 'selected' : ''}>${type}</option>`).join('')}
              </select>
            </label>

            <label>Status
              <select id="qStatus">
                ${quoteStatuses.map((status) => `<option value="${status.value}" ${editingQuote?.status === status.value ? 'selected' : ''}>${status.label}</option>`).join('')}
              </select>
            </label>

            <label>Data
              <input id="qEventDate" type="date" value="${escapeHtml(editingQuote?.eventDate || '')}">
            </label>

            <label>Horário
              <input id="qEventTime" type="time" value="${escapeHtml(editingQuote?.eventTime || '')}">
            </label>

            <label>Pessoas
              <input id="qGuests" type="number" min="0" step="1" placeholder="Ex: 30" value="${Number(editingQuote?.guests || 0) || ''}">
            </label>

            <label>Local
              <input id="qLocation" placeholder="Onde será o evento" value="${escapeHtml(editingQuote?.location || '')}">
            </label>

            <label class="full">Observações
              <textarea id="qNotes" placeholder="Ex: incluir descartáveis, entrega, montagem, restrições alimentares...">${escapeHtml(editingQuote?.notes || '')}</textarea>
            </label>
          </div>

          <div class="quote-editor">
            <div class="quote-editor-head">
              <div>
                <h3>Itens do orçamento</h3>
                <p class="muted">Selecione produtos já cadastrados ou preencha itens personalizados.</p>
              </div>
              <button class="soft" type="button" onclick="addQuoteItem()">Adicionar item</button>
            </div>

            <div id="quoteItems" class="quote-items"></div>

            <div class="quote-total-box">
              <span>Total do orçamento</span>
              <b id="quoteTotal">${money(quoteTotal())}</b>
            </div>
          </div>

          <div class="form-actions-row">
            <button class="primary" type="submit">${editingQuote ? 'Salvar orçamento' : 'Criar orçamento'}</button>
            ${editingQuote ? '<button class="soft" type="button" id="cancelQuote">Cancelar edição</button>' : ''}
          </div>
        </form>
      </section>

      <section class="panel admin-list-box">
        <div class="admin-form-head">
          <div>
            <h3>Orçamentos salvos</h3>
            <p>Histórico das propostas para eventos.</p>
          </div>
        </div>

        <div class="quote-list">
          ${sortedQuotes.length ? sortedQuotes.map(quoteCard).join('') : '<p class="muted">Nenhum orçamento criado ainda.</p>'}
        </div>
      </section>
    </div>
  `;

  bindQuoteItemEvents();
  updateQuoteTotal();

  const cancel = document.getElementById('cancelQuote');
  if (cancel) {
    cancel.onclick = () => {
      editingQuote = null;
      quoteItems = [{ productId: null, description: '', qty: 1, unitPrice: 0 }];
      renderQuotes();
    };
  }

  document.getElementById('quoteForm').onsubmit = saveQuote;
}

function quoteCard(quote) {
  const details = [
    quote.eventType,
    quote.eventDate ? quoteDate(quote.eventDate) : '',
    quote.eventTime || '',
    quote.guests ? `${quote.guests} pessoas` : '',
  ].filter(Boolean).join(' • ');

  return `
    <article class="quote-card">
      <div class="quote-card-head">
        <div>
          <h3>${escapeHtml(quote.clientName)}</h3>
          <p class="muted">${escapeHtml(details || 'Evento sem data definida')}</p>
          ${quote.phone ? `<p class="muted">${escapeHtml(quote.phone)}</p>` : ''}
        </div>
        <span class="badge ${quote.status === 'aprovado' ? 'ok' : quote.status === 'cancelado' ? 'danger' : 'warn'}">${quoteStatusLabel(quote.status)}</span>
      </div>

      <div class="quote-card-items">
        ${(quote.items || []).map((item) => `
          <div class="cart-line">
            <span>${Number(item.qty || 0)}x ${escapeHtml(item.description)}</span>
            <b>${money(Number(item.qty || 0) * Number(item.unitPrice || 0))}</b>
          </div>
        `).join('')}
      </div>

      <div class="metric" style="margin-top:12px">
        <b>Total</b>
        <b class="price">${money(quote.total)}</b>
      </div>

      <div class="actions" style="margin-top:12px">
        <button class="soft" onclick="editQuote(${quote.id})">Editar</button>
        <button class="soft" onclick="printQuote(${quote.id})">PDF</button>
        <button class="soft whatsapp-action" onclick="sendQuoteWhatsapp(${quote.id})">WhatsApp</button>
        ${quote.convertedOrderId ? `<span class="badge ok">Pedido #${quote.convertedOrderId}</span>` : `<button class="primary compact-action" onclick="approveQuote(${quote.id})">Aprovar e enviar</button>`}
        <button class="danger" onclick="deleteQuote(${quote.id})">Excluir</button>
      </div>
    </article>
  `;
}

function whatsappPhoneUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

function quotePdfUrl(id, download = false) {
  return `/api/quotes/${id}/pdf${download ? '?download=1' : ''}`;
}

function quoteWhatsappMessage(quote) {
  const clientName = String(quote.clientName || '').trim() || 'tudo bem';
  return `Bom dia, ${clientName}! Segue seu orçamento do seu almoço.`;
}

function openQuotePdfTab(quote) {
  const opened = window.open(quotePdfUrl(quote.id), '_blank');
  if (!opened) toast('Permita pop-ups para abrir o PDF do orçamento.');
  return Boolean(opened);
}

window.sendQuoteWhatsapp = async (id) => {
  const quotes = await API.get('/api/quotes');
  const quote = quotes.find((item) => Number(item.id) === Number(id));
  if (!quote) return toast('Orçamento não encontrado.');

  const message = quoteWhatsappMessage(quote);
  const phoneUrl = whatsappPhoneUrl(quote.phone);

  const copied = await copyText(message).catch(() => false);

  if (!phoneUrl) {
    return toast(copied
      ? 'Mensagem copiada. Cadastre um telefone para abrir o WhatsApp direto.'
      : 'Cadastre o telefone do cliente para abrir o WhatsApp direto.');
  }

  window.open(`${phoneUrl}?text=${encodeURIComponent(message)}`, '_blank');
  toast(copied
    ? 'Mensagem aberta no WhatsApp. Anexe o PDF baixado na conversa.'
    : 'WhatsApp iniciado. Anexe o PDF baixado na conversa.');
};

async function saveQuote(event) {
  event.preventDefault();

  const body = {
    clientName: document.getElementById('qClientName').value,
    phone: document.getElementById('qPhone').value,
    eventType: document.getElementById('qEventType').value,
    eventDate: document.getElementById('qEventDate').value,
    eventTime: document.getElementById('qEventTime').value,
    guests: Number(document.getElementById('qGuests').value || 0),
    location: document.getElementById('qLocation').value,
    notes: document.getElementById('qNotes').value,
    status: document.getElementById('qStatus').value,
    items: quoteItems,
  };

  try {
    if (editingQuote) await API.put('/api/quotes/' + editingQuote.id, body);
    else await API.post('/api/quotes', body);

    editingQuote = null;
    quoteItems = [{ productId: null, description: '', qty: 1, unitPrice: 0 }];
    toast('Orçamento salvo.');
    renderQuotes();
  } catch (err) {
    toast(err.message);
  }
}

window.editQuote = async (id) => {
  const quotes = await API.get('/api/quotes');
  editingQuote = quotes.find((quote) => Number(quote.id) === Number(id));
  quoteItems = (editingQuote?.items?.length ? editingQuote.items : [{ productId: null, description: '', qty: 1, unitPrice: 0 }])
    .map((item) => ({
      productId: item.productId || null,
      description: item.description || '',
      qty: Number(item.qty || 1),
      unitPrice: Number(item.unitPrice || 0),
    }));
  renderQuotes();
};

window.deleteQuote = async (id) => {
  if (!confirm('Excluir este orçamento?')) return;
  await API.del('/api/quotes/' + id);
  toast('Orçamento excluído.');
  renderQuotes();
};

window.approveQuote = async (id) => {
  const table = prompt('Informe a mesa/comanda ou nome do evento:', `Evento ${id}`) || `Evento ${id}`;
  const waiter = prompt('Responsável pelo evento/pedido:', 'Orçamento') || 'Orçamento';
  await API.post('/api/quotes/' + id + '/approve', { table, waiter });
  toast('Orçamento aprovado e enviado como pedido/evento.');
  renderQuotes();
};

window.printQuote = async (id) => {
  const quotes = await API.get('/api/quotes');
  const quote = quotes.find((item) => Number(item.id) === Number(id));
  if (!quote) return toast('Orçamento não encontrado.');
  openQuotePdfTab(quote);
};

async function renderCash(snapshot = null) {
  setText('pageTitle', txt('admin.caixa.titulo', 'Caixa'));
  setText('pageSub', txt('admin.caixa.subtitulo', 'Fechamento de pedidos em aberto dentro do painel admin.'));

  const [orders, cashInfo] = snapshot
    ? [snapshot.orders, snapshot.cashInfo]
    : await Promise.all([
      API.get('/api/orders'),
      API.get('/api/cash-sessions/current'),
    ]);

  const openOrders = orders.filter((order) => !order.paid && order.status !== 'cancelado');
  adminCashLastSignature = cashOpenOrdersSignature(openOrders, cashInfo);
  adminCashKnownOrderIds = cashOrderIds(openOrders);
  const eventOrders = openOrders.filter(isEventOrder);
  const restaurantOrders = openOrders.filter((order) => !isEventOrder(order));
  const filteredRestaurantOrders = filterRestaurantOrdersForCash(restaurantOrders, adminCashFilter);
  const groups = groupOrdersByTable(filteredRestaurantOrders);
  if (!selectedAdminCashTable || !groups.some((group) => group.table === selectedAdminCashTable)) {
    selectedAdminCashTable = groups[0]?.table || '';
  }

  const readyOrders = openOrders.filter((order) => order.status === 'pronto').length;
  const filterCounts = cashFilterCounts(restaurantOrders, eventOrders);
  const allRestaurantGroups = groupOrdersByTable(restaurantOrders);
  const restaurantTotalOpen = allRestaurantGroups.reduce((sum, group) => sum + group.subtotal, 0);
  const eventTotalOpen = eventOrders.reduce((sum, order) => sum + orderSubtotal(order), 0);
  const totalOpen = restaurantTotalOpen + eventTotalOpen;
  const occupiedTables = allRestaurantGroups.length;
  const showEventsPanel = adminCashFilter === 'all' || adminCashFilter === 'events';
  const showRestaurantPanel = adminCashFilter !== 'events';
  const eventsPanel = showEventsPanel && (eventOrders.length || adminCashFilter === 'events') ? `
    <section class="panel operation-panel">
      <div class="admin-form-head">
        <div>
          <h3>Eventos vindos de orçamento</h3>
          <p>Feche eventos separadamente, sem mesa, taxa de serviço, divisão ou transferência.</p>
        </div>
        <span class="badge blue">${eventOrders.length} evento(s)</span>
      </div>

      ${eventCheckoutPanel(eventOrders, 'admin', 'closeAdminEvent', 'adminCancelOrder')}
    </section>
  ` : '';

  const restaurantPanel = showRestaurantPanel ? `
    <section class="panel operation-panel cash-fast-panel">
      <div class="admin-form-head compact-head">
        <div>
          <h3>${txt('admin.caixa.painelTitulo', 'Caixa')}</h3>
          <p>Escolha a mesa no mapa e finalize a conta na direita.</p>
        </div>
        <span class="badge ok">${txt('admin.caixa.badge', 'Acesso admin')}</span>
      </div>

      <div class="cash-workspace">
        <div class="cash-workspace-left">
          <div class="cash-block">
            <div class="section-mini-head">
              <h4>Mapa das mesas</h4>
              <span>${groups.length} exibida(s)</span>
            </div>
            ${tableMapPanel(filteredRestaurantOrders, selectedAdminCashTable, 'selectAdminCashTable', { includeFreeTables: false })}
          </div>
        </div>

        <div class="cash-workspace-right">
          ${tableCheckoutPanel(filteredRestaurantOrders, selectedAdminCashTable, 'admin', 'closeAdminTable', 'adminCancelOrder', 'transferAdminTable')}
        </div>
      </div>
    </section>
  ` : '';

  content.innerHTML = `
    <section class="dashboard-cards operation-cards">
      <div class="dash-card"><b>${openOrders.length}</b><span>${txt('admin.caixa.cardAbertos', 'Pedidos em aberto')}</span></div>
      <div class="dash-card"><b>${readyOrders}</b><span>${txt('admin.caixa.cardProntos', 'Prontos para fechar')}</span></div>
      <div class="dash-card"><b>${occupiedTables}</b><span>Mesas ocupadas</span></div>
      <div class="dash-card"><b>${eventOrders.length}</b><span>Eventos no caixa</span></div>
      <div class="dash-card"><b>${money(totalOpen)}</b><span>${txt('admin.caixa.cardTotal', 'Total em aberto')}</span></div>
    </section>

    ${cashFilterBar(adminCashFilter, filterCounts, 'setAdminCashFilter')}
    ${cashSessionPanel(cashInfo, 'adminCash')}
    ${eventsPanel}
    ${restaurantPanel}
  `;

  updateAdminNavCounters({ openOrders, restaurantOrders, eventOrders });
  bindPaymentControls('admin');
}

function shouldPauseAdminCashAutoRefresh() {
  if (activeAdminTab !== 'cash') return true;
  if (document.hidden) return true;
  return isEditingFormField(content);
}

async function refreshAdminCashIfChanged() {
  if (adminCashAutoRefreshing || shouldPauseAdminCashAutoRefresh()) return;

  adminCashAutoRefreshing = true;

  try {
    const [orders, cashInfo] = await Promise.all([
      API.get('/api/orders'),
      API.get('/api/cash-sessions/current'),
    ]);
    const openOrders = orders.filter((order) => !order.paid && order.status !== 'cancelado');
    const nextSignature = cashOpenOrdersSignature(openOrders, cashInfo);

    if (nextSignature !== adminCashLastSignature) {
      const newOrderCount = countNewCashOrders(openOrders, adminCashKnownOrderIds);
      if (newOrderCount) notifyCashNewOrders(newOrderCount);
      await renderCash({ orders, cashInfo });
    }
  } catch (err) {
    console.warn('Nao foi possivel atualizar o caixa do admin automaticamente.', err);
  } finally {
    adminCashAutoRefreshing = false;
  }
}

window.selectAdminCashTable = (encoded) => {
  selectedAdminCashTable = decodedTable(encoded);
  renderCash();
};

window.setAdminCashFilter = (filter) => {
  adminCashFilter = filter || 'all';
  selectedAdminCashTable = '';
  renderCash();
};

window.closeAdminTable = async (encoded) => {
  const table = decodedTable(encoded);
  await API.post('/api/tables/pay', tablePaymentBodyFromControls(table, 'admin'));
  toast('Mesa/comanda fechada.');
  selectedAdminCashTable = '';
  renderCash();
};

window.closeAdminEvent = async (orderId) => {
  await API.put(`/api/orders/${orderId}/pay`, eventPaymentBodyFromControls(orderId, 'admin'));
  toast('Evento fechado.');
  renderCash();
};

window.transferAdminTable = async (encoded) => {
  const table = decodedTable(encoded);
  const body = tableTransferBodyFromControls(table, 'admin');
  if (!body.toTable.trim()) return toast('Informe a mesa/comanda de destino.');
  if (!confirm(`Mover/juntar a mesa ${body.fromTable} para ${body.toTable.trim()}?`)) return;
  await API.post('/api/tables/transfer', body);
  toast('Mesa/comanda movida.');
  selectedAdminCashTable = body.toTable.trim();
  renderCash();
};

window.openCashSession = async (scope) => {
  await API.post('/api/cash-sessions/open', cashSessionOpenBody(scope));
  toast('Caixa aberto.');
  renderCash();
};

window.addCashSessionEntry = async (scope) => {
  await API.post('/api/cash-sessions/entry', cashSessionEntryBody(scope));
  toast('Movimentação registrada.');
  renderCash();
};

window.closeCashSession = async (scope) => {
  if (!confirm('Fechar o caixa do dia?')) return;
  const session = await API.post('/api/cash-sessions/close', cashSessionCloseBody(scope));
  toast(`Caixa fechado. Diferença: ${money(session.difference)}`);
  renderCash();
};

function orderDurationMinutes(order) {
  const start = new Date(order.createdAt).getTime();
  const endSource = order.readyAt || order.paidAt || order.deliveredAt;
  if (!start || !endSource) return null;
  const end = new Date(endSource).getTime();
  if (!end || end < start) return null;
  return Math.round((end - start) / 60000);
}

function durationLabel(minutes) {
  if (minutes === null || Number.isNaN(minutes)) return '-';
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

async function renderReports() {
  setText('pageTitle', txt('admin.relatorios.titulo', 'Relatórios'));
  setText('pageSub', txt('admin.relatorios.subtitulo', 'Resumo financeiro e produtos mais vendidos dentro do painel admin.'));

  const [orders, cashSessions, activityLog] = await Promise.all([
    API.get('/api/orders'),
    API.get('/api/cash-sessions'),
    API.get('/api/activity-log'),
  ]);
  const paidOrders = orders.filter((order) => order.paid && dateInRange(order.paidAt || order.createdAt, adminReportStartDate, adminReportEndDate));
  const total = paidOrders.reduce((sum, order) => sum + orderFinalTotal(order), 0);
  const items = {};
  const payments = {};
  const totalDiscount = paidOrders.reduce((sum, order) => sum + orderDiscount(order), 0);
  const totalService = paidOrders.reduce((sum, order) => sum + orderServiceFee(order), 0);

  paidOrders.forEach((order) => {
    const method = order.paymentMethod || 'nao_informado';
    if (!payments[method]) payments[method] = { count: 0, total: 0 };
    payments[method].count += 1;
    payments[method].total += orderFinalTotal(order);

    order.items.forEach((item) => {
      items[item.name] = (items[item.name] || 0) + Number(item.qty || 1);
    });
  });

  const topItems = Object.entries(items).sort((a, b) => b[1] - a[1]);
  const paymentRows = Object.entries(payments).sort((a, b) => b[1].total - a[1].total);
  const durations = paidOrders.map(orderDurationMinutes).filter((value) => value !== null);
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;

  content.innerHTML = `
    <div class="report-actions">
      <button class="primary print-btn" onclick="printVisibleReportDocument()">${txt('relatorios.botaoPdf', 'Salvar/Imprimir PDF')}</button>
      <label>De
        <input id="adminReportStartDate" type="date" value="${adminReportStartDate}" onchange="setAdminReportStartDate(this.value)">
      </label>
      <label>Até
        <input id="adminReportEndDate" type="date" value="${adminReportEndDate}" onchange="setAdminReportEndDate(this.value)">
      </label>
    </div>

    <section class="report-page" style="margin-top:16px">
      <div class="report-head">
        <div>
          <h1>${txt('relatorios.titulo', 'Relatório Quintal do Zé')}</h1>
          <p>${txt('relatorios.fechamento', 'Fechamento local')} • ${reportPeriodLabel(adminReportStartDate, adminReportEndDate)}</p>
        </div>
        <img src="/assets/logo.jpg" alt="Logo Quintal do Zé">
      </div>

      <div class="grid g4">
        <div class="metric"><span>${txt('relatorios.pedidosPagos', 'Pedidos pagos')}</span><b>${paidOrders.length}</b></div>
        <div class="metric"><span>${txt('relatorios.faturamento', 'Faturamento')}</span><b>${money(total)}</b></div>
        <div class="metric"><span>${txt('relatorios.ticketMedio', 'Ticket médio')}</span><b>${money(paidOrders.length ? total / paidOrders.length : 0)}</b></div>
        <div class="metric"><span>Tempo médio por pedido</span><b>${durationLabel(avgDuration)}</b></div>
      </div>

      <div class="grid g2" style="margin-top:18px">
        <div class="metric"><span>Taxas de serviço</span><b>${money(totalService)}</b></div>
        <div class="metric"><span>Descontos</span><b>${money(totalDiscount)}</b></div>
      </div>

      <h2>Resumo por pagamento</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Forma</th><th>Pedidos</th><th>Total</th></tr></thead>
          <tbody>
            ${paymentRows.length ? paymentRows.map(([method, data]) => `<tr><td>${paymentMethodLabel(method)}</td><td>${data.count}</td><td>${money(data.total)}</td></tr>`).join('') : `<tr><td colspan="3">Sem pagamentos nesta data.</td></tr>`}
          </tbody>
        </table>
      </div>

      <h2>${txt('relatorios.produtosMaisVendidos', 'Produtos mais vendidos')}</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>${txt('relatorios.produto', 'Produto')}</th><th>${txt('relatorios.quantidade', 'Quantidade')}</th></tr></thead>
          <tbody>
            ${topItems.length ? topItems.map(([name, qty]) => `<tr><td>${name}</td><td>${qty}</td></tr>`).join('') : `<tr><td colspan="2">${txt('relatorios.semVendas', 'Sem vendas registradas.')}</td></tr>`}
          </tbody>
        </table>
      </div>

      <h2>${txt('relatorios.pedidosPagos', 'Pedidos pagos')}</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>${txt('relatorios.mesa', 'Mesa')}</th><th>${txt('relatorios.garcom', 'Garçom')}</th><th>${txt('relatorios.data', 'Data')}</th><th>Pagamento</th><th>Tempo</th><th>${txt('relatorios.total', 'Total')}</th></tr></thead>
          <tbody>
            ${paidOrders.length ? paidOrders.map((order) => `<tr><td>${order.table}</td><td>${order.waiter || '-'}</td><td>${dateTime(order.createdAt)}</td><td>${paymentMethodLabel(order.paymentMethod)}</td><td>${durationLabel(orderDurationMinutes(order))}</td><td>${money(orderFinalTotal(order))}</td></tr>`).join('') : `<tr><td colspan="6">${txt('relatorios.nenhumPago', 'Nenhum pedido pago ainda.')}</td></tr>`}
          </tbody>
        </table>
      </div>

      ${advancedReportHtml({
        orders,
        reportStartDate: adminReportStartDate,
        reportEndDate: adminReportEndDate,
        cashSessions,
        activityLog,
      })}
    </section>
  `;
}

window.setAdminReportStartDate = (value) => {
  adminReportStartDate = value || todayDateValue();
  renderReports();
};

window.setAdminReportEndDate = (value) => {
  adminReportEndDate = value || adminReportStartDate;
  renderReports();
};

window.setAdminReportDate = (value) => {
  adminReportStartDate = value || todayDateValue();
  adminReportEndDate = adminReportStartDate;
  renderReports();
};

window.adminCancelOrder = async (id) => {
  if (!confirm(txt('pedidos.confirmarCancelar', 'Cancelar pedido?'))) return;
  const cancelReason = prompt('Informe o motivo do cancelamento:', '') || '';
  await API.put('/api/orders/' + id + '/status', { status: 'cancelado', cancelReason });
  toast(txt('pedidos.pedidoCancelado', 'Pedido cancelado.'));
  renderCash();
};

renderUsers();
preloadEmbeddedAdminPages();
updateAdminNavCounters();
setInterval(refreshAdminCashIfChanged, 4000);
setInterval(updateAdminNavCounters, 6000);
