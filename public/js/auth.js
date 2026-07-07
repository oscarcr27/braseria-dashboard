// public/js/auth.js
// Módulo de autenticación — se carga antes que app.js

const Auth = (() => {
  const TOKEN_KEY   = 'braseria_token';
  const USER_KEY    = 'braseria_usuario';
  const PERMS_KEY   = 'braseria_permisos';

  function getToken()    { return sessionStorage.getItem(TOKEN_KEY); }
  function getUsuario()  { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; } }
  function getPermisos() { try { return JSON.parse(sessionStorage.getItem(PERMS_KEY)) || []; } catch { return []; } }

  function tienePerm(p)  { return getPermisos().includes(p); }
  function esAdmin()     { return getUsuario()?.rol === 'admin'; }

  function guardar(data) {
    sessionStorage.setItem(TOKEN_KEY,  data.token);
    sessionStorage.setItem(USER_KEY,   JSON.stringify(data.usuario));
    sessionStorage.setItem(PERMS_KEY,  JSON.stringify(data.permisos));
  }

  function cerrarSesion() {
    const token = getToken();
    if (token) {
      fetch('/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
    }
    sessionStorage.clear();
    window.location.href = '/login.html';
  }

  // Verificar sesión al cargar cualquier página protegida
  async function verificar() {
    const token = getToken();
    if (!token) { window.location.href = '/login.html'; return false; }

    try {
      const res  = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      const json = await res.json();
      if (!json.ok) throw new Error('inválido');
      // Actualizar datos de usuario en sesión
      sessionStorage.setItem(USER_KEY,  JSON.stringify(json.data));
      sessionStorage.setItem(PERMS_KEY, JSON.stringify(json.data.permisos));
      return true;
    } catch {
      sessionStorage.clear();
      window.location.href = '/login.html';
      return false;
    }
  }

  return { getToken, getUsuario, getPermisos, tienePerm, esAdmin, guardar, cerrarSesion, verificar };
})();
