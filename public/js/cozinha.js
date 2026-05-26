/* ==================================================
   TELA DA COZINHA
   Textos editáveis em: public/js/textos.js
   Layout atualizado: colunas por status + prioridade automática por tempo + filtro diário
   ================================================== */

requireRole(['cozinha', 'admin']);

setupNav([{ href: '/cozinha.html', labelKey: 'menu.cozinha', active: true }]);

setText('areaSmall', txt('cozinha.area', 'Área da cozinha'));
setText('pageTitle', txt('cozinha.titulo', 'Fila da cozinha'));
setText('pageSub', txt('cozinha.subtitulo', 'Acompanhe e atualize o preparo dos pedidos.'));

let lastIds = new Set();
let soundEnabled = false;
let activeTab = 'pendente';
let urgentNotifiedIds = new Set();

const kitchenTabs = [
  {
    key: 'pendente',
    icon: '🟡',
    title: txt('cozinha.abaNovos', 'Novos pedidos'),
    subtitle: txt('cozinha.abaNovosSub', 'Pedidos recém-enviados'),
    emptyTitle: txt('cozinha.vazioNovosTitulo', 'Nenhum pedido novo'),
    emptyText: txt('cozinha.vazioNovosTexto', 'Quando o garçom enviar uma nova comanda, ela aparecerá aqui.'),
  },
  {
    key: 'preparando',
    icon: '🔵',
    title: txt('cozinha.abaPreparo', 'Em preparo'),
    subtitle: txt('cozinha.abaPreparoSub', 'Pedidos sendo preparados'),
    emptyTitle: txt('cozinha.vazioPreparoTitulo', 'Nada em preparo'),
    emptyText: txt('cozinha.vazioPreparoTexto', 'Os pedidos iniciados pela cozinha ficam nesta aba.'),
  },
  {
    key: 'pronto',
    icon: '🟢',
    title: txt('cozinha.abaProntos', 'Prontos'),
    subtitle: txt('cozinha.abaProntosSub', 'Pedidos prontos para retirada'),
    emptyTitle: txt('cozinha.vazioProntosTitulo', 'Nenhum pedido pronto'),
    emptyText: txt('cozinha.vazioProntosTexto', 'Assim que um pedido for marcado como pronto, ele aparecerá aqui.'),
  },
];

function playTone(frequency = 880, duration = 180, volume = 0.08) {
  if (!soundEnabled) return;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.start();

  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, duration);
}

function beep() {
  playTone(880, 180, 0.08);
}

function urgentBeep() {
  playTone(520, 140, 0.09);
  setTimeout(() => playTone(520, 140, 0.09), 210);
}

function orderByTime(orders) {
  return [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getCounts(orders) {
  return {
    pendente: orders.filter((order) => order.status === 'pendente').length,
    preparando: orders.filter((order) => order.status === 'preparando').length,
    pronto: orders.filter((order) => order.status === 'pronto').length,
  };
}

function getActiveTabInfo() {
  return kitchenTabs.find((tab) => tab.key === activeTab) || kitchenTabs[0];
}

function getMinutesWaiting(createdAt) {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  return Math.max(minutes, 0);
}


function getPriority(order) {
  const minutes = getMinutesWaiting(order.createdAt);

  if (order.status === 'pendente') {
    if (minutes >= 20) return { level: 'urgent', label: 'Prioridade alta', text: 'Pedido aguardando há muito tempo' };
    if (minutes >= 10) return { level: 'attention', label: 'Atenção', text: 'Pedido precisa ser iniciado' };
  }

  if (order.status === 'preparando') {
    if (minutes >= 30) return { level: 'urgent', label: 'Atrasado', text: 'Pedido em preparo há muito tempo' };
    if (minutes >= 15) return { level: 'attention', label: 'Atenção', text: 'Verificar andamento' };
  }

  if (order.status === 'pronto') {
    if (minutes >= 15) return { level: 'attention', label: 'Retirar', text: 'Pedido pronto aguardando retirada' };
  }

  return { level: 'normal', label: 'Normal', text: 'Dentro do tempo esperado' };
}

function priorityScore(order) {
  const priority = getPriority(order);
  const levelWeight = { urgent: 3, attention: 2, normal: 1 };
  return levelWeight[priority.level] || 1;
}

function orderByPriority(orders) {
  return [...orders].sort((a, b) => {
    const scoreDiff = priorityScore(b) - priorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function waitingLabel(createdAt) {
  const seconds = Math.max(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000), 0);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (minutes < 60) return restSeconds ? `${minutes}min ${restSeconds}s` : `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}min` : `${hours}h`;
}

function timerTitle(order) {
  const priority = getPriority(order);
  if (priority.level === 'urgent') return 'ATRASADO';
  if (priority.level === 'attention') return 'ATENÇÃO';
  return 'NO PRAZO';
}

function isToday(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function isKitchenVisibleToday(order) {
  return (
    isToday(order.createdAt) &&
    order.status !== 'cancelado' &&
    order.status !== 'entregue'
  );
}

async function render() {
  const allOrders = await API.get('/api/orders');
  const orders = orderByTime(allOrders.filter(isKitchenVisibleToday));

  const ids = new Set(orders.map((order) => order.id));

  if (lastIds.size && orders.some((order) => !lastIds.has(order.id))) {
    beep();

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(txt('cozinha.novoPedidoTitulo', 'Novo pedido'), {
        body: txt('cozinha.novoPedidoTexto', 'Pedido enviado para a cozinha.'),
      });
    }
  }

  const urgentOrders = orders.filter((order) => getPriority(order).level === 'urgent');
  const currentUrgentIds = new Set(urgentOrders.map((order) => order.id));
  const newUrgentOrder = urgentOrders.find((order) => !urgentNotifiedIds.has(order.id));

  if (newUrgentOrder) {
    urgentBeep();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pedido atrasado', {
        body: `Mesa/Comanda ${newUrgentOrder.table} entrou em prioridade crítica.`,
      });
    }
  }

  urgentNotifiedIds = currentUrgentIds;
  lastIds = ids;

  const counts = getCounts(orders);
  const pendentes = orderByPriority(orders.filter((order) => order.status === 'pendente'));
  const preparando = orderByPriority(orders.filter((order) => order.status === 'preparando'));
  const prontos = orderByPriority(orders.filter((order) => order.status === 'pronto'));

  document.getElementById('content').innerHTML = `
    <section class="kitchen-dashboard kitchen-pro-dashboard">
      <div class="kitchen-pro-header">
        <div>
          <span class="kitchen-live-pill">
            <span class="dot"></span>
            ${txt('cozinha.painelAoVivo', 'Painel ao vivo')}
          </span>
          <h2>${txt('cozinha.painelTitulo', 'Painel da cozinha')}</h2>
          <p class="muted">${txt('cozinha.atualizacao', 'Contador ao vivo com prioridade automática por tempo.')}</p>
        </div>

        <div class="kitchen-toolbar-actions">
          <button class="soft" id="soundBtn">${soundEnabled ? txt('cozinha.somAtivo', 'Som ativo') : txt('cozinha.ativarSom', 'Ativar som')}</button>
          <button class="soft" id="notBtn">${txt('cozinha.permitirNotificacao', 'Permitir notificação')}</button>
          <button class="soft danger-outline" id="closeDayBtn">Encerrar dia</button>
        </div>
      </div>

      <div class="kitchen-status-tabs kitchen-summary-tabs">
        ${kitchenTabs.map((tab) => tabSummary(tab, counts[tab.key])).join('')}
      </div>

      <section class="kitchen-board">
        <div class="kitchen-column kitchen-column-new">
          <div class="column-header">
            <div>
              <h3>🟡 ${txt('cozinha.abaNovos', 'Novos pedidos')}</h3>
              <p class="muted">${txt('cozinha.abaNovosSub', 'Pedidos recém-enviados')}</p>
            </div>
            <strong>${pendentes.length}</strong>
          </div>
          <div class="orders-list">
            ${pendentes.length ? pendentes.map(card).join('') : emptyColumn('Nenhum pedido novo')}
          </div>
        </div>

        <div class="kitchen-column kitchen-column-preparing">
          <div class="column-header">
            <div>
              <h3>🔵 ${txt('cozinha.abaPreparo', 'Em preparo')}</h3>
              <p class="muted">${txt('cozinha.abaPreparoSub', 'Pedidos sendo preparados')}</p>
            </div>
            <strong>${preparando.length}</strong>
          </div>
          <div class="orders-list">
            ${preparando.length ? preparando.map(card).join('') : emptyColumn('Nada em preparo')}
          </div>
        </div>

        <div class="kitchen-column kitchen-column-ready">
          <div class="column-header">
            <div>
              <h3>🟢 ${txt('cozinha.abaProntos', 'Prontos')}</h3>
              <p class="muted">${txt('cozinha.abaProntosSub', 'Pedidos prontos para retirada')}</p>
            </div>
            <strong>${prontos.length}</strong>
          </div>
          <div class="orders-list">
            ${prontos.length ? prontos.map(card).join('') : emptyColumn('Nenhum pedido pronto')}
          </div>
        </div>
      </section>
    </section>
  `;

  document.getElementById('soundBtn').onclick = () => {
    soundEnabled = true;
    toast(txt('cozinha.somAtivado', 'Som ativado.'));
    render();
  };

  document.getElementById('notBtn').onclick = () => {
    if ('Notification' in window) Notification.requestPermission();
  };

  document.getElementById('closeDayBtn').onclick = closeKitchenDay;
}

function tabSummary(tab, count) {
  return `
    <div class="kitchen-status-tab status-${tab.key}">
      <span class="tab-main">
        <span class="tab-icon">${tab.icon}</span>
        <span>
          <b>${tab.title}</b>
          <small>${tab.subtitle}</small>
        </span>
      </span>
      <span class="tab-count">${count}</span>
    </div>
  `;
}

function emptyColumn(message) {
  return `<div class="empty-column"><p>${message}</p></div>`;
}

function emptyState(tab) {
  return `
    <div class="panel empty-kitchen kitchen-pro-empty">
      <h3>${tab.emptyTitle}</h3>
      <p class="muted">${tab.emptyText}</p>
    </div>
  `;
}

function card(order) {
  const cls = 'status-' + order.status;
  const waiting = waitingLabel(order.createdAt);
  const priority = getPriority(order);

  return `
    <article class="kitchen-card kitchen-pro-card ${cls} priority-${priority.level}">
      <div class="kitchen-card-top">
        <div>
          <span class="kitchen-label">${txt('cozinha.mesaComanda', 'Mesa/Comanda')}</span>
          <h2>${order.table}</h2>
        </div>
        <div class="kitchen-card-badges">
          ${order.paid ? '<span class="paid-kitchen-badge">💰 PAGO</span>' : ''}
          <span class="timer-badge timer-${priority.level}">${timerTitle(order)}</span>
          <span class="kitchen-status">${statusLabel(order.status)}</span>
        </div>
      </div>

      <div class="priority-alert priority-${priority.level}">
        <strong>${priority.label}</strong>
        <span>${priority.text}</span>
      </div>

      <div class="kitchen-pro-time">
        <span>${txt('cozinha.horarioPedido', 'Entrada:')} <b>${dateTime(order.createdAt)}</b></span>
        <span class="time-chip live-time priority-${priority.level}">⏱ ${txt('cozinha.tempoFila', 'Tempo:')} ${waiting}</span>
      </div>

      <div class="kitchen-meta">
        <span>${txt('cozinha.garcom', 'Garçom:')} <b>${order.waiter}</b></span>
      </div>

      <ul class="kitchen-items">
        ${order.items.map((item) => `
          <li><strong>${item.qty}x</strong><span>${item.name}</span></li>
        `).join('')}
      </ul>

      ${order.notes ? `<div class="kitchen-notes"><b>${txt('cozinha.observacao', 'Obs:')}</b> ${order.notes}</div>` : ''}

      ${renderActions(order)}
    </article>
  `;
}

function renderActions(order) {
  if (order.status === 'pendente') {
    return `
      <div class="kitchen-actions single">
        <button class="primary" onclick="statusOrder(${order.id}, 'preparando')">
          ${txt('cozinha.botaoIniciarPreparo', 'Iniciar preparo')}
        </button>
      </div>
    `;
  }

  if (order.status === 'preparando') {
    return `
      <div class="kitchen-actions single">
        <button class="primary" onclick="statusOrder(${order.id}, 'pronto')">
          ${txt('cozinha.botaoPronto', 'Marcar como pronto')}
        </button>
      </div>
    `;
  }

  return `
    <div class="kitchen-ready-footer">
      <span>${txt('cozinha.prontoRetirada', 'Pedido pronto para retirada/fechamento.')}</span>
    </div>
  `;
}


async function closeKitchenDay() {
  const ok = confirm('Encerrar o dia da cozinha? Os pedidos ativos de hoje sairão da tela da cozinha, mas continuarão salvos nos relatórios e no caixa.');
  if (!ok) return;

  await API.post('/api/orders/close-day', {});
  toast('Dia encerrado. Cozinha limpa para o próximo ciclo.');
  render();
}

async function statusOrder(id, status) {
  await API.put('/api/orders/' + id + '/status', { status });
  toast(txt('cozinha.statusAtualizado', 'Status atualizado.'));
  render();
}

function changeKitchenTab(tab) {
  activeTab = tab;
  render();
}

window.statusOrder = statusOrder;
window.changeKitchenTab = changeKitchenTab;

render();
setInterval(render, 1000);
