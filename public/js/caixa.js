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

let cashReportDate = todayDateValue();
let selectedCashTable = '';

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
  const groups = groupOrdersByTable(openOrders);
  if (!selectedCashTable || !groups.some((group) => group.table === selectedCashTable)) {
    selectedCashTable = groups[0]?.table || '';
  }

  const occupiedTables = groups.length;
  const totalOpen = groups.reduce((sum, group) => sum + group.subtotal, 0);

  document.getElementById('content').innerHTML = `
    <section class="dashboard-cards">
      <div class="dash-card"><b>${openOrders.length}</b><span>Pedidos em aberto</span></div>
      <div class="dash-card"><b>${occupiedTables}</b><span>Mesas ocupadas</span></div>
      <div class="dash-card"><b>${money(totalOpen)}</b><span>Total em aberto</span></div>
    </section>

    <section class="panel">
      <div class="admin-form-head">
        <div>
          <h3>Mesas/comandas abertas</h3>
          <p>Escolha uma mesa para conferir os pedidos e fechar a conta.</p>
        </div>
        <span class="badge warn">${occupiedTables} mesa(s)</span>
      </div>

      ${tableSummaryCards(openOrders, selectedCashTable, 'selectCashTable')}
    </section>

    <section class="panel" style="margin-top:18px">
      <div class="admin-form-head">
        <div>
          <h3>Fechamento</h3>
          <p>Informe pagamento, taxa ou desconto apenas na hora de fechar a mesa.</p>
        </div>
        <span class="badge ok">Caixa</span>
      </div>

      ${tableCheckoutPanel(openOrders, selectedCashTable, 'cash', 'closeCashTable', 'cancelOrder', 'transferCashTable')}
    </section>
  `;

  bindPaymentControls('cash');
}

window.selectCashTable = (encoded) => {
  selectedCashTable = decodedTable(encoded);
  cash();
};

window.closeCashTable = async (encoded) => {
  const table = decodedTable(encoded);
  await API.post('/api/tables/pay', tablePaymentBodyFromControls(table, 'cash'));
  toast('Mesa/comanda fechada.');
  selectedCashTable = '';
  cash();
};

window.transferCashTable = async (encoded) => {
  const table = decodedTable(encoded);
  const body = tableTransferBodyFromControls(table, 'cash');
  if (!body.toTable.trim()) return toast('Informe a mesa/comanda de destino.');
  if (!confirm(`Mover/juntar a mesa ${body.fromTable} para ${body.toTable.trim()}?`)) return;
  await API.post('/api/tables/transfer', body);
  toast('Mesa/comanda movida.');
  selectedCashTable = body.toTable.trim();
  cash();
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

async function reports() {
  const orders = await API.get('/api/orders');
  const paidOrders = orders.filter((order) => order.paid && localDateValue(order.paidAt || order.createdAt) === cashReportDate);
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

  document.getElementById('content').innerHTML = `
    <div class="report-actions">
      <button class="primary print-btn" onclick="printVisibleReportDocument()">${txt('relatorios.botaoPdf', 'Salvar/Imprimir PDF')}</button>
      <label>Data do relatório
        <input id="cashReportDate" type="date" value="${cashReportDate}" onchange="setCashReportDate(this.value)">
      </label>
    </div>

    <section class="report-page" style="margin-top:16px">
      <div class="report-head">
        <div>
          <h1>${txt('relatorios.titulo', 'Relatório Quintal do Zé')}</h1>
          <p>${txt('relatorios.fechamento', 'Fechamento local')} • ${new Date(`${cashReportDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
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
    </section>
  `;
}

window.setCashReportDate = (value) => {
  cashReportDate = value || todayDateValue();
  reports();
};

async function cancelOrder(id) {
  if (!confirm(txt('pedidos.confirmarCancelar', 'Cancelar pedido?'))) return;
  const cancelReason = prompt('Informe o motivo do cancelamento:', '') || '';
  await API.put('/api/orders/' + id + '/status', { status: 'cancelado', cancelReason });
  toast(txt('pedidos.pedidoCancelado', 'Pedido cancelado.'));
  cash();
}

window.cancelOrder = cancelOrder;
cash();
