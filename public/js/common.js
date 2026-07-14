/* ==================================================
   FUNÇÕES GERAIS DO SISTEMA
   Arquivo compartilhado por todas as telas.
   ================================================== */

const API = {
  async get(url) {
    const response = await fetch(url);
    return handle(response);
  },

  async post(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handle(response);
  },

  async put(url, body) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handle(response);
  },

  async del(url) {
    const response = await fetch(url, { method: 'DELETE' });
    return handle(response);
  },
};

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || txt('sistema.erroPadrao', 'Erro no sistema'));
  return data;
}

function txt(path, fallback = '') {
  const parts = String(path).split('.');
  let value = window.TEXTOS || {};

  for (const part of parts) {
    value = value?.[part];
  }

  return value ?? fallback;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function htmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function dateTime(value) {
  return new Date(value).toLocaleString('pt-BR');
}

function todayDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function localDateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

const TOTAL_TABLES = 30;

function configuredRestaurantTables() {
  return Array.from({ length: TOTAL_TABLES }, (_, index) => String(index + 1));
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Cartão débito' },
  { value: 'credito', label: 'Cartão crédito' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'misto', label: 'Pagamento misto' },
];

function paymentMethodLabel(value) {
  const method = PAYMENT_METHODS.find((item) => item.value === value);
  return method ? method.label : 'Não informado';
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

function itemNoteParts(note) {
  return String(note || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function itemDetailsHtml(item, options = {}) {
  const showExtraPrice = options.showExtraPrice !== false;
  const noteParts = itemNoteParts(item?.note);

  if (options.layout === 'list') {
    const details = [
      ...noteParts.map((note) => ({ type: 'note', value: htmlAttr(note) })),
      showExtraPrice && itemExtraPrice(item) ? { type: 'extra', value: `${money(itemExtraPrice(item))} por un.` } : null,
    ].filter(Boolean);

    return details.length ? `
      <span class="item-detail-list item-detail-lines">
        <span class="item-detail-lines-title">Personalização</span>
        ${details.map((detail) => `
          <span class="item-detail-line ${detail.type}">
            <span>${detail.value}</span>
          </span>
        `).join('')}
      </span>
    ` : '';
  }

  const details = [
    noteParts.length ? { type: 'note', label: 'Personalização', value: noteParts.map(htmlAttr).join('; ') } : null,
    showExtraPrice && itemExtraPrice(item) ? { type: 'extra', label: 'Acréscimo', value: `${money(itemExtraPrice(item))} por un.` } : null,
  ].filter(Boolean);

  return details.length ? `
    <span class="item-detail-list">
      ${details.map((detail) => `
        <span class="item-detail-chip ${detail.type}">
          <strong>${detail.label}</strong>
          <span>${detail.value}</span>
        </span>
      `).join('')}
    </span>
  ` : '';
}

function orderSubtotal(order) {
  if (Number(order?.subtotal || 0) > 0) return Number(order.subtotal);
  return (order?.items || []).reduce((sum, item) => sum + itemLineTotal(item), 0);
}

function orderServiceFee(order) {
  return Math.max(Number(order?.serviceFee || 0), 0);
}

function orderDiscount(order) {
  return Math.max(Number(order?.discount || 0), 0);
}

function orderFinalTotal(order) {
  const fallback = orderSubtotal(order) + orderServiceFee(order) - orderDiscount(order);
  return Math.max(Number(order?.total ?? fallback), 0);
}

function cashOpenOrdersSignature(openOrders, cashInfo = {}) {
  const orders = [...(openOrders || [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((order) => ({
      id: order.id,
      table: order.table,
      status: order.status,
      paid: order.paid === true,
      subtotal: orderSubtotal(order),
      total: order.total ?? null,
      createdAt: order.createdAt || '',
      readyAt: order.readyAt || '',
      items: (order.items || []).map((item) => ({
        id: item.id,
        name: item.name,
        qty: Number(item.qty || 1),
        price: Number(item.price || 0),
        extraPrice: Number(item.extraPrice || 0),
        note: item.note || '',
      })),
    }));

  return JSON.stringify({
    cashSession: cashInfo?.id || cashInfo?.openedAt || cashInfo?.status || '',
    orders,
  });
}

function cashOrderIds(openOrders) {
  return new Set((openOrders || []).map((order) => String(order.id)));
}

function countNewCashOrders(openOrders, knownIds) {
  if (!knownIds || !knownIds.size) return 0;
  return (openOrders || []).filter((order) => !knownIds.has(String(order.id))).length;
}

function playCashAlertTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 740;
    gain.gain.value = 0.055;
    oscillator.start();

    setTimeout(() => {
      oscillator.stop();
      context.close();
    }, 150);
  } catch (err) {
    console.warn('Nao foi possivel tocar alerta do caixa.', err);
  }
}

function notifyCashNewOrders(count = 1) {
  const message = count > 1 ? `${count} novas comandas no caixa.` : 'Nova comanda no caixa.';
  toast(message);
  playCashAlertTone();
}

function isEditingFormField(root = document) {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable;
}

function cashFilterCounts(restaurantOrders, eventOrders) {
  const groups = groupOrdersByTable(restaurantOrders);
  const readyTables = groups.filter((group) => group.orders.every((order) => order.status === 'pronto')).length;
  const kitchenTables = groups.filter((group) => group.orders.some((order) => ['pendente', 'preparando'].includes(order.status))).length;

  return {
    all: groups.length + eventOrders.length,
    ready: readyTables,
    kitchen: kitchenTables,
    events: eventOrders.length,
  };
}

function filterRestaurantOrdersForCash(restaurantOrders, filter) {
  if (filter === 'events') return [];
  if (filter === 'all') return restaurantOrders;

  const groups = groupOrdersByTable(restaurantOrders);
  const filteredGroups = groups.filter((group) => {
    if (filter === 'ready') return group.orders.every((order) => order.status === 'pronto');
    if (filter === 'kitchen') return group.orders.some((order) => ['pendente', 'preparando'].includes(order.status));
    return true;
  });

  return filteredGroups.flatMap((group) => group.orders);
}

function cashFilterBar(activeFilter, counts, handlerName) {
  const filters = [
    { value: 'all', label: 'Todas' },
    { value: 'ready', label: 'Prontas' },
    { value: 'kitchen', label: 'Em cozinha' },
    { value: 'events', label: 'Eventos' },
  ];

  return `
    <div class="cash-filter-bar">
      ${filters.map((filter) => `
        <button
          type="button"
          class="${activeFilter === filter.value ? 'active' : ''}"
          onclick="${handlerName}('${filter.value}')"
        >
          <span>${filter.label}</span>
          <b>${counts[filter.value] || 0}</b>
        </button>
      `).join('')}
    </div>
  `;
}

function setNavBadge(tab, count, tone = '') {
  const item = document.querySelector(`#sideNav [data-tab="${tab}"]`);
  if (!item) return;

  let badge = item.querySelector('.nav-count-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-count-badge';
    item.appendChild(badge);
  }

  badge.className = `nav-count-badge ${tone}`.trim();
  badge.textContent = count;
  badge.hidden = !count;
}

function paymentFieldId(id, scope, field) {
  return `${scope}-${field}-${id}`;
}

function paymentOptions(selected = '') {
  return PAYMENT_METHODS
    .map((method) => `<option value="${method.value}" ${selected === method.value ? 'selected' : ''}>${method.label}</option>`)
    .join('');
}

function updatePaymentPreview(id, scope) {
  const box = document.querySelector(`[data-payment-box="${scope}-${id}"]`);
  if (!box) return;

  const subtotal = Number(box.dataset.subtotal || 0);
  const serviceFee = Number(document.getElementById(paymentFieldId(id, scope, 'service'))?.value || 0);
  const discount = Number(document.getElementById(paymentFieldId(id, scope, 'discount'))?.value || 0);
  const splitCount = Math.max(Number(document.getElementById(paymentFieldId(id, scope, 'split'))?.value || 1), 1);
  const total = Math.max(subtotal + serviceFee - discount, 0);
  const totalElement = document.getElementById(paymentFieldId(id, scope, 'total'));
  const splitElement = document.getElementById(paymentFieldId(id, scope, 'splitTotal'));
  if (totalElement) totalElement.textContent = money(total);
  if (splitElement) splitElement.textContent = `${splitCount}x de ${money(total / splitCount)}`;
}

function bindPaymentControls(scope) {
  document.querySelectorAll(`.payment-control[data-scope="${scope}"]`).forEach((input) => {
    input.addEventListener('input', () => updatePaymentPreview(input.dataset.order, scope));
    input.addEventListener('change', () => updatePaymentPreview(input.dataset.order, scope));
  });
}

function paymentBodyFromControls(id, scope) {
  return {
    paymentMethod: document.getElementById(paymentFieldId(id, scope, 'method'))?.value || 'pix',
    serviceFee: Number(document.getElementById(paymentFieldId(id, scope, 'service'))?.value || 0),
    discount: Number(document.getElementById(paymentFieldId(id, scope, 'discount'))?.value || 0),
    paymentNote: document.getElementById(paymentFieldId(id, scope, 'note'))?.value || '',
    paymentSplitCount: Math.max(Number(document.getElementById(paymentFieldId(id, scope, 'split'))?.value || 1), 1),
  };
}

function isEventOrder(order) {
  return order?.source === 'quote' || Boolean(order?.quoteId) || /^evento\b/i.test(String(order?.table || ''));
}

function eventPaymentKey(orderId) {
  return `event-${orderId}`;
}

function eventOrderTitle(order) {
  return order?.table || (order?.quoteId ? `Evento ${order.quoteId}` : `Pedido #${order?.id || ''}`);
}

function eventOrderMeta(order) {
  return String(order?.notes || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function eventPaymentControls(order, scope) {
  const key = eventPaymentKey(order.id);
  const subtotal = orderSubtotal(order);

  return `
    <div class="payment-box event-payment-box" data-payment-box="${scope}-${key}" data-subtotal="${subtotal}">
      <div class="payment-grid event-payment-grid">
        <label>Forma de pagamento
          <select id="${paymentFieldId(key, scope, 'method')}" class="payment-control" data-order="${key}" data-scope="${scope}">
            ${paymentOptions('pix')}
          </select>
        </label>

        <label>Observação do pagamento
          <input id="${paymentFieldId(key, scope, 'note')}" placeholder="Opcional">
        </label>
      </div>

      <div class="payment-total">
        <div>
          <span>Total do evento</span>
          <small>Valor vindo do orçamento aprovado</small>
        </div>
        <b id="${paymentFieldId(key, scope, 'total')}">${money(subtotal)}</b>
      </div>
    </div>
  `;
}

function eventPaymentBodyFromControls(orderId, scope) {
  return {
    ...paymentBodyFromControls(eventPaymentKey(orderId), scope),
    serviceFee: 0,
    discount: 0,
    paymentSplitCount: 0,
  };
}

function tableKey(table) {
  return String(table || 'Sem mesa');
}

function encodedTable(table) {
  return encodeURIComponent(tableKey(table));
}

function decodedTable(value) {
  return decodeURIComponent(String(value || ''));
}

function groupOrdersByTable(openOrders) {
  const groups = {};

  openOrders.forEach((order) => {
    const key = tableKey(order.table);
    if (!groups[key]) groups[key] = { table: key, orders: [], subtotal: 0, ready: 0 };
    groups[key].orders.push(order);
    groups[key].subtotal += orderSubtotal(order);
    if (order.status === 'pronto') groups[key].ready += 1;
  });

  return Object.values(groups).sort((a, b) => String(a.table).localeCompare(String(b.table), 'pt-BR'));
}

function tablePaymentControls(table, subtotal, scope) {
  const key = encodedTable(table);

  return `
    <div class="payment-box" data-payment-box="${scope}-${key}" data-subtotal="${subtotal}">
      <div class="payment-grid table-payment-grid">
        <label>Forma de pagamento
          <select id="${paymentFieldId(key, scope, 'method')}" class="payment-control" data-order="${key}" data-scope="${scope}">
            ${paymentOptions('pix')}
          </select>
        </label>

        <label>Taxa de serviço
          <input id="${paymentFieldId(key, scope, 'service')}" class="payment-control" data-order="${key}" data-scope="${scope}" type="number" min="0" step="0.01" placeholder="Opcional">
        </label>

        <label>Desconto
          <input id="${paymentFieldId(key, scope, 'discount')}" class="payment-control" data-order="${key}" data-scope="${scope}" type="number" min="0" step="0.01" placeholder="Opcional">
        </label>

        <label>Observação
          <input id="${paymentFieldId(key, scope, 'note')}" placeholder="Opcional">
        </label>

        <label>Dividir por pessoas
          <input id="${paymentFieldId(key, scope, 'split')}" class="payment-control" data-order="${key}" data-scope="${scope}" type="number" min="1" step="1" value="1">
        </label>
      </div>

      <div class="payment-total">
        <div>
          <span>Total a receber</span>
          <small id="${paymentFieldId(key, scope, 'splitTotal')}">1x de ${money(subtotal)}</small>
        </div>
        <b id="${paymentFieldId(key, scope, 'total')}">${money(subtotal)}</b>
      </div>
    </div>
  `;
}

function tablePaymentBodyFromControls(table, scope) {
  return {
    table: tableKey(table),
    ...paymentBodyFromControls(encodedTable(table), scope),
  };
}

function tableTransferFieldId(table, scope) {
  return `${scope}-transfer-${encodedTable(table)}`;
}

function tableTransferBodyFromControls(table, scope) {
  return {
    fromTable: tableKey(table),
    toTable: document.getElementById(tableTransferFieldId(table, scope))?.value || '',
  };
}

function tableSummaryCards(openOrders, selectedTable, selectFunctionName) {
  const groups = groupOrdersByTable(openOrders);
  if (!groups.length) return '<p class="muted">Nenhuma mesa ocupada no momento.</p>';

  return `
    <div class="table-status-grid">
      ${groups.map((group) => {
        const active = tableKey(selectedTable) === group.table;
        return `
          <button class="table-status-card ${active ? 'active' : ''}" type="button" onclick="${selectFunctionName}('${encodedTable(group.table)}')">
            <span>Mesa/Comanda</span>
            <b>${htmlAttr(group.table)}</b>
            <small>${group.orders.length} pedido(s) • ${group.ready} pronto(s) • ${money(group.subtotal)}</small>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function tableMapPanel(openOrders, selectedTable, selectFunctionName, options = {}) {
  const groups = groupOrdersByTable(openOrders);
  const groupMap = new Map(groups.map((group) => [group.table, group]));
  const configured = configuredRestaurantTables();
  const includeFreeTables = options.includeFreeTables !== false;
  const baseTables = includeFreeTables ? configured : configured.filter((table) => groupMap.has(table));
  const extras = groups.map((group) => group.table).filter((table) => !configured.includes(table));

  const statusForGroup = (group) => {
    if (!group) return { key: 'free', label: 'Livre' };
    if (group.orders.every((order) => order.status === 'pronto')) return { key: 'ready', label: 'Pronta' };
    if (group.orders.some((order) => ['pendente', 'preparando'].includes(order.status))) return { key: 'kitchen', label: 'Cozinha' };
    return { key: 'open', label: 'Aberta' };
  };

  const statusRank = { ready: 0, kitchen: 1, open: 2, free: 3 };
  const tableSortValue = (table) => {
    const status = statusForGroup(groupMap.get(table));
    const numeric = Number(table);
    return {
      status: statusRank[status.key] ?? 9,
      numeric: Number.isFinite(numeric) ? numeric : 9999,
      label: String(table),
    };
  };

  const tables = [...baseTables, ...extras].sort((a, b) => {
    const left = tableSortValue(a);
    const right = tableSortValue(b);
    if (left.status !== right.status) return left.status - right.status;
    if (left.numeric !== right.numeric) return left.numeric - right.numeric;
    return left.label.localeCompare(right.label, 'pt-BR');
  });

  if (!tables.length) return '<p class="muted">Nenhuma mesa/comanda ocupada no momento.</p>';

  const mapLabel = (table) => {
    const value = String(table || '');
    const eventMatch = value.match(/^evento\s+(.+)$/i);
    if (eventMatch) {
      const ref = eventMatch[1].trim();
      return {
        title: 'Evento',
        detail: ref.length > 8 ? `#${ref.slice(-8)}` : ref ? `#${ref}` : '',
      };
    }

    if (value.length > 12) {
      return {
        title: `${value.slice(0, 10)}...`,
        detail: value,
      };
    }

    return { title: value, detail: '' };
  };

  return `
    <div class="table-map-grid">
      ${tables.map((table) => {
        const group = groupMap.get(table);
        const active = tableKey(selectedTable) === table;
        const label = mapLabel(table);
        const status = statusForGroup(group);
        const readyCount = group ? group.orders.filter((order) => order.status === 'pronto').length : 0;
        const kitchenCount = group ? group.orders.filter((order) => ['pendente', 'preparando'].includes(order.status)).length : 0;
        const summary = group
          ? [
            `${group.orders.length} pedido(s)`,
            readyCount ? `${readyCount} pronto(s)` : '',
            kitchenCount ? `${kitchenCount} cozinha` : '',
            money(group.subtotal),
          ].filter(Boolean).join(' • ')
          : 'Disponível';

        return `
          <button
            type="button"
            class="table-map-card status-${status.key} ${active ? 'active' : ''}"
            title="${htmlAttr(table)}"
            ${group ? `onclick="${selectFunctionName}('${encodedTable(table)}')"` : ''}
          >
            <span class="table-map-name">
              <b>${htmlAttr(label.title)}</b>
              ${label.detail ? `<em>${htmlAttr(label.detail)}</em>` : ''}
            </span>
            <span>${status.label}</span>
            <small>${summary}</small>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function tableTransferControls(table, scope, transferFunctionName) {
  if (!transferFunctionName) return '';

  return `
    <div class="table-transfer-box">
      <div>
        <h4>Mover ou juntar mesa</h4>
        <p>Use para corrigir mesa errada ou juntar todos os pedidos em outra mesa/comanda.</p>
      </div>

      <div class="table-transfer-row">
        <label>Destino
          <input id="${tableTransferFieldId(table, scope)}" placeholder="Ex: 8 ou Balcao 2">
        </label>
        <button class="soft" type="button" onclick="${transferFunctionName}('${encodedTable(table)}')">Mover/Juntar</button>
      </div>
    </div>
  `;
}

function tableCheckoutPanel(openOrders, selectedTable, scope, closeFunctionName, cancelFunctionName, transferFunctionName = '') {
  const groups = groupOrdersByTable(openOrders);
  const group = groups.find((item) => item.table === tableKey(selectedTable)) || groups[0];

  if (!group) {
    return '<p class="muted">Selecione uma mesa/comanda para fechar a conta.</p>';
  }

  return `
    <div class="table-checkout">
      <div class="table-checkout-head">
        <div>
          <span>Fechamento da mesa/comanda</span>
          <h3>${htmlAttr(group.table)}</h3>
          <p>${group.orders.length} pedido(s) aberto(s)</p>
        </div>
        <b>${money(group.subtotal)}</b>
      </div>

      <div class="table-checkout-orders">
        ${group.orders.map((order) => `
          <div class="table-checkout-order">
            <div class="order-head">
              <div>
                <b>Pedido #${order.id}</b>
                <p class="muted">${order.waiter || 'Garçom não informado'} • ${dateTime(order.createdAt)}</p>
              </div>
              <span class="badge ${order.status === 'pronto' ? 'ok' : 'warn'}">${statusLabel(order.status)}</span>
            </div>

            ${(order.items || []).map((item) => `
              <div class="cart-line">
                <span>${Number(item.qty || 1)}x ${htmlAttr(item.name)}${itemDetailsHtml(item)}</span>
                <b>${money(itemLineTotal(item))}</b>
              </div>
            `).join('')}

            ${order.notes ? `<p class="muted" style="margin:8px 0 0">Obs.: ${htmlAttr(order.notes)}</p>` : ''}

            <div class="actions" style="margin-top:10px">
              <button class="danger" type="button" onclick="${cancelFunctionName}(${order.id})">Cancelar pedido</button>
            </div>
          </div>
        `).join('')}
      </div>

      ${tablePaymentControls(group.table, group.subtotal, scope)}
      ${tableTransferControls(group.table, scope, transferFunctionName)}

      <div class="table-final-actions">
        <button class="soft" type="button" onclick="printTableReceipt('${encodedTable(group.table)}', '${scope}')">Pré-conta PDF</button>
        <button class="primary table-close-button" type="button" onclick="${closeFunctionName}('${encodedTable(group.table)}')">Fechar mesa/comanda</button>
      </div>
    </div>
  `;
}

function eventCheckoutPanel(eventOrders, scope, closeFunctionName, cancelFunctionName) {
  const orders = [...eventOrders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!orders.length) return '<p class="muted">Nenhum evento vindo de orçamento aguardando pagamento.</p>';

  return `
    <div class="event-checkout-list">
      ${orders.map((order) => {
        const meta = eventOrderMeta(order);

        return `
          <div class="event-checkout-card">
            <div class="event-checkout-head">
              <div>
                <span>Evento / orçamento</span>
                <h3>${htmlAttr(eventOrderTitle(order))}</h3>
                <p>Pedido #${order.id}${order.quoteId ? ` • Orçamento #${order.quoteId}` : ''} • ${dateTime(order.createdAt)}</p>
              </div>
              <b>${money(orderSubtotal(order))}</b>
            </div>

            ${meta.length ? `
              <div class="event-meta-grid">
                ${meta.slice(0, 8).map((item) => `<span>${htmlAttr(item)}</span>`).join('')}
              </div>
            ` : ''}

            <div class="table-checkout-orders">
              <div class="table-checkout-order">
                <div class="order-head">
                  <div>
                    <b>Itens do evento</b>
                    <p class="muted">${htmlAttr(order.waiter || 'Orçamento')} • ${htmlAttr(statusLabel(order.status))}</p>
                  </div>
                  <span class="badge blue">Sem mesa</span>
                </div>

                ${(order.items || []).map((item) => `
                  <div class="cart-line">
                    <span>${Number(item.qty || 1)}x ${htmlAttr(item.name)}${itemDetailsHtml(item)}</span>
                    <b>${money(itemLineTotal(item))}</b>
                  </div>
                `).join('')}
              </div>
            </div>

            ${eventPaymentControls(order, scope)}

            <div class="table-final-actions event-final-actions">
              <button class="soft" type="button" onclick="printEventReceipt(${order.id}, '${scope}')">Recibo PDF</button>
              <button class="danger" type="button" onclick="${cancelFunctionName}(${order.id})">Cancelar evento</button>
              <button class="primary table-close-button" type="button" onclick="${closeFunctionName}(${order.id})">Fechar evento</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.printEventReceipt = async (orderId, scope) => {
  const orders = await API.get('/api/orders');
  const order = orders.find((item) => String(item.id) === String(orderId));
  if (!order) return toast('Evento não encontrado para gerar recibo.');

  const subtotal = orderSubtotal(order);
  const payment = eventPaymentBodyFromControls(order.id, scope);
  const generatedAt = new Date().toLocaleString('pt-BR');
  const title = eventOrderTitle(order);
  const meta = eventOrderMeta(order);

  const metricsHtml = `
    <div class="grid g4">
      <div class="metric"><span>Evento</span><b>${htmlAttr(title)}</b></div>
      <div class="metric"><span>Pedido</span><b>#${order.id}</b></div>
      <div class="metric"><span>Forma</span><b>${paymentMethodLabel(payment.paymentMethod)}</b></div>
      <div class="metric"><span>Total</span><b>${money(subtotal)}</b></div>
    </div>
  `;

  const bodyHtml = `
    ${meta.length ? `
      <div class="grid g2 pdf-print-info-grid">
        ${meta.slice(0, 8).map((item) => `<div class="metric"><span>Informação</span><b>${htmlAttr(item)}</b></div>`).join('')}
      </div>
    ` : ''}

    <h2>Itens do evento</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>
          ${(order.items || []).map((item) => `
            <tr>
              <td>${htmlAttr(item.name)}${item.note ? `<br><small>${htmlAttr(item.note)}</small>` : ''}</td>
              <td>${Number(item.qty || 1)}</td>
              <td>${money(itemUnitPrice(item))}</td>
              <td>${money(itemLineTotal(item))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${payment.paymentNote ? `<p class="pdf-print-note">${htmlAttr(payment.paymentNote)}</p>` : ''}

    <div class="pdf-print-total">
      <span>Total do evento</span>
      <b>${money(subtotal)}</b>
    </div>
  `;

  return openReportPrintDocument({
    documentTitle: `Evento ${htmlAttr(title)}`,
    heading: 'Evento Quintal do Zé',
    subtitle: `Fechamento de orçamento • ${generatedAt}`,
    details: 'Recibo simples para evento aprovado.',
    metricsHtml,
    bodyHtml,
    referenceLabel: 'Evento',
    referenceText: htmlAttr(title),
    blockedMessage: 'Permita pop-ups para imprimir o recibo do evento.',
  });
};

window.printTableReceipt = async (encoded, scope) => {
  const table = decodedTable(encoded);
  const orders = await API.get('/api/orders');
  const openOrders = orders.filter((order) => tableKey(order.table) === table && !order.paid && order.status !== 'cancelado');
  if (!openOrders.length) return toast('Nenhum pedido aberto para gerar pré-conta.');

  const subtotal = openOrders.reduce((sum, order) => sum + orderSubtotal(order), 0);
  const payment = paymentBodyFromControls(encodedTable(table), scope);
  const total = Math.max(subtotal + Number(payment.serviceFee || 0) - Number(payment.discount || 0), 0);
  const splitCount = Math.max(Number(payment.paymentSplitCount || 1), 1);
  const generatedAt = new Date().toLocaleString('pt-BR');

  const metricsHtml = `
    <div class="grid g4">
      <div class="metric"><span>Mesa/Comanda</span><b>${htmlAttr(table)}</b></div>
      <div class="metric"><span>Pedidos</span><b>${openOrders.length}</b></div>
      <div class="metric"><span>Subtotal</span><b>${money(subtotal)}</b></div>
      <div class="metric"><span>Divisão</span><b>${splitCount}x de ${money(total / splitCount)}</b></div>
    </div>
  `;

  const bodyHtml = `
    <h2>Itens consumidos</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>
          ${openOrders.flatMap((order) => (order.items || []).map((item) => `
            <tr>
              <td>${htmlAttr(item.name)}${item.note ? `<br><small>${htmlAttr(item.note)}</small>` : ''}</td>
              <td>${Number(item.qty || 1)}</td>
              <td>${money(itemUnitPrice(item))}</td>
              <td>${money(itemLineTotal(item))}</td>
            </tr>
          `)).join('')}
        </tbody>
      </table>
    </div>

    <div class="grid g2" style="margin-top:18px">
      <div class="metric"><span>Taxa de serviço</span><b>${money(payment.serviceFee)}</b></div>
      <div class="metric"><span>Desconto</span><b>${money(payment.discount)}</b></div>
    </div>

    ${payment.paymentNote ? `<p class="pdf-print-note">${htmlAttr(payment.paymentNote)}</p>` : ''}

    <div class="pdf-print-total">
      <span>Total da pré-conta</span>
      <b>${money(total)}</b>
    </div>
  `;

  return openReportPrintDocument({
    documentTitle: `Pré-conta ${table}`,
    heading: 'Pré-conta Quintal do Zé',
    subtitle: `Mesa/comanda • ${generatedAt}`,
    details: `Documento para conferência antes do pagamento`,
    metricsHtml,
    bodyHtml,
    referenceLabel: 'Mesa',
    referenceText: table,
    blockedMessage: 'Permita pop-ups para imprimir a pré-conta.',
  });
};

function cashSessionPanel(info, scope) {
  const current = info?.current;
  const recent = info?.sessions || [];

  if (!current) {
    return `
      <details class="panel cash-session-panel operation-details">
        <summary class="operation-summary">
          <div>
            <h3>Controle do caixa</h3>
            <p>Abra o caixa, registre sangria/suprimento e feche o dia quando precisar.</p>
          </div>
          <span class="badge warn">Caixa fechado</span>
        </summary>

        <div class="operation-details-body">
          <div class="cash-session-grid">
            <label>Dinheiro inicial
              <input id="${scope}CashOpening" type="number" min="0" step="0.01" placeholder="Ex: 200.00">
            </label>
            <label>Observação
              <input id="${scope}CashOpeningNote" placeholder="Opcional">
            </label>
            <button class="primary" type="button" onclick="openCashSession('${scope}')">Abrir caixa</button>
          </div>

          ${recent.length ? `<p class="table-picker-note">Último caixa: ${recent[0].status === 'closed' ? 'fechado' : 'aberto'} em ${dateTime(recent[0].openedAt)}</p>` : ''}
        </div>
      </details>
    `;
  }

  const entries = current.entries || [];
  const supplies = entries.filter((entry) => entry.type === 'suprimento').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const withdrawals = entries.filter((entry) => entry.type === 'sangria').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return `
    <details class="panel cash-session-panel operation-details">
      <summary class="operation-summary">
        <div>
          <h3>Controle do caixa</h3>
          <p>Aberto em ${dateTime(current.openedAt)}. Use somente para sangria, suprimento ou fechamento do dia.</p>
        </div>
        <span class="badge ok">Aberto</span>
      </summary>

      <div class="operation-details-body">
        <div class="grid g4">
          <div class="metric"><span>Dinheiro inicial</span><b>${money(current.openingAmount)}</b></div>
          <div class="metric"><span>Suprimentos</span><b>${money(supplies)}</b></div>
          <div class="metric"><span>Sangrias</span><b>${money(withdrawals)}</b></div>
          <div class="metric"><span>Movimentações</span><b>${entries.length}</b></div>
        </div>

        <div class="cash-session-grid" style="margin-top:14px">
          <label>Tipo
            <select id="${scope}CashEntryType">
              <option value="suprimento">Suprimento</option>
              <option value="sangria">Sangria</option>
            </select>
          </label>
          <label>Valor
            <input id="${scope}CashEntryAmount" type="number" min="0" step="0.01" placeholder="Ex: 50.00">
          </label>
          <label>Motivo
            <input id="${scope}CashEntryNote" placeholder="Opcional">
          </label>
          <button class="soft" type="button" onclick="addCashSessionEntry('${scope}')">Registrar</button>
        </div>

        <div class="cash-session-grid" style="margin-top:14px">
          <label>Dinheiro contado no caixa
            <input id="${scope}CashCounted" type="number" min="0" step="0.01" placeholder="Valor contado">
          </label>
          <label>Observação de fechamento
            <input id="${scope}CashCloseNote" placeholder="Opcional">
          </label>
          <button class="danger" type="button" onclick="closeCashSession('${scope}')">Fechar caixa</button>
        </div>
      </div>
    </details>
  `;
}

function cashSessionOpenBody(scope) {
  return {
    openingAmount: Number(document.getElementById(`${scope}CashOpening`)?.value || 0),
    note: document.getElementById(`${scope}CashOpeningNote`)?.value || '',
  };
}

function cashSessionEntryBody(scope) {
  return {
    type: document.getElementById(`${scope}CashEntryType`)?.value || 'suprimento',
    amount: Number(document.getElementById(`${scope}CashEntryAmount`)?.value || 0),
    note: document.getElementById(`${scope}CashEntryNote`)?.value || '',
  };
}

function cashSessionCloseBody(scope) {
  return {
    countedCash: Number(document.getElementById(`${scope}CashCounted`)?.value || 0),
    note: document.getElementById(`${scope}CashCloseNote`)?.value || '',
  };
}

function advancedReportHtml({ orders, reportDate, cashSessions = [], activityLog = [] }) {
  const paidOrders = orders.filter((order) => order.paid && localDateValue(order.paidAt || order.createdAt) === reportDate);
  const canceledOrders = orders.filter((order) => order.status === 'cancelado' && localDateValue(order.canceledAt || order.createdAt) === reportDate);
  const waiterStats = {};
  const productRevenue = {};

  paidOrders.forEach((order) => {
    const waiter = order.waiter || 'Não informado';
    if (!waiterStats[waiter]) waiterStats[waiter] = { count: 0, total: 0 };
    waiterStats[waiter].count += 1;
    waiterStats[waiter].total += orderFinalTotal(order);

    (order.items || []).forEach((item) => {
      const name = item.name || 'Item';
      if (!productRevenue[name]) productRevenue[name] = { qty: 0, total: 0 };
      productRevenue[name].qty += Number(item.qty || 1);
      productRevenue[name].total += itemLineTotal(item);
    });
  });

  const waiterRows = Object.entries(waiterStats).sort((a, b) => b[1].total - a[1].total);
  const productRows = Object.entries(productRevenue).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  const sessionRows = cashSessions.filter((session) => session.date === reportDate);

  return `
    <h2>Vendas por garçom</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Garçom</th><th>Pedidos</th><th>Total</th></tr></thead>
        <tbody>
          ${waiterRows.length ? waiterRows.map(([waiter, data]) => `<tr><td>${htmlAttr(waiter)}</td><td>${data.count}</td><td>${money(data.total)}</td></tr>`).join('') : '<tr><td colspan="3">Sem vendas por garçom nesta data.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2>Produtos por faturamento</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Produto</th><th>Qtd.</th><th>Total</th></tr></thead>
        <tbody>
          ${productRows.length ? productRows.map(([name, data]) => `<tr><td>${htmlAttr(name)}</td><td>${data.qty}</td><td>${money(data.total)}</td></tr>`).join('') : '<tr><td colspan="3">Sem produtos pagos nesta data.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2>Cancelamentos</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Mesa</th><th>Pedido</th><th>Motivo</th><th>Data</th></tr></thead>
        <tbody>
          ${canceledOrders.length ? canceledOrders.map((order) => `<tr><td>${htmlAttr(order.table)}</td><td>#${order.id}</td><td>${htmlAttr(order.cancelReason || '-')}</td><td>${dateTime(order.canceledAt || order.createdAt)}</td></tr>`).join('') : '<tr><td colspan="4">Nenhum cancelamento nesta data.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2>Caixa do dia</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Status</th><th>Inicial</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead>
        <tbody>
          ${sessionRows.length ? sessionRows.map((session) => `<tr><td>${session.status === 'closed' ? 'Fechado' : 'Aberto'}</td><td>${money(session.openingAmount)}</td><td>${session.expectedCash === null ? '-' : money(session.expectedCash)}</td><td>${session.countedCash === null ? '-' : money(session.countedCash)}</td><td>${session.difference === null ? '-' : money(session.difference)}</td></tr>`).join('') : '<tr><td colspan="5">Nenhum caixa aberto nesta data.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2>Histórico recente</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Horário</th><th>Ação</th><th>Tipo</th></tr></thead>
        <tbody>
          ${activityLog.length ? activityLog.slice(0, 12).map((entry) => `<tr><td>${dateTime(entry.createdAt)}</td><td>${htmlAttr(entry.message)}</td><td>${htmlAttr(entry.type)}</td></tr>`).join('') : '<tr><td colspan="3">Sem histórico nesta data.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function openReportPrintDocument({
  documentTitle,
  heading,
  subtitle,
  details = '',
  metricsHtml = '',
  bodyHtml = '',
  footerLeft = 'Quintal do Zé',
  footerRight = 'Documento gerado pelo sistema de pedidos.',
  referenceLabel = 'Documento',
  referenceText = documentTitle,
  blockedMessage = 'Permita pop-ups para gerar o PDF.',
}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast(blockedMessage);
    return false;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base href="${window.location.origin}/">
      <title>${documentTitle}</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        @page { size: A4; margin: 12mm; }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          color: #171511;
          background: #f4ead3;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .pdf-print-shell {
          min-height: 100vh;
          padding: 28px;
          background:
            radial-gradient(circle at 8% 2%, rgba(246,196,0,.28), transparent 30%),
            linear-gradient(180deg, #fff8e6 0%, #f6edd6 54%, #fffaf0 100%);
        }

        .pdf-print-shell .report-page {
          margin: 0 auto;
          max-width: 980px;
          padding: 28px;
          border: 1px solid rgba(185,146,31,.22);
          border-radius: 28px;
          background:
            radial-gradient(circle at 0% 0%, rgba(246,196,0,.18), transparent 28%),
            rgba(255,250,238,.92);
          box-shadow: 0 24px 70px rgba(72,54,16,.14);
        }

        .pdf-print-shell .report-head {
          display: grid;
          grid-template-columns: 88px minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
          margin: 0 0 22px;
          padding: 20px;
          border: 1px solid rgba(246,196,0,.3);
          border-radius: 24px;
          color: #fff7d7;
          background:
            radial-gradient(circle at 14% 18%, rgba(246,196,0,.23), transparent 28%),
            linear-gradient(135deg, #11100d, #1b1710 70%, #0a0a0a);
          box-shadow: 0 16px 38px rgba(26,18,6,.22);
        }

        .pdf-print-shell .report-head img {
          width: 88px;
          height: 88px;
          object-fit: cover;
          border-radius: 22px;
          border: 2px solid rgba(246,196,0,.65);
          background: #f6c400;
          box-shadow: 0 12px 24px rgba(0,0,0,.28);
        }

        .pdf-print-shell .report-head h1 {
          margin: 8px 0 8px;
          color: #fff4c2;
          font-size: 29px;
          line-height: 1;
          letter-spacing: -.04em;
        }

        .pdf-print-kicker {
          display: inline-flex;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          color: #1b1607;
          background: linear-gradient(135deg, #f6c400, #ffdf57);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .pdf-print-shell .report-head p,
        .pdf-print-shell .muted {
          color: #dfd2ad;
        }

        .pdf-print-reference {
          min-width: 126px;
          padding: 12px 14px;
          border: 1px solid rgba(246,196,0,.28);
          border-radius: 18px;
          text-align: right;
          background: rgba(255,255,255,.06);
        }

        .pdf-print-reference span {
          display: block;
          color: #cfc3a4;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .pdf-print-reference b {
          display: block;
          margin-top: 4px;
          color: #f6c400;
          font-size: 15px;
          line-height: 1.15;
        }

        .pdf-print-shell .grid {
          gap: 12px;
        }

        .pdf-print-shell .grid.g4 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .pdf-print-info-grid {
          margin-top: 18px;
          margin-bottom: 18px;
        }

        .pdf-print-shell .metric {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          min-height: 58px;
          color: #171511;
          background: rgba(255,246,218,.78);
          border: 1px solid rgba(156,122,28,.26);
          border-radius: 16px;
          padding: 10px 14px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
        }

        .pdf-print-shell .metric span {
          display: block;
          margin-bottom: 6px;
          color: #6f6041;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .pdf-print-shell .metric b,
        .pdf-print-shell .price {
          color: #1c1c1c;
          font-size: 15px;
        }

        .pdf-print-shell h2 {
          margin: 18px 0 12px;
          color: #1c1c1c;
          font-size: 23px;
          letter-spacing: -.03em;
        }

        .pdf-print-shell .table-wrap {
          overflow: hidden;
          border: 1px solid rgba(156,122,28,.23);
          border-radius: 18px;
          background: rgba(255,255,255,.72);
        }

        .pdf-print-shell .table {
          width: 100%;
          min-width: 0;
          border-collapse: collapse;
        }

        .pdf-print-shell .table th {
          color: #171511;
          background: linear-gradient(135deg, #f6c400, #ffda45);
          border-bottom: 1px solid #deb107;
          font-size: 11px;
          text-transform: uppercase;
        }

        .pdf-print-shell .table td {
          color: #1c1c1c;
          border-bottom: 1px solid rgba(156,122,28,.17);
          background: rgba(255,255,255,.5);
        }

        .pdf-print-shell .table tr:last-child td {
          border-bottom: 0;
        }

        .pdf-print-note {
          margin: 18px 0 0;
          padding: 14px 16px;
          border-left: 5px solid #f6c400;
          border-radius: 16px;
          background: rgba(255,246,218,.86);
          color: #4d4636;
          line-height: 1.45;
        }

        .pdf-print-total {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 20px;
          margin-top: 18px;
          padding: 18px 22px;
          border-radius: 18px;
          color: #fff7d7;
          background:
            radial-gradient(circle at 18% 0%, rgba(246,196,0,.22), transparent 26%),
            linear-gradient(135deg, #11100d, #1b1710 72%, #0a0a0a);
          border: 1px solid rgba(246,196,0,.25);
          box-shadow: 0 14px 28px rgba(33,24,8,.16);
        }

        .pdf-print-total span {
          color: #e7dcc2;
          font-weight: 850;
        }

        .pdf-print-total b {
          color: #f6c400;
          font-size: 30px;
        }

        .pdf-print-footer {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          color: #7b6d51;
          font-size: 12px;
        }

        @media print {
          .pdf-print-shell {
            min-height: auto;
            padding: 0;
            background: #fffaf0;
          }

          .pdf-print-shell .report-page {
            max-width: none;
            padding: 0;
            border: 0;
            border-radius: 0;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <main class="pdf-print-shell">
        <section class="report-page">
          <div class="report-head">
            <img src="/assets/logo.jpg" alt="Logo Quintal do Zé">
            <div>
              <span class="pdf-print-kicker">${subtitle}</span>
              <h1>${heading}</h1>
              ${details ? `<p class="muted">${details}</p>` : ''}
            </div>
            <div class="pdf-print-reference">
              <span>${referenceLabel}</span>
              <b>${referenceText}</b>
            </div>
          </div>

          ${metricsHtml}
          ${bodyHtml}

          <div class="pdf-print-footer">
            <span>${footerLeft}</span>
            <span>${footerRight}</span>
          </div>
        </section>
      </main>
      <script>
        let printed = false;
        const startPrint = () => {
          if (printed) return;
          printed = true;
          window.focus();
          setTimeout(() => window.print(), 350);
        };
        const logo = document.querySelector('.report-head img');
        const stylesheet = document.querySelector('link[rel="stylesheet"]');
        let pending = 0;
        const done = () => {
          pending -= 1;
          if (pending <= 0) startPrint();
        };
        if (stylesheet) {
          pending += 1;
          stylesheet.addEventListener('load', done, { once: true });
          stylesheet.addEventListener('error', done, { once: true });
        }
        if (logo && !logo.complete) {
          pending += 1;
          logo.addEventListener('load', done, { once: true });
          logo.addEventListener('error', done, { once: true });
        }
        if (!pending) startPrint();
        setTimeout(() => {
          if (pending > 0) startPrint();
        }, 900);
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
  return true;
}

function printVisibleReportDocument() {
  const report = document.querySelector('.report-page');
  if (!report) {
    toast('Relatório não encontrado.');
    return false;
  }

  const clone = report.cloneNode(true);
  const head = clone.querySelector('.report-head');
  const heading = head?.querySelector('h1')?.textContent || 'Relatório Quintal do Zé';
  const paragraphs = Array.from(head?.querySelectorAll('p') || []);
  const subtitle = paragraphs[0]?.textContent || new Date().toLocaleDateString('pt-BR');
  const details = paragraphs.slice(1).map((item) => item.textContent).filter(Boolean).join(' • ');

  if (head) head.remove();

  return openReportPrintDocument({
    documentTitle: heading,
    heading,
    subtitle,
    details,
    referenceLabel: 'Relatório',
    referenceText: 'Fechamento',
    bodyHtml: clone.innerHTML,
    blockedMessage: 'Permita pop-ups para imprimir o relatório.',
  });
}

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('qz_user') || 'null');
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem('qz_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('qz_user');
  location.href = '/';
}

function toast(message) {
  const element = document.getElementById('toast');

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => element.classList.remove('show'), 2400);
}

function roleLabel(role) {
  return txt(`funcoes.${role}`, role);
}

function statusLabel(status) {
  return txt(`status.${status}`, status);
}

const ROLE_HOME_ROUTES = {
  admin: '/admin.html',
  garcom: '/garcom.html',
  cozinha: '/cozinha.html',
  caixa: '/caixa.html',
};

function isAdmin(user = currentUser()) {
  return user?.role === 'admin';
}

function roleHomeRoute(role) {
  return ROLE_HOME_ROUTES[role] || '/';
}

function canAccessRoles(roles, user = currentUser()) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return roles.includes(user.role);
}

function requireRole(roles) {
  const user = currentUser();

  if (!user) {
    location.href = '/';
    return null;
  }

  if (!canAccessRoles(roles, user)) {
    location.href = roleHomeRoute(user.role);
    return null;
  }

  setText('userName', user.name || user.email);
  setText('userRole', roleLabel(user.role));

  const logoutButton = document.getElementById('logout');
  if (logoutButton) {
    logoutButton.textContent = txt('menu.sair', 'Sair');
    logoutButton.onclick = logout;
  }

  return user;
}

function setupNav(items) {
  const nav = document.getElementById('sideNav');
  if (!nav) return;

  const user = currentUser();

  nav.innerHTML = items
    .filter((item) => !item.roles || canAccessRoles(item.roles, user))
    .map((item) => {
      const label = item.labelKey ? txt(item.labelKey, item.label || '') : item.label;

      if (item.type === 'group') {
        return `<span class="nav-group">${label}</span>`;
      }

      if (item.type === 'button') {
        return `<button type="button" class="${item.active ? 'active' : ''}" data-tab="${item.tab}">${label}</button>`;
      }

      return `<a class="${item.active ? 'active' : ''}" href="${item.href}">${label}</a>`;
    })
    .join('');
}

function isEmbeddedView() {
  return new URLSearchParams(location.search).get('embed') === '1';
}

function applyMobileLayoutClass() {
  if (isEmbeddedView()) {
    document.documentElement.classList.remove('mobile-layout');
    return;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const screenWidth = Number(window.screen?.width || 0);
  const screenHeight = Number(window.screen?.height || 0);
  const smallestScreenSide = Math.min(screenWidth || viewportWidth, screenHeight || viewportWidth);
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // iPhone/iPad podem reportar viewport "desktop" em alguns cenários.
  const touchDeviceWithWideViewport = coarsePointer && smallestScreenSide <= 1366;
  const shouldUseMobileLayout = viewportWidth <= 1100 || touchDeviceWithWideViewport;

  document.documentElement.classList.toggle('mobile-layout', shouldUseMobileLayout);
}

document.addEventListener('DOMContentLoaded', () => {
  applyMobileLayoutClass();
  window.addEventListener('resize', applyMobileLayoutClass, { passive: true });
  window.addEventListener('orientationchange', applyMobileLayoutClass);

  const appShell = document.querySelector('.app-shell');
  if (appShell) {
    document.body.classList.add('app-layout');
  } else {
    document.body.classList.remove('app-layout');
  }

  if (isEmbeddedView()) {
    document.body.classList.add('embedded-app');
    return;
  }

  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const dev = document.createElement('div');
  dev.className = 'dev-sidebar';
  dev.innerHTML = 'Desenvolvido por <b>KavCode</b>';

  sidebar.appendChild(dev);
});
