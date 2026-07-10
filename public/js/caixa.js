/* ==================================================
   TELA DO CAIXA
   Textos editáveis em: public/js/textos.js
   ================================================== */

requireRole(['caixa', 'admin']);

setupNav([
  { type: 'button', tab: 'cash', labelKey: 'menu.caixa', active: true },
  { type: 'button', tab: 'reports', labelKey: 'menu.relatorios' },
]);

setText('areaSmall', txt('caixa.area', 'Área do caixa'));
setText('pageTitle', txt('caixa.titulo', 'Caixa'));
setText('pageSub', txt('caixa.subtitulo', 'Fechamento e relatórios.'));

document.getElementById('sideNav').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;

  document.querySelectorAll('nav button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');

  if (button.dataset.tab === 'reports') reports();
  else cash();
});

async function cash() {
  const orders = await API.get('/api/orders');
  const openOrders = orders.filter((order) => !order.paid && order.status !== 'cancelado');

  document.getElementById('content').innerHTML = `
    <section class="panel">
      <h3>${txt('caixa.pedidosAbertos', 'Pedidos em aberto')}</h3>
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
        <button class="primary" onclick="pay(${order.id})">${txt('pedidos.marcarPago', 'Marcar como pago')}</button>
        <button class="danger" onclick="cancelOrder(${order.id})">${txt('pedidos.cancelar', 'Cancelar')}</button>
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

async function reports() {
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

  document.getElementById('content').innerHTML = `
    <button class="primary print-btn" onclick="printVisibleReportDocument()">${txt('relatorios.botaoPdf', 'Salvar/Imprimir PDF')}</button>

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

async function pay(id) {
  await API.put('/api/orders/' + id + '/pay', {});
  toast(txt('pedidos.pedidoPago', 'Pedido pago.'));
  cash();
}

async function cancelOrder(id) {
  if (!confirm(txt('pedidos.confirmarCancelar', 'Cancelar pedido?'))) return;
  await API.put('/api/orders/' + id + '/status', { status: 'cancelado' });
  toast(txt('pedidos.pedidoCancelado', 'Pedido cancelado.'));
  cash();
}

window.pay = pay;
window.cancelOrder = cancelOrder;
cash();
