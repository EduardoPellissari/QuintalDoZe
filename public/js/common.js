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

function dateTime(value) {
  return new Date(value).toLocaleString('pt-BR');
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

function requireRole(roles) {
  const user = currentUser();

  if (!user) {
    location.href = '/';
    return null;
  }

  if (!roles.includes(user.role)) {
    const routes = {
      admin: '/admin.html',
      garcom: '/garcom.html',
      cozinha: '/cozinha.html',
      caixa: '/caixa.html',
    };

    location.href = routes[user.role] || '/';
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

  nav.innerHTML = items
    .map((item) => {
      const label = item.labelKey ? txt(item.labelKey, item.label || '') : item.label;

      if (item.type === 'button') {
        return `<button type="button" class="${item.active ? 'active' : ''}" data-tab="${item.tab}">${label}</button>`;
      }

      return `<a class="${item.active ? 'active' : ''}" href="${item.href}">${label}</a>`;
    })
    .join('');
}

function applyMobileLayoutClass() {
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

  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const dev = document.createElement('div');
  dev.className = 'dev-sidebar';
  dev.innerHTML = 'Desenvolvido por <b>KavCode</b>';

  sidebar.appendChild(dev);
});
