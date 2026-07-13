/* ==================================================
   TELA DE LOGIN
   Textos editáveis em: public/js/textos.js
   ================================================== */

setText('loginSystemName', txt('marca.sistemaLocal', 'Sistema local'));
setText('loginBrandName', txt('marca.nome', 'Quintal do Zé'));
setText('loginBrandText', txt('marca.sloganLogin', 'Acesso por perfil.'));
setText('loginTitle', txt('login.titulo', 'Entrar no sistema'));
setText('loginSubtitle', txt('login.subtitulo', 'Use seu perfil para acessar somente a área liberada.'));
setText('loginEmailLabel', txt('login.email', 'E-mail'));
setText('loginPasswordLabel', txt('login.senha', 'Senha'));
setText('loginButton', txt('login.botaoEntrar', 'Entrar'));
setText('loginAccessTitle', txt('login.acessosTitulo', 'Acessos iniciais'));
setText('loginAccessAdmin', txt('login.acessoAdmin', 'Admin: admin@quintaldoze.local / quintaldoze123'));
setText('loginAccessGarcom', txt('login.acessoGarcom', 'Garçom: garcom@quintaldoze.local / quintaldoze123'));
setText('loginAccessCozinha', txt('login.acessoCozinha', 'Cozinha: cozinha@quintaldoze.local / quintaldoze123'));
setText('loginAccessCaixa', txt('login.acessoCaixa', 'Caixa: caixa@quintaldoze.local / quintaldoze123'));

const lastLoginEmail = localStorage.getItem('qz_last_login_email') || '';
const lastLoginRole = localStorage.getItem('qz_last_login_role') || '';
const loginEmailInput = document.getElementById('loginEmail');

if (lastLoginEmail && loginEmailInput) {
  loginEmailInput.value = lastLoginEmail;
  setText('loginSubtitle', `Último acesso: ${lastLoginEmail}${lastLoginRole ? ` (${roleLabel(lastLoginRole)})` : ''}`);
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const msg = document.getElementById('loginMsg');
  msg.textContent = '';

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const user = await API.post('/api/login', { email, password });
    localStorage.setItem('qz_last_login_email', email);
    localStorage.setItem('qz_last_login_role', user.role || '');
    setUser(user);

    const routes = {
      admin: '/admin.html',
      garcom: '/garcom.html',
      cozinha: '/cozinha.html',
      caixa: '/caixa.html',
    };

    location.href = routes[user.role] || '/';
  } catch (err) {
    msg.textContent = err.message;
  }
});
