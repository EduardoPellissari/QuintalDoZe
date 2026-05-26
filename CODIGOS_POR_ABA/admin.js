/* ==================================================
   PAINEL ADMINISTRATIVO
   Textos editáveis em: public/js/textos.js
   ================================================== */

requireRole(['admin']);

setupNav([
  { type: 'button', tab: 'users', labelKey: 'menu.usuarios', active: true },
  { type: 'button', tab: 'products', labelKey: 'menu.produtos' },
  { type: 'button', tab: 'cash', labelKey: 'menu.caixa' },
  { type: 'button', tab: 'reports', labelKey: 'menu.relatorios' },
  { href: '/garcom.html', labelKey: 'menu.pedidos' },
  { href: '/cozinha.html', labelKey: 'menu.cozinha' },
]);

setText('areaSmall', txt('admin.area', 'Administração'));
setText('pageTitle', txt('admin.dashboardTitulo', 'Admin Dashboard'));
setText('pageSub', txt('admin.dashboardSubtitulo', 'Gerencie usuários, produtos, caixa e relatórios em um só painel.'));

let editingUser = null;
let editingProduct = null;

const content = document.getElementById('content');

document.getElementById('sideNav').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;

  document.querySelectorAll('nav button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');

  editingUser = null;
  editingProduct = null;

  if (button.dataset.tab === 'users') renderUsers();
  if (button.dataset.tab === 'products') renderProducts();
  if (button.dataset.tab === 'cash') renderCash();
  if (button.dataset.tab === 'reports') renderReports();
});

async function renderUsers() {
  setText('pageTitle', txt('admin.usuarios.titulo', 'Admin Dashboard'));
  setText('pageSub', txt('admin.usuarios.subtitulo', 'Gerencie usuários e acessos do sistema.'));

  const users = await API.get('/api/users');

  content.innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${users.length}</b><span>${txt('admin.usuarios.cardUsuarios', 'Usuários cadastrados')}</span></div>
      <div class="dash-card"><b>4</b><span>${txt('admin.usuarios.cardPerfis', 'Perfis do sistema')}</span></div>
      <div class="dash-card"><b>ON</b><span>${txt('admin.usuarios.cardServidor', 'Servidor local')}</span></div>
    </section>

    <div class="admin-layout admin-users">
      <section class="panel admin-form-large">
        <div class="admin-form-head">
          <div>
            <h3>${editingUser ? txt('admin.usuarios.formEditar', 'Editar usuário') : txt('admin.usuarios.formNovo', 'Adicionar usuário')}</h3>
            <p>${txt('admin.usuarios.formDescricao', 'Cadastre, edite e organize os acessos do sistema por função.')}</p>
          </div>
          <span class="badge ok">${txt('admin.usuarios.badge', 'Área administrativa')}</span>
        </div>

        <form id="userForm">
          <div class="admin-form-grid">
            <label>${txt('admin.usuarios.nome', 'Nome')}
              <input id="uName" placeholder="${txt('admin.usuarios.placeholderNome', 'Ex: João')}" value="${editingUser?.name || ''}">
            </label>

            <label>${txt('admin.usuarios.email', 'E-mail')}
              <input id="uEmail" type="email" placeholder="${txt('admin.usuarios.placeholderEmail', 'email@quintaldoze.local')}" value="${editingUser?.email || ''}">
            </label>

            <label>${txt('admin.usuarios.senha', 'Senha')}
              <input id="uPass" type="password" placeholder="${editingUser ? txt('admin.usuarios.placeholderSenhaEditar', 'Deixe em branco para manter') : txt('admin.usuarios.placeholderSenhaNova', 'Digite uma senha')}">
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
                <th>${txt('admin.usuarios.colAcoes', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              ${users.map((user) => `
                <tr>
                  <td>${user.name || '-'}</td>
                  <td>${user.email}</td>
                  <td><span class="badge">${roleLabel(user.role)}</span></td>
                  <td>
                    <div class="actions">
                      <button class="soft" onclick="editUser(${user.id})">${txt('admin.usuarios.botaoSalvar', 'Editar').replace('Salvar alterações', 'Editar')}</button>
                      <button class="danger" onclick="deleteUser(${user.id})">${txt('pedidos.cancelar', 'Excluir').replace('Cancelar', 'Excluir')}</button>
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

  const cancel = document.getElementById('cancelUser');
  if (cancel) {
    cancel.onclick = () => {
      editingUser = null;
      renderUsers();
    };
  }

  document.getElementById('userForm').onsubmit = saveUser;
}

async function saveUser(event) {
  event.preventDefault();

  const body = {
    name: document.getElementById('uName').value,
    email: document.getElementById('uEmail').value,
    password: document.getElementById('uPass').value,
    role: document.getElementById('uRole').value,
  };

  try {
    if (editingUser) await API.put('/api/users/' + editingUser.id, body);
    else await API.post('/api/users', body);

    editingUser = null;
    toast(txt('admin.usuarios.salvo', 'Usuário salvo.'));
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

async function renderProducts() {
  setText('pageTitle', txt('admin.produtos.titulo', 'Produtos'));
  setText('pageSub', txt('admin.produtos.subtitulo', 'Cadastre, edite e organize os itens do cardápio.'));

  const products = await API.get('/api/products');
  const activeProducts = products.filter((product) => product.active !== false).length;
  const menuTotal = products.reduce((sum, product) => sum + Number(product.price || 0), 0);

  content.innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${products.length}</b><span>${txt('admin.produtos.cardProdutos', 'Produtos')}</span></div>
      <div class="dash-card"><b>${activeProducts}</b><span>${txt('admin.produtos.cardAtivos', 'Ativos')}</span></div>
      <div class="dash-card"><b>${money(menuTotal)}</b><span>${txt('admin.produtos.cardSoma', 'Soma cardápio')}</span></div>
    </section>

    <div class="admin-layout admin-products">
      <section class="panel admin-form-large">
        <div class="admin-form-head">
          <div>
            <h3>${editingProduct ? txt('admin.produtos.formEditar', 'Editar produto') : txt('admin.produtos.formNovo', 'Adicionar produto')}</h3>
            <p>${txt('admin.produtos.formDescricao', 'Cadastre produtos, preços, categorias e disponibilidade do cardápio.')}</p>
          </div>
          <span class="badge ok">${txt('admin.produtos.badge', 'Cardápio')}</span>
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
              <select id="pActive">
                <option value="true">${txt('admin.produtos.statusAtivo', 'Ativo')}</option>
                <option value="false">${txt('admin.produtos.statusInativo', 'Inativo')}</option>
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
                  <td><span class="badge ${product.active !== false ? 'ok' : 'warn'}">${product.active !== false ? txt('admin.produtos.statusAtivo', 'Ativo') : txt('admin.produtos.statusInativo', 'Inativo')}</span></td>
                  <td>
                    <div class="actions">
                      <button class="soft" onclick="editProduct(${product.id})">Editar</button>
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

  if (editingProduct) document.getElementById('pActive').value = String(editingProduct.active !== false);

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

  const body = {
    name: document.getElementById('pName').value,
    category: document.getElementById('pCat').value,
    price: Number(document.getElementById('pPrice').value),
    description: document.getElementById('pDesc').value,
    active: document.getElementById('pActive').value === 'true',
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

async function renderCash() {
  setText('pageTitle', txt('admin.caixa.titulo', 'Caixa'));
  setText('pageSub', txt('admin.caixa.subtitulo', 'Fechamento de pedidos em aberto dentro do painel admin.'));

  const orders = await API.get('/api/orders');
  const openOrders = orders.filter((order) => !order.paid && order.status !== 'cancelado');
  const readyOrders = openOrders.filter((order) => order.status === 'pronto').length;
  const totalOpen = openOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  content.innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${openOrders.length}</b><span>${txt('admin.caixa.cardAbertos', 'Pedidos em aberto')}</span></div>
      <div class="dash-card"><b>${readyOrders}</b><span>${txt('admin.caixa.cardProntos', 'Prontos para fechar')}</span></div>
      <div class="dash-card"><b>${money(totalOpen)}</b><span>${txt('admin.caixa.cardTotal', 'Total em aberto')}</span></div>
    </section>

    <section class="panel">
      <div class="admin-form-head">
        <div>
          <h3>${txt('admin.caixa.painelTitulo', 'Caixa')}</h3>
          <p>${txt('admin.caixa.painelDescricao', 'Marque pedidos como pagos ou cancele pedidos quando necessário.')}</p>
        </div>
        <span class="badge ok">${txt('admin.caixa.badge', 'Acesso admin')}</span>
      </div>

      <div class="order-list">
        ${openOrders.length ? openOrders.map(orderCard).join('') : `<p class="muted">${txt('pedidos.nenhumAberto', 'Nenhum pedido em aberto.')}</p>`}
      </div>
    </section>
  `;
}

function orderCard(order) {
  return `
    <div class="card">
      <div class="order-head">
        <div>
          <b>${txt('pedidos.mesa', 'Mesa')} ${order.table}</b>
          <p class="muted">${order.waiter || txt('pedidos.garcomNaoInformado', 'Garçom não informado')} • ${dateTime(order.createdAt)}</p>
        </div>
        <span class="badge ${order.status === 'pronto' ? 'ok' : 'warn'}">${statusLabel(order.status)}</span>
      </div>

      <div>
        ${order.items.map((item) => `
          <div class="cart-line">
            <span>${item.qty}x ${item.name}</span>
            <b>${money(item.price * item.qty)}</b>
          </div>
        `).join('')}
      </div>

      <div class="metric" style="margin-top:12px">
        <b>${txt('pedidos.total', 'Total')}</b>
        <b class="price">${money(order.total)}</b>
      </div>

      <div class="actions" style="margin-top:12px">
        <button class="primary" onclick="adminPayOrder(${order.id})">${txt('pedidos.marcarPago', 'Marcar como pago')}</button>
        <button class="danger" onclick="adminCancelOrder(${order.id})">${txt('pedidos.cancelar', 'Cancelar')}</button>
      </div>
    </div>
  `;
}


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

  const orders = await API.get('/api/orders');
  const paidOrders = orders.filter((order) => order.paid);
  const total = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const items = {};

  paidOrders.forEach((order) => {
    order.items.forEach((item) => {
      items[item.name] = (items[item.name] || 0) + Number(item.qty || 1);
    });
  });

  const topItems = Object.entries(items).sort((a, b) => b[1] - a[1]);
  const durations = paidOrders.map(orderDurationMinutes).filter((value) => value !== null);
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;

  content.innerHTML = `
    <button class="primary print-btn" onclick="window.print()">${txt('relatorios.botaoPdf', 'Salvar/Imprimir PDF')}</button>

    <section class="report-page" style="margin-top:16px">
      <div class="report-head">
        <div>
          <h1>${txt('relatorios.titulo', 'Relatório Quintal do Zé')}</h1>
          <p>${txt('relatorios.fechamento', 'Fechamento local')} • ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <img src="/assets/logo.jpg" alt="Logo Quintal do Zé">
      </div>

      <div class="grid g4">
        <div class="metric"><span>${txt('relatorios.pedidosPagos', 'Pedidos pagos')}</span><b>${paidOrders.length}</b></div>
        <div class="metric"><span>${txt('relatorios.faturamento', 'Faturamento')}</span><b>${money(total)}</b></div>
        <div class="metric"><span>${txt('relatorios.ticketMedio', 'Ticket médio')}</span><b>${money(paidOrders.length ? total / paidOrders.length : 0)}</b></div>
        <div class="metric"><span>Tempo médio por pedido</span><b>${durationLabel(avgDuration)}</b></div>
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
          <thead><tr><th>${txt('relatorios.mesa', 'Mesa')}</th><th>${txt('relatorios.garcom', 'Garçom')}</th><th>${txt('relatorios.data', 'Data')}</th><th>Tempo</th><th>${txt('relatorios.total', 'Total')}</th></tr></thead>
          <tbody>
            ${paidOrders.length ? paidOrders.map((order) => `<tr><td>${order.table}</td><td>${order.waiter || '-'}</td><td>${dateTime(order.createdAt)}</td><td>${durationLabel(orderDurationMinutes(order))}</td><td>${money(order.total)}</td></tr>`).join('') : `<tr><td colspan="5">${txt('relatorios.nenhumPago', 'Nenhum pedido pago ainda.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

window.adminPayOrder = async (id) => {
  await API.put('/api/orders/' + id + '/pay', {});
  toast(txt('pedidos.pedidoPago', 'Pedido pago.'));
  renderCash();
};

window.adminCancelOrder = async (id) => {
  if (!confirm(txt('pedidos.confirmarCancelar', 'Cancelar pedido?'))) return;
  await API.put('/api/orders/' + id + '/status', { status: 'cancelado' });
  toast(txt('pedidos.pedidoCancelado', 'Pedido cancelado.'));
  renderCash();
};

renderUsers();
