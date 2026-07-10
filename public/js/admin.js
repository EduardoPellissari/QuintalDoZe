/* ==================================================
   PAINEL ADMINISTRATIVO
   Textos editáveis em: public/js/textos.js
   ================================================== */

requireRole(['admin']);

setupNav([
  { type: 'button', tab: 'users', labelKey: 'menu.usuarios', active: true },
  { type: 'button', tab: 'products', labelKey: 'menu.produtos' },
  { type: 'button', tab: 'quotes', label: '📋 Orçamentos' },
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
let editingQuote = null;
let quoteItems = [{ description: '', qty: 1, unitPrice: 0 }];

const quoteTypes = ['Café da tarde', 'Happy hour', 'Coffee break', 'Almoço/Jantar', 'Evento personalizado'];
const quoteStatuses = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const content = document.getElementById('content');

document.getElementById('sideNav').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;

  document.querySelectorAll('nav button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');

  editingUser = null;
  editingProduct = null;
  editingQuote = null;
  quoteItems = [{ description: '', qty: 1, unitPrice: 0 }];

  if (button.dataset.tab === 'users') renderUsers();
  if (button.dataset.tab === 'products') renderProducts();
  if (button.dataset.tab === 'quotes') renderQuotes();
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
      <div class="dash-card"><b>ON</b><span>${txt('admin.usuarios.cardServidor', 'Servidor')}</span></div>
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

function renderQuoteItemRows() {
  return quoteItems.map((item, index) => `
    <div class="quote-item-row">
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
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      const field = event.target.dataset.field;
      if (!quoteItems[index]) return;

      quoteItems[index][field] = ['qty', 'unitPrice'].includes(field)
        ? Number(event.target.value || 0)
        : event.target.value;

      const rowTotal = document.querySelector(`[data-row-total="${index}"]`);
      if (rowTotal) {
        rowTotal.textContent = money(Number(quoteItems[index].qty || 0) * Number(quoteItems[index].unitPrice || 0));
      }
      updateQuoteTotal();
    });
  });
}

window.addQuoteItem = () => {
  quoteItems.push({ description: '', qty: 1, unitPrice: 0 });
  renderQuoteItemsOnly();
};

window.removeQuoteItem = (index) => {
  quoteItems.splice(index, 1);
  if (!quoteItems.length) quoteItems = [{ description: '', qty: 1, unitPrice: 0 }];
  renderQuoteItemsOnly();
};

async function renderQuotes() {
  setText('pageTitle', 'Orçamentos');
  setText('pageSub', 'Monte propostas para café da tarde, happy hour, coffee break e eventos.');

  const quotes = await API.get('/api/quotes');
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
                <p class="muted">Informe os itens, quantidades e valores da proposta.</p>
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
      quoteItems = [{ description: '', qty: 1, unitPrice: 0 }];
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
        <button class="soft" onclick="printQuote(${quote.id})">Imprimir</button>
        <button class="danger" onclick="deleteQuote(${quote.id})">Excluir</button>
      </div>
    </article>
  `;
}

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
    quoteItems = [{ description: '', qty: 1, unitPrice: 0 }];
    toast('Orçamento salvo.');
    renderQuotes();
  } catch (err) {
    toast(err.message);
  }
}

window.editQuote = async (id) => {
  const quotes = await API.get('/api/quotes');
  editingQuote = quotes.find((quote) => Number(quote.id) === Number(id));
  quoteItems = (editingQuote?.items?.length ? editingQuote.items : [{ description: '', qty: 1, unitPrice: 0 }])
    .map((item) => ({
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

window.printQuote = async (id) => {
  const quotes = await API.get('/api/quotes');
  const quote = quotes.find((item) => Number(item.id) === Number(id));
  if (!quote) return toast('Orçamento não encontrado.');

  const printWindow = window.open('', '_blank');
  if (!printWindow) return toast('Permita pop-ups para imprimir o orçamento.');

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Orçamento ${escapeHtml(quote.clientName)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1c1c1c; margin: 32px; }
        h1 { margin: 0 0 8px; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border-bottom: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f6c400; color: #151515; }
        .total { text-align: right; font-size: 22px; font-weight: 700; margin-top: 22px; }
      </style>
    </head>
    <body>
      <h1>Orçamento Quintal do Zé</h1>
      <p class="muted">Cliente: ${escapeHtml(quote.clientName)}</p>
      <p class="muted">Evento: ${escapeHtml(quote.eventType)} • ${quoteDate(quote.eventDate)} ${escapeHtml(quote.eventTime || '')}</p>
      <p class="muted">Pessoas: ${Number(quote.guests || 0) || '-'} • Local: ${escapeHtml(quote.location || '-')}</p>
      ${quote.notes ? `<p>${escapeHtml(quote.notes)}</p>` : ''}
      <table>
        <thead><tr><th>Item</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th></tr></thead>
        <tbody>
          ${(quote.items || []).map((item) => `
            <tr>
              <td>${escapeHtml(item.description)}</td>
              <td>${Number(item.qty || 0)}</td>
              <td>${money(item.unitPrice)}</td>
              <td>${money(Number(item.qty || 0) * Number(item.unitPrice || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="total">Total: ${money(quote.total)}</div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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
