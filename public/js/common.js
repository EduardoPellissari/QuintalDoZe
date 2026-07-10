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
        @page { size: A4; margin: 14mm; }

        body {
          margin: 0;
          background: #fff;
          color: #1c1c1c;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .pdf-print-shell {
          padding: 28px;
          background: #fff;
        }

        .pdf-print-shell .report-page {
          margin: 0 auto;
          max-width: 980px;
          box-shadow: none;
        }

        .pdf-print-shell .report-head {
          border-bottom: 2px solid #eee;
        }

        .pdf-print-shell .report-head h1 {
          color: #1c1c1c;
          margin: 0 0 8px;
        }

        .pdf-print-shell .report-head p,
        .pdf-print-shell .muted {
          color: #666;
        }

        .pdf-print-shell .metric {
          color: #1c1c1c;
        }

        .pdf-print-shell .metric span {
          color: #666;
          font-weight: 800;
        }

        .pdf-print-shell .metric b,
        .pdf-print-shell .price {
          color: #1c1c1c;
        }

        .pdf-print-shell .table {
          min-width: 0;
        }

        .pdf-print-shell .table th {
          color: #1c1c1c;
          background: #f6c400;
          border-bottom-color: #e2b600;
        }

        .pdf-print-shell .table td {
          color: #1c1c1c;
          border-bottom-color: #eee;
        }

        .pdf-print-note {
          margin: 18px 0 0;
          padding: 14px 16px;
          border-left: 5px solid #f6c400;
          border-radius: 14px;
          background: #fff9df;
          color: #4d4636;
          line-height: 1.45;
        }

        .pdf-print-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-top: 18px;
          padding: 18px;
          border-radius: 18px;
          background: #fafafa;
          border: 1px solid #eee;
        }

        .pdf-print-total span {
          color: #666;
          font-weight: 900;
          text-transform: uppercase;
          font-size: 12px;
        }

        .pdf-print-total b {
          color: #1c1c1c;
          font-size: 30px;
        }

        .pdf-print-footer {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          color: #666;
          font-size: 12px;
        }

        @media print {
          .pdf-print-shell { padding: 0; }
          .pdf-print-shell .report-page { max-width: none; }
        }
      </style>
    </head>
    <body>
      <main class="pdf-print-shell">
        <section class="report-page">
          <div class="report-head">
            <div>
              <h1>${heading}</h1>
              <p>${subtitle}</p>
              ${details ? `<p class="muted">${details}</p>` : ''}
            </div>
            <img src="/assets/logo.jpg" alt="Logo Quintal do Zé">
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
