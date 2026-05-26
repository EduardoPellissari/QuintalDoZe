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


document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const dev = document.createElement('div');
  dev.className = 'dev-sidebar';
  dev.innerHTML = 'Desenvolvido por <b>Eduardo</b>';

  sidebar.appendChild(dev);
});