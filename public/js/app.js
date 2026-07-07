// public/js/app.js
// Cliente del dashboard — consume la API REST local

const API = '/api';

// ── Utilidades ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

async function apiFetch(path, opts = {}) {
  const token = Auth.getToken();
  const res = await fetch(API + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
    },
    ...opts,
  });

  // Token expirado o inválido
  if (res.status === 401) {
    Auth.cerrarSesion();
    return;
  }

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error de API');
  return json.data;
}

// ── Autenticación UI ───────────────────────────────────────────────────────
function initAuthUI() {
  const usuario  = Auth.getUsuario();
  if (!usuario) return;

  const iniciales = usuario.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const rolLabel  = { admin: 'Administrador', sala: 'Sala', cocina: 'Cocina' };

  $('user-avatar').textContent    = iniciales;
  $('user-name').textContent      = usuario.nombre;
  $('user-role').textContent      = rolLabel[usuario.rol] || usuario.rol;
  $('user-role').className        = `user-role r-${usuario.rol}`;

  // Mostrar opciones admin
  if (Auth.esAdmin()) {
    $('menu-usuarios').style.display = 'flex';
    $('menu-sep').style.display      = 'block';
  }

  // Toggle menú
  $('user-badge').addEventListener('click', e => {
    e.stopPropagation();
    $('user-menu').classList.toggle('open');
  });
  document.addEventListener('click', () => $('user-menu').classList.remove('open'));

  $('menu-logout').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) Auth.cerrarSesion();
  });

  $('menu-perfil').addEventListener('click', () => {
    alert(`Sesión activa\n\nUsuario: ${usuario.usuario}\nNombre: ${usuario.nombre}\nRol: ${usuario.rol}`);
  });

  if (Auth.esAdmin()) {
    $('menu-usuarios').addEventListener('click', () => {
      $('user-menu').classList.remove('open');
      abrirGestionUsuarios();
    });
  }

  // Sidebar: deshabilitar items sin permiso
  document.querySelectorAll('.nav-item[data-perm]').forEach(item => {
    const perm = item.dataset.perm;
    if (!Auth.tienePerm(perm)) item.classList.add('disabled');
  });
}

// ── Gestión de usuarios (modal admin) ─────────────────────────────────────
async function abrirGestionUsuarios() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  let usuarios = [];
  try {
    const res  = await fetch('/auth/usuarios', { headers: { Authorization: 'Bearer ' + Auth.getToken() } });
    const json = await res.json();
    if (json.ok) usuarios = json.data;
  } catch {}

  const rolPill = rol => `<span class="rol-pill ${rol}">${rol}</span>`;

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-users" style="color:var(--amber)"></i> Gestión de usuarios</span>
        <button class="modal-close" id="gu-close">✕</button>
      </div>

      <div class="section-title">Usuarios actuales</div>
      <div id="gu-list">
        ${usuarios.map(u => `
          <div class="user-row" id="urow-${u.id}">
            <div class="user-row-info">
              <div class="name">${u.nombre} <span style="color:var(--text-secondary);font-weight:400">(${u.usuario})</span></div>
              <div class="meta">${u.activo ? 'Activo' : '<span style="color:#e74c3c">Desactivado</span>'} · Último acceso: ${u.ultimo_acceso || 'nunca'}</div>
            </div>
            ${rolPill(u.rol)}
            <div style="display:flex;gap:6px">
              <button class="btn-sm danger" data-del="${u.id}" ${u.activo ? '' : 'disabled'}>
                <i class="ti ti-user-off"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">Añadir usuario</div>
      <div class="form-grid">
        <div class="form-row">
          <label>Nombre completo</label>
          <input id="gu-nombre" type="text" placeholder="Ej: María García" />
        </div>
        <div class="form-row">
          <label>Usuario (login)</label>
          <input id="gu-usuario" type="text" placeholder="Ej: maria" />
        </div>
        <div class="form-row">
          <label>Contraseña</label>
          <input id="gu-password" type="password" placeholder="Mínimo 6 caracteres" />
        </div>
        <div class="form-row">
          <label>Rol</label>
          <select id="gu-rol">
            <option value="sala">Sala</option>
            <option value="cocina">Cocina</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" id="gu-add">
        <i class="ti ti-user-plus"></i> Crear usuario
      </button>
      <div id="gu-msg" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#gu-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Desactivar usuario
  overlay.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del;
      if (!confirm('¿Desactivar este usuario?')) return;
      try {
        const res  = await fetch(`/auth/usuarios/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + Auth.getToken() } });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        const row = overlay.querySelector(`#urow-${id}`);
        if (row) row.style.opacity = '0.4';
        btn.disabled = true;
      } catch (e) { alert(e.message); }
    });
  });

  // Crear usuario
  overlay.querySelector('#gu-add').addEventListener('click', async () => {
    const nombre   = overlay.querySelector('#gu-nombre').value.trim();
    const usuario  = overlay.querySelector('#gu-usuario').value.trim();
    const password = overlay.querySelector('#gu-password').value;
    const rol      = overlay.querySelector('#gu-rol').value;
    const msgEl    = $('gu-msg');

    msgEl.style.display = 'none';
    if (!nombre || !usuario || !password) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = 'Rellena todos los campos';
      return;
    }
    if (password.length < 6) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }

    try {
      const res  = await fetch('/auth/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Auth.getToken() },
        body: JSON.stringify({ nombre, usuario, password, rol }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      msgEl.style.cssText = 'display:block;color:#5dc8a5';
      msgEl.textContent   = `✓ Usuario "${usuario}" creado correctamente`;
      overlay.querySelector('#gu-nombre').value   = '';
      overlay.querySelector('#gu-usuario').value  = '';
      overlay.querySelector('#gu-password').value = '';
    } catch (e) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = e.message;
    }
  });
}

// ── Fecha ──────────────────────────────────────────────────────────────────
function renderFecha() {
  const dias   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const now    = new Date();
  $('fecha').textContent = `${dias[now.getDay()]}, ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()} · Turno de comidas`;
}

// ── Métricas ───────────────────────────────────────────────────────────────
function renderMetricas(m) {
  $('metric-facturacion').textContent = fmt(m.facturacion) + ' €';
  $('metric-cubiertos').textContent   = m.cubiertos;
  $('metric-ticket').textContent      = fmt(m.ticketMedio) + ' €';
  $('metric-espera').textContent      = m.tiempoEspera + ' min';
}

// ── Mesas ──────────────────────────────────────────────────────────────────
function renderMesas(mesas) {
  const grid = $('tables-grid');
  grid.innerHTML = '';

  const counts = { libre: 0, ocupada: 0, reservada: 0, pendiente: 0 };
  mesas.forEach(m => counts[m.estado]++);

  $('legend-libre').textContent    = `Libre (${counts.libre})`;
  $('legend-ocupada').textContent  = `Ocupada (${counts.ocupada})`;
  $('legend-reservada').textContent= `Reservada (${counts.reservada})`;
  $('legend-pendiente').textContent= `Cuenta (${counts.pendiente})`;

  const puedeEditarMesas = Auth.tienePerm('mesas');

  mesas.forEach(m => {
    const info = m.estado === 'reservada'
      ? (m.inicio_turno || 'Reservada')
      : m.estado === 'libre'
        ? `${m.capacidad} pax`
        : `${m.pax_actual} pax${m.inicio_turno ? ' · ' + calcTiempo(m.inicio_turno) : ''}`;

    const div = document.createElement('div');
    div.className = `table-item ${m.estado}`;
    div.setAttribute('role', puedeEditarMesas ? 'button' : 'status');
    div.setAttribute('tabindex', puedeEditarMesas ? '0' : '-1');
    div.setAttribute('aria-label', `Mesa ${m.numero}, ${m.estado}`);
    div.innerHTML = `<div class="table-num">${String(m.numero).padStart(2,'0')}</div><div class="table-pax">${info}</div>`;
    if (puedeEditarMesas) {
      div.addEventListener('click', () => abrirDetalleMesa(m));
    }
    grid.appendChild(div);
  });
}

function calcTiempo(inicio) {
  if (!inicio) return '';
  const [h, min] = inicio.split(':').map(Number);
  const ahora = new Date();
  const diff  = (ahora.getHours() * 60 + ahora.getMinutes()) - (h * 60 + min);
  if (diff < 0) return inicio;
  return diff >= 60 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
}

// ── Pedidos ────────────────────────────────────────────────────────────────
function renderPedidos(pedidos) {
  const list = $('orders-list');
  list.innerHTML = '';

  const estadoLabel = { cocina: 'Cocina', servir: 'Servir', cobrar: 'Cobrar' };
  const estadoClass = { cocina: 's-cocina', servir: 's-servir', cobrar: 's-cobrar' };
  const puedePedidos = Auth.tienePerm('pedidos');

  pedidos.slice(0, 8).forEach(p => {
    const resumen = p.lineas.map(l => `${l.producto}${l.cantidad > 1 ? ' ×'+l.cantidad : ''}`).join(', ');
    const mins    = Math.round((Date.now() - new Date(p.creado_en)) / 60000);
    const tiempo  = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;

    const div = document.createElement('div');
    div.className = 'order-row';
    div.innerHTML = `
      <span class="order-mesa">Mesa ${p.mesa_numero}</span>
      <span class="order-items" title="${resumen}">${resumen}</span>
      <span class="order-time">${tiempo}</span>
      <button class="order-badge ${estadoClass[p.estado]}" data-id="${p.id}" data-estado="${p.estado}"
              ${puedePedidos ? '' : 'disabled style="opacity:0.4;cursor:default"'}
              aria-label="Avanzar pedido mesa ${p.mesa_numero}">
        ${estadoLabel[p.estado]}
      </button>
    `;
    list.appendChild(div);
  });

  if (puedePedidos) {
    list.querySelectorAll('.order-badge[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const siguiente = { cocina: 'servir', servir: 'cobrar', cobrar: 'cerrado' };
        const nuevoEstado = siguiente[btn.dataset.estado];
        if (!nuevoEstado) return;
        btn.disabled = true;
        try {
          await apiFetch(`/pedidos/${btn.dataset.id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: nuevoEstado }),
          });
          await cargarResumen();
        } catch (e) {
          alert('Error al actualizar pedido: ' + e.message);
          btn.disabled = false;
        }
      });
    });
  }
}

// ── Ventas ─────────────────────────────────────────────────────────────────
function renderVentas(ventas) {
  const wrap = $('chart-wrap');
  wrap.innerHTML = '';
  const max = Math.max(...ventas.map(v => v.importe), 1);
  const colores = ['#f5c842','#378add','#5dc8a5','#c0392b','rgba(245,200,66,0.55)','#3a9c5b'];

  ventas.forEach((v, i) => {
    const pct = Math.round((v.importe / max) * 100);
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-category">${v.categoria}</span>
      <div class="bar-track" role="presentation">
        <div class="bar-fill" style="width:0%;background:${colores[i % colores.length]}" data-pct="${pct}"></div>
      </div>
      <span class="bar-amount">${fmt(v.importe)} €</span>
    `;
    wrap.appendChild(row);
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      wrap.querySelectorAll('.bar-fill').forEach(b => { b.style.width = b.dataset.pct + '%'; });
    }, 80);
  });
}

// ── Personal ───────────────────────────────────────────────────────────────
function renderPersonal(personal) {
  const list = $('staff-list');
  list.innerHTML = '';
  const paleta = [
    { color:'#b8920a', bg:'rgba(245,200,66,0.14)' },
    { color:'#185fa5', bg:'rgba(50,102,173,0.12)' },
    { color:'#2e7d4f', bg:'rgba(58,156,91,0.12)' },
    { color:'#a93226', bg:'rgba(192,57,43,0.1)' },
  ];

  personal.forEach((p, i) => {
    const c   = paleta[i % paleta.length];
    const ini = p.nombre.split(' ').map(w => w[0]).slice(0,2).join('');
    const div = document.createElement('div');
    div.className = 'staff-row';
    div.innerHTML = `
      <div class="staff-avatar" style="background:${c.bg};color:${c.color}">${ini}</div>
      <div class="staff-info">
        <div class="staff-name">${p.nombre}</div>
        <div class="staff-role">${p.rol}</div>
      </div>
      <span class="staff-zone">${p.zona || '—'}</span>
    `;
    list.appendChild(div);
  });
}

// ── Ticker ─────────────────────────────────────────────────────────────────
let tickerPedidos = [];
let tickerIdx = 0;

function initTicker(pedidos) {
  tickerPedidos = pedidos.map(p => {
    const items = p.lineas.slice(0,2).map(l => l.producto).join(', ');
    const labels = { cocina:'en cocina', servir:'listo para servir', cobrar:'solicita cuenta' };
    return `Mesa ${p.mesa_numero} — ${items} <em>[${labels[p.estado]||p.estado}]</em>`;
  });
  if (!tickerPedidos.length) tickerPedidos = ['Sin pedidos activos en este momento'];
  rotateTicker();
}

function rotateTicker() {
  const el = $('ticker-msg');
  if (!el) return;
  el.innerHTML = tickerPedidos[tickerIdx % tickerPedidos.length];
  tickerIdx++;
}

// ── Carga principal ────────────────────────────────────────────────────────
async function cargarResumen() {
  try {
    const data = await apiFetch('/resumen');
    if (!data) return; // redirigido a login
    lastMesas   = data.mesas;
    lastPedidos = data.pedidos;
    renderMetricas(data.metricas);
    renderMesas(data.mesas);
    renderPedidos(data.pedidos);
    renderVentas(data.ventas);
    renderPersonal(data.personal);
    initTicker(data.pedidos);
    if (vistaActual === 'mesas')   renderFloorplan(lastMesas);
    if (vistaActual === 'pedidos') renderKanban(lastPedidos);
    if (vistaActual === 'cocina')  renderKitchen(lastPedidos);
    $('error-banner')?.remove();
  } catch (e) {
    let banner = $('error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'error-banner';
      banner.style.cssText = 'background:rgba(192,57,43,0.1);color:#a93226;padding:10px 16px;border-radius:8px;font-size:13px;margin-bottom:12px;';
      document.querySelector('.main').prepend(banner);
    }
    banner.textContent = '⚠️  No se puede conectar con el servidor. Reintentando…';
    console.error(e);
  }
}

// ── Modal detalle mesa ─────────────────────────────────────────────────────
function abrirDetalleMesa(mesa) {
  const estados = ['libre','ocupada','reservada','pendiente'];
  const labels  = { libre:'Libre', ocupada:'Ocupada', reservada:'Reservada', pendiente:'Cuenta pendiente' };

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;
    display:flex;align-items:center;justify-content:center;
  `;

  overlay.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:var(--radius-lg);padding:1.5rem;min-width:300px;max-width:400px;width:90%;border:0.5px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="font-size:15px;font-weight:600;">Mesa ${String(mesa.numero).padStart(2,'0')}</h2>
        <button id="modal-close" aria-label="Cerrar" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-secondary);">✕</button>
      </div>
      <label style="font-size:12px;color:var(--text-secondary);">Estado</label>
      <select id="modal-estado" style="display:block;width:100%;margin:6px 0 14px;padding:8px 10px;border-radius:var(--radius-md);border:0.5px solid var(--border-md);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;">
        ${estados.map(e => `<option value="${e}" ${e===mesa.estado?'selected':''}>${labels[e]}</option>`).join('')}
      </select>
      <label style="font-size:12px;color:var(--text-secondary);">Comensales</label>
      <input id="modal-pax" type="number" min="0" max="${mesa.capacidad}" value="${mesa.pax_actual}"
        style="display:block;width:100%;margin:6px 0 1rem;padding:8px 10px;border-radius:var(--radius-md);border:0.5px solid var(--border-md);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
      <button id="modal-save" style="width:100%;padding:10px;border-radius:var(--radius-md);background:var(--amber);color:#1a1208;font-weight:600;font-size:13px;border:none;cursor:pointer;">
        Guardar cambios
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#modal-save').addEventListener('click', async () => {
    const estado     = overlay.querySelector('#modal-estado').value;
    const pax_actual = Number(overlay.querySelector('#modal-pax').value);
    try {
      await apiFetch(`/mesas/${mesa.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado, pax_actual }),
      });
      overlay.remove();
      await cargarResumen();
    } catch (e) {
      alert('Error al actualizar mesa: ' + e.message);
    }
  });
}

// ── Navegación SPA ─────────────────────────────────────────────────────────
const PAGE_TITLES = { resumen: 'Resumen del día', mesas: 'Mesas — plano interactivo', pedidos: 'Pedidos', cocina: 'Comandas de cocina', carta: 'Carta', reservas: 'Reservas', personal: 'Personal', ventas: 'Informes y ventas', config: 'Configuración', placeholder: 'Próximamente' };
let vistaActual = 'resumen';

function switchView(viewName) {
  if (!viewName) return;
  vistaActual = viewName;
  document.querySelectorAll('.view').forEach(v => { v.hidden = true; });
  const target = $('view-' + viewName);
  if (target) target.hidden = false;
  $('page-title').textContent = PAGE_TITLES[viewName] || '';

  if (viewName === 'mesas')    { renderFloorplan(lastMesas); actualizarBtnNuevaMesa(); }
  if (viewName === 'pedidos')  renderKanban(lastPedidos);
  if (viewName === 'cocina')   renderKitchen(lastPedidos);
  if (viewName === 'carta')    cargarCarta();
  if (viewName === 'reservas') cargarReservas();
  if (viewName === 'personal') cargarPersonal();
  if (viewName === 'ventas')   cargarInformes();
  if (viewName === 'config')   cargarConfig();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.classList.contains('disabled')) return;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    switchView(item.dataset.view);
  });
});

$('link-ver-plano')?.addEventListener('click', () => {
  const navMesas = document.querySelector('.nav-item[data-view="mesas"]');
  if (navMesas?.classList.contains('disabled')) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  navMesas?.classList.add('active');
  switchView('mesas');
});

$('link-ver-pedidos')?.addEventListener('click', () => {
  const navPedidos = document.querySelector('.nav-item[data-view="pedidos"]');
  if (navPedidos?.classList.contains('disabled')) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  navPedidos?.classList.add('active');
  switchView('pedidos');
});

// ── Plano interactivo de mesas ─────────────────────────────────────────────
// Posición relativa (%) de cada mesa dentro del plano, agrupadas por zona
const FLOORPLAN_POS = {
  1: { x: 12, y: 16 },  2: { x: 28, y: 32 },                       // Terraza
  3: { x: 55, y: 16 },  4: { x: 75, y: 14 }, 5: { x: 90, y: 26 },
  6: { x: 58, y: 42 },  7: { x: 80, y: 48 },                        // Salón principal
  8: { x: 14, y: 64 },  9: { x: 28, y: 82 },                        // Reservados
  10: { x: 70, y: 84 },                                             // Junto a barra
};

let lastMesas = [];
let floorplanFiltro = 'todas';

function renderFloorplan(mesas) {
  const cont = $('floorplan-nodes');
  if (!cont || !mesas?.length) return;
  cont.innerHTML = '';

  const counts = { libre: 0, ocupada: 0, reservada: 0, pendiente: 0 };
  mesas.forEach(m => counts[m.estado]++);
  $('fp-legend-libre').textContent     = `Libre (${counts.libre})`;
  $('fp-legend-ocupada').textContent   = `Ocupada (${counts.ocupada})`;
  $('fp-legend-reservada').textContent = `Reservada (${counts.reservada})`;
  $('fp-legend-pendiente').textContent = `Cuenta (${counts.pendiente})`;

  const puedeEditarMesas = Auth.tienePerm('mesas');

  mesas.forEach(m => {
    const pos = FLOORPLAN_POS[m.numero] || { x: 50, y: 50 };
    const size = Math.round(46 + Math.min(m.capacidad, 8) * 5);
    const info = m.estado === 'reservada'
      ? (m.inicio_turno || 'Reservada')
      : m.estado === 'libre'
        ? `${m.capacidad} pax`
        : `${m.pax_actual} pax`;

    const node = document.createElement('div');
    node.className = `table-node ${m.estado}`;
    if (floorplanFiltro !== 'todas' && m.estado !== floorplanFiltro) node.classList.add('dimmed');
    node.style.left   = pos.x + '%';
    node.style.top    = pos.y + '%';
    node.style.width  = size + 'px';
    node.style.height = size + 'px';
    node.setAttribute('role', puedeEditarMesas ? 'button' : 'status');
    node.setAttribute('tabindex', puedeEditarMesas ? '0' : '-1');
    node.setAttribute('aria-label', `Mesa ${m.numero}, ${m.estado}, ${info}`);
    node.innerHTML = `<div class="tn-num">${String(m.numero).padStart(2,'0')}</div><div class="tn-pax">${info}</div>`;
    if (puedeEditarMesas) {
      node.addEventListener('click', () => abrirDetalleMesa(m));
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalleMesa(m); } });
    }
    cont.appendChild(node);
  });
}

document.querySelectorAll('#floorplan-filters .ff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#floorplan-filters .ff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    floorplanFiltro = btn.dataset.filtro;
    renderFloorplan(lastMesas);
  });
});

// ── Pedidos: tiempo transcurrido ────────────────────────────────────────────
let lastPedidos = [];

function minutosDesde(fechaIso) {
  return Math.max(0, Math.round((Date.now() - new Date(fechaIso)) / 60000));
}
function formatoTiempo(mins) {
  return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
}

// ── Pedidos: kanban board ───────────────────────────────────────────────────
function renderKanban(pedidos) {
  const board = $('kanban-board');
  if (!board) return;
  const puedeAvanzar = Auth.tienePerm('pedidos');
  const siguiente = { cocina: 'servir', servir: 'cobrar', cobrar: 'cerrado' };
  const labelSig  = { cocina: 'Listo →', servir: 'Servido →', cobrar: 'Cobrado ✓' };

  ['cocina', 'servir', 'cobrar'].forEach(estado => {
    const lista = (pedidos || []).filter(p => p.estado === estado)
      .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
    $('kc-' + estado).textContent = lista.length;

    const cont = $('kanban-' + estado);
    cont.innerHTML = '';
    if (!lista.length) {
      cont.innerHTML = '<div class="kanban-empty">Sin pedidos</div>';
      return;
    }

    lista.forEach(p => {
      const mins = minutosDesde(p.creado_en);
      const resumen = p.lineas.map(l => `${l.cantidad}× ${l.producto}`).join(', ');
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.dataset.pedidoId = p.id;
      card.innerHTML = `
        <div class="kc-head">
          <span class="kc-mesa">Mesa ${p.mesa_numero}</span>
          <span class="kc-time ${mins > 25 ? 'late' : ''}">${formatoTiempo(mins)}</span>
        </div>
        <div class="kc-items">${resumen}</div>
        <div class="kc-foot">
          <span class="kc-total">${fmt(p.total)} €</span>
          <button class="kc-advance ${estado}" data-id="${p.id}" ${puedeAvanzar ? '' : 'disabled'}>
            ${labelSig[estado]}
          </button>
        </div>
      `;
      cont.appendChild(card);
    });
  });

  if (puedeAvanzar) {
    board.querySelectorAll('.kc-advance[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const estadoActual = [...btn.classList].find(c => siguiente[c]);
        const nuevoEstado  = siguiente[estadoActual];
        btn.disabled = true;
        try {
          await apiFetch(`/pedidos/${btn.dataset.id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: nuevoEstado }),
          });
          await cargarResumen();
        } catch (e) {
          alert('Error al actualizar pedido: ' + e.message);
          btn.disabled = false;
        }
      });
    });
  }
}

// ── Cocina: tablero de comandas ─────────────────────────────────────────────
function renderKitchen(pedidos) {
  const board = $('kitchen-board');
  if (!board) return;
  const puedeAvanzar = Auth.tienePerm('pedidos');

  const lista = (pedidos || []).filter(p => p.estado === 'cocina' || p.estado === 'servir')
    .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

  board.innerHTML = '';
  if (!lista.length) {
    board.innerHTML = '<div class="kitchen-empty">No hay comandas pendientes en este momento 🎉</div>';
    return;
  }

  lista.forEach(p => {
    const mins  = minutosDesde(p.creado_en);
    const listo = p.estado === 'servir';
    const ticket = document.createElement('div');
    ticket.className = `ticket kitchen-card ${listo ? 'ready' : ''}`;
    ticket.dataset.pedidoId = p.id;
    ticket.innerHTML = `
      <div class="ticket-head">
        <span class="ticket-mesa">Mesa ${p.mesa_numero}</span>
        <span class="ticket-time ${mins > 20 && !listo ? 'late' : ''}">${formatoTiempo(mins)}</span>
      </div>
      <div class="ticket-status">${listo ? 'Listo para servir' : 'En preparación'}</div>
      <div class="ticket-items">
        ${p.lineas.map(l => `<div class="ticket-item"><span class="qty">${l.cantidad}×</span><span>${l.producto}</span></div>`).join('')}
      </div>
      ${listo ? '' : `<button class="ticket-btn" data-id="${p.id}" ${puedeAvanzar ? '' : 'disabled'}>Marcar listo para servir</button>`}
    `;
    board.appendChild(ticket);
  });

  if (puedeAvanzar) {
    board.querySelectorAll('.ticket-btn[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Actualizando…';
        try {
          await apiFetch(`/pedidos/${btn.dataset.id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'servir' }),
          });
          await cargarResumen();
        } catch (e) {
          alert('Error al actualizar comanda: ' + e.message);
          btn.disabled = false;
          btn.textContent = 'Marcar listo para servir';
        }
      });
    });
  }
}

$('cocina-refrescar')?.addEventListener('click', cargarResumen);

// ── Modal: nuevo pedido ──────────────────────────────────────────────────────
let lineaSeq = 0;

function filaLinea(platos) {
  const id = ++lineaSeq;
  const disponibles = (platos || []).filter(p => p.disponible);
  const categorias  = [...new Set(disponibles.map(p => p.categoria))];

  const opciones = categorias.map(cat => `
    <optgroup label="${cat}">
      ${disponibles.filter(p => p.categoria === cat)
        .map(p => `<option value="${p.nombre}" data-precio="${p.precio}">${p.nombre} — ${fmt(p.precio)} €</option>`)
        .join('')}
    </optgroup>
  `).join('');

  return `
    <div class="linea-row" data-linea="${id}">
      <div class="ln-producto-wrap">
        <select class="ln-producto-select">
          <option value="" disabled selected>Selecciona un plato…</option>
          ${opciones}
          <option value="__custom__">✎ Producto personalizado…</option>
        </select>
        <input type="text" placeholder="Nombre del producto" class="ln-producto-custom" style="display:none" />
      </div>
      <input type="number" min="1" value="1" class="ln-cantidad" />
      <input type="number" min="0" step="0.01" placeholder="Precio €" class="ln-precio" />
      <button class="linea-del" type="button" aria-label="Quitar línea">✕</button>
    </div>
  `;
}

$('btn-nuevo-pedido')?.addEventListener('click', async () => {
  const mesasDisponibles = lastMesas.filter(m => m.estado !== 'reservada' || true); // todas las mesas son seleccionables
  lineaSeq = 0;

  if (!lastCarta.length) {
    try { lastCarta = await apiFetch('/carta') || []; } catch { /* sin carta disponible */ }
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-receipt" style="color:var(--amber)"></i> Nuevo pedido</span>
        <button class="modal-close" id="np-close">✕</button>
      </div>

      <div class="form-row">
        <label>Mesa</label>
        <select id="np-mesa">
          ${mesasDisponibles.map(m => `<option value="${m.id}">Mesa ${String(m.numero).padStart(2,'0')} — ${m.estado}</option>`).join('')}
        </select>
      </div>

      <div class="section-title">Líneas del pedido</div>
      <div id="np-lineas">${filaLinea(lastCarta)}</div>
      <button class="btn-link-add" id="np-add-linea" type="button">+ Añadir línea</button>

      <button class="btn-primary" id="np-guardar">
        <i class="ti ti-check"></i> Crear pedido
      </button>
      <div id="np-msg" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#np-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#np-add-linea').addEventListener('click', () => {
    overlay.querySelector('#np-lineas').insertAdjacentHTML('beforeend', filaLinea(lastCarta));
  });

  overlay.querySelector('#np-lineas').addEventListener('click', e => {
    if (e.target.classList.contains('linea-del')) {
      const filas = overlay.querySelectorAll('.linea-row');
      if (filas.length > 1) e.target.closest('.linea-row').remove();
    }
  });

  // Al elegir un plato: autocompleta el precio, o muestra el campo de texto libre
  overlay.querySelector('#np-lineas').addEventListener('change', e => {
    if (!e.target.classList.contains('ln-producto-select')) return;
    const row    = e.target.closest('.linea-row');
    const custom = row.querySelector('.ln-producto-custom');
    const precio = row.querySelector('.ln-precio');

    if (e.target.value === '__custom__') {
      custom.style.display = 'block';
      custom.value = '';
      custom.focus();
      precio.value = '';
    } else {
      custom.style.display = 'none';
      const opt = e.target.selectedOptions[0];
      precio.value = opt?.dataset.precio || '';
    }
  });

  overlay.querySelector('#np-guardar').addEventListener('click', async () => {
    const mesa_id = Number(overlay.querySelector('#np-mesa').value);
    const msgEl   = $('np-msg');
    const lineas  = [...overlay.querySelectorAll('.linea-row')].map(row => {
      const select = row.querySelector('.ln-producto-select');
      const producto = select.value === '__custom__'
        ? row.querySelector('.ln-producto-custom').value.trim()
        : select.value;
      return {
        producto,
        cantidad:    Number(row.querySelector('.ln-cantidad').value) || 0,
        precio_unit: Number(row.querySelector('.ln-precio').value) || 0,
      };
    }).filter(l => l.producto && l.cantidad > 0);

    msgEl.style.display = 'none';
    if (!lineas.length) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = 'Añade al menos un producto con cantidad válida';
      return;
    }

    try {
      await apiFetch('/pedidos', { method: 'POST', body: JSON.stringify({ mesa_id, lineas }) });
      overlay.remove();
      await cargarResumen();
    } catch (e) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = e.message;
    }
  });
});

// ── Carta ────────────────────────────────────────────────────────────────────
let lastCarta = [];
let cartaFiltro = 'todas';

async function cargarCarta() {
  try {
    lastCarta = await apiFetch('/carta') || [];
    renderCartaFiltros(lastCarta);
    renderCartaBoard(lastCarta);
  } catch (e) {
    $('carta-board').innerHTML = `<div class="kitchen-empty">⚠️ No se pudo cargar la carta: ${e.message}</div>`;
  }
}

function renderCartaFiltros(platos) {
  const categorias = [...new Set(platos.map(p => p.categoria))].sort();
  const cont = $('carta-filtros');
  const actual = [...cont.querySelectorAll('.ff-btn')].map(b => b.dataset.filtroCat);
  if (JSON.stringify(actual) === JSON.stringify(['todas', ...categorias])) return; // ya construido

  cont.innerHTML = '<button class="ff-btn active" data-filtro-cat="todas">Todas</button>' +
    categorias.map(c => `<button class="ff-btn" data-filtro-cat="${c}">${c}</button>`).join('');

  cont.querySelectorAll('.ff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cont.querySelectorAll('.ff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cartaFiltro = btn.dataset.filtroCat;
      renderCartaBoard(lastCarta);
    });
  });
}

function renderCartaBoard(platos) {
  const board = $('carta-board');
  board.innerHTML = '';
  const puedeEditar = Auth.esAdmin();

  const visibles = cartaFiltro === 'todas' ? platos : platos.filter(p => p.categoria === cartaFiltro);
  if (!visibles.length) {
    board.innerHTML = '<div class="kitchen-empty">No hay platos en esta categoría todavía.</div>';
    return;
  }

  const categorias = cartaFiltro === 'todas' ? [...new Set(visibles.map(p => p.categoria))].sort() : [cartaFiltro];

  categorias.forEach(cat => {
    const platosCat = visibles.filter(p => p.categoria === cat);
    if (!platosCat.length) return;

    const grupo = document.createElement('div');
    grupo.className = 'carta-categoria';
    grupo.innerHTML = `
      <div class="carta-categoria-title">${cat}</div>
      <div class="carta-grid">
        ${platosCat.map(p => `
          <div class="carta-item ${p.disponible ? '' : 'no-disponible'}" data-id="${p.id}">
            <div class="ci-head">
              <span class="ci-nombre">${p.nombre}</span>
              <span class="ci-precio">${fmt(p.precio)} €</span>
            </div>
            ${p.descripcion ? `<div class="ci-desc">${p.descripcion}</div>` : ''}
            <div class="ci-foot">
              <label class="ci-toggle" ${puedeEditar ? '' : 'style="pointer-events:none;opacity:0.6"'}>
                <div class="ci-switch ${p.disponible ? 'on' : ''}" data-toggle="${p.id}"></div>
                ${p.disponible ? 'Disponible' : 'Agotado'}
              </label>
              ${puedeEditar ? `
                <div class="ci-actions">
                  <button class="edit" data-edit="${p.id}" aria-label="Editar plato"><i class="ti ti-pencil"></i></button>
                  <button class="del" data-del="${p.id}" aria-label="Eliminar plato"><i class="ti ti-trash"></i></button>
                </div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    board.appendChild(grupo);
  });

  if (!puedeEditar) return;

  board.querySelectorAll('[data-toggle]').forEach(sw => {
    sw.addEventListener('click', async () => {
      const id = sw.dataset.toggle;
      const plato = lastCarta.find(p => String(p.id) === id);
      try {
        await apiFetch(`/carta/${id}`, { method: 'PATCH', body: JSON.stringify({ disponible: plato.disponible ? 0 : 1 }) });
        await cargarCarta();
      } catch (e) { alert('Error al actualizar disponibilidad: ' + e.message); }
    });
  });

  board.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este plato de la carta?')) return;
      try {
        await apiFetch(`/carta/${btn.dataset.del}`, { method: 'DELETE' });
        await cargarCarta();
      } catch (e) { alert('Error al eliminar plato: ' + e.message); }
    });
  });

  board.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => abrirFormPlato(lastCarta.find(p => String(p.id) === btn.dataset.edit)));
  });
}

function abrirFormPlato(plato = null) {
  const esEdicion = !!plato;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-book" style="color:var(--amber)"></i> ${esEdicion ? 'Editar plato' : 'Nuevo plato'}</span>
        <button class="modal-close" id="cp-close">✕</button>
      </div>
      <div class="form-row">
        <label>Categoría</label>
        <input id="cp-categoria" type="text" placeholder="Ej: Entrantes" value="${plato?.categoria || ''}" />
      </div>
      <div class="form-row">
        <label>Nombre del plato</label>
        <input id="cp-nombre" type="text" placeholder="Ej: Croquetas caseras" value="${plato?.nombre || ''}" />
      </div>
      <div class="form-row">
        <label>Descripción (opcional)</label>
        <input id="cp-descripcion" type="text" placeholder="Ej: Jamón ibérico, bechamel cremosa" value="${plato?.descripcion || ''}" />
      </div>
      <div class="form-row">
        <label>Precio (€)</label>
        <input id="cp-precio" type="number" min="0" step="0.01" value="${plato?.precio ?? ''}" />
      </div>
      <button class="btn-primary" id="cp-guardar">
        <i class="ti ti-check"></i> ${esEdicion ? 'Guardar cambios' : 'Crear plato'}
      </button>
      <div id="cp-msg" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#cp-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#cp-guardar').addEventListener('click', async () => {
    const categoria   = overlay.querySelector('#cp-categoria').value.trim();
    const nombre      = overlay.querySelector('#cp-nombre').value.trim();
    const descripcion = overlay.querySelector('#cp-descripcion').value.trim();
    const precio      = Number(overlay.querySelector('#cp-precio').value);
    const msgEl       = $('cp-msg');

    msgEl.style.display = 'none';
    if (!categoria || !nombre || isNaN(precio) || precio < 0) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = 'Rellena categoría, nombre y un precio válido';
      return;
    }

    try {
      if (esEdicion) {
        await apiFetch(`/carta/${plato.id}`, { method: 'PATCH', body: JSON.stringify({ categoria, nombre, descripcion, precio }) });
      } else {
        await apiFetch('/carta', { method: 'POST', body: JSON.stringify({ categoria, nombre, descripcion, precio, disponible: 1 }) });
      }
      overlay.remove();
      await cargarCarta();
    } catch (e) {
      msgEl.style.cssText = 'display:block;color:#e74c3c';
      msgEl.textContent   = e.message;
    }
  });
}

$('btn-nuevo-plato')?.addEventListener('click', () => abrirFormPlato());


// ── RESERVAS ────────────────────────────────────────────────────────────────
let modoReservasFuturas = false;

async function cargarReservas() {
  const fechaEl = $('reservas-fecha');
  if (!fechaEl._init) {
    fechaEl.value = new Date().toISOString().slice(0, 10);
    fechaEl._init = true;
  }
  const lista = $('reservas-lista');
  lista.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);font-size:13px;">Cargando…</div>';
  try {
    const url = modoReservasFuturas ? '/reservas?futuras=1' : `/reservas?fecha=${fechaEl.value}`;
    const data = await apiFetch(url);
    renderReservas(data || []);
  } catch (e) {
    lista.innerHTML = `<div style="padding:2rem;text-align:center;color:#e74c3c;font-size:13px;">⚠️ ${e.message}</div>`;
  }
}

function renderReservas(reservas) {
  const lista = $('reservas-lista');
  if (!reservas.length) {
    lista.innerHTML = '<div style="padding:2.5rem;text-align:center;color:var(--text-secondary);font-size:13px;">Sin reservas para esta fecha</div>';
    return;
  }
  lista.innerHTML = reservas.map(r => `
    <div style="display:grid;grid-template-columns:70px 1fr auto auto;align-items:center;gap:12px;padding:12px 18px;border-bottom:0.5px solid var(--border);">
      <div style="font-size:18px;font-weight:700;color:var(--amber);font-variant-numeric:tabular-nums;">${r.hora.slice(0,5)}</div>
      <div>
        <div style="font-size:13px;font-weight:600;">${r.nombre}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
          ${r.pax} personas · ${r.mesa_numero ? 'Mesa ' + r.mesa_numero : 'Mesa sin asignar'}
          ${r.notas ? ' · <em>' + r.notas + '</em>' : ''}
          ${modoReservasFuturas ? ' · <span style="color:var(--text-secondary)">' + r.fecha + '</span>' : ''}
        </div>
      </div>
      <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;background:rgba(93,200,165,0.14);color:#5dc8a5;text-transform:uppercase;">${r.estado}</span>
      <button class="btn-sm danger" data-del-reserva="${r.id}" aria-label="Cancelar reserva"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');

  lista.querySelectorAll('[data-del-reserva]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Cancelar esta reserva?')) return;
      try {
        await apiFetch(`/reservas/${btn.dataset.delReserva}`, { method: 'DELETE' });
        await cargarReservas();
      } catch (e) { alert('Error: ' + e.message); }
    });
  });
}

$('reservas-fecha')?.addEventListener('change', () => {
  modoReservasFuturas = false;
  $('btn-reservas-futuras').textContent = 'Ver todas';
  cargarReservas();
});

$('btn-reservas-futuras')?.addEventListener('click', () => {
  modoReservasFuturas = !modoReservasFuturas;
  $('btn-reservas-futuras').textContent = modoReservasFuturas ? 'Ver por día' : 'Ver todas';
  cargarReservas();
});

$('btn-nueva-reserva')?.addEventListener('click', async () => {
  // Fetch mesas for select
  let mesas = [];
  try { mesas = await apiFetch('/mesas'); } catch (_) {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:460px;">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-calendar" style="color:var(--amber)"></i> Nueva reserva</span>
        <button class="modal-close" id="nr-close">×</button>
      </div>
      <div class="form-grid">
        <div class="form-row" style="grid-column:1/-1"><label>Nombre del cliente</label><input id="nr-nombre" type="text" placeholder="Ej: García Familia"></div>
        <div class="form-row"><label>Fecha</label><input id="nr-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-row"><label>Hora</label><input id="nr-hora" type="time" value="14:00"></div>
        <div class="form-row"><label>Personas (pax)</label><input id="nr-pax" type="number" min="1" max="30" value="2"></div>
        <div class="form-row"><label>Mesa</label>
          <select id="nr-mesa">
            <option value="">Sin asignar</option>
            ${mesas.map(m => `<option value="${m.id}">Mesa ${m.numero} (${m.capacidad} pax)</option>`).join('')}
          </select>
        </div>
        <div class="form-row" style="grid-column:1/-1"><label>Notas (opcional)</label><input id="nr-notas" type="text" placeholder="Ej: Cumpleaños, alergia..."></div>
      </div>
      <div id="nr-msg" style="display:none;margin-top:10px;font-size:12px;color:#e74c3c;"></div>
      <button class="btn-primary" id="nr-submit"><i class="ti ti-check"></i> Crear reserva</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('nr-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  $('nr-submit').addEventListener('click', async () => {
    const nombre = $('nr-nombre').value.trim();
    const fecha  = $('nr-fecha').value;
    const hora   = $('nr-hora').value;
    const pax    = Number($('nr-pax').value);
    const mesa_id = $('nr-mesa').value || null;
    const notas  = $('nr-notas').value.trim() || null;
    const msgEl  = $('nr-msg');
    if (!nombre || !fecha || !hora || !pax) {
      msgEl.style.display = 'block';
      msgEl.textContent = 'Rellena nombre, fecha, hora y personas';
      return;
    }
    try {
      await apiFetch('/reservas', { method: 'POST', body: JSON.stringify({ nombre, fecha, hora, pax, mesa_id, notas }) });
      overlay.remove();
      await cargarReservas();
    } catch (e) {
      msgEl.style.display = 'block';
      msgEl.textContent = e.message;
    }
  });
});

// ── PERSONAL ────────────────────────────────────────────────────────────────
let tabPersonal = 'empleados';
let lastEmpleados = [];

async function cargarPersonal() {
  await Promise.all([cargarEmpleados(), cargarTurnos()]);
  mostrarTabPersonal(tabPersonal);
}

async function cargarEmpleados() {
  const lista = $('personal-lista');
  try {
    lastEmpleados = await apiFetch('/personal') || [];
    renderEmpleados(lastEmpleados);
  } catch (e) {
    lista.innerHTML = `<div style="padding:2rem;text-align:center;color:#e74c3c;font-size:13px;">⚠️ ${e.message}</div>`;
  }
}

function renderEmpleados(empleados) {
  const lista = $('personal-lista');
  if (!empleados.length) {
    lista.innerHTML = '<div style="padding:2.5rem;text-align:center;color:var(--text-secondary);font-size:13px;">Sin empleados registrados</div>';
    return;
  }
  const ROL_COLOR = { admin: '#f5c842', sala: '#378add', cocina: '#5dc8a5' };
  lista.innerHTML = empleados.map(e => `
    <div style="display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:12px;padding:12px 18px;border-bottom:0.5px solid var(--border);${e.activo ? '' : 'opacity:0.45;'}">
      <div>
        <div style="font-size:13px;font-weight:600;">${e.nombre} ${e.activo ? '' : '<span style="font-size:10px;color:var(--text-secondary)">(inactivo)</span>'}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${e.zona || 'Sin zona asignada'}</div>
      </div>
      <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;background:${ROL_COLOR[e.rol] || '#888'}22;color:${ROL_COLOR[e.rol] || '#888'};text-transform:uppercase;">${e.rol}</span>
      <button class="btn-sm" data-edit-emp="${e.id}" aria-label="Editar empleado"><i class="ti ti-pencil"></i></button>
      <button class="btn-sm danger" data-toggle-emp="${e.id}" data-activo="${e.activo}" aria-label="${e.activo ? 'Desactivar' : 'Activar'}">
        <i class="ti ti-${e.activo ? 'user-off' : 'user-check'}"></i>
      </button>
    </div>
  `).join('');

  lista.querySelectorAll('[data-edit-emp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emp = lastEmpleados.find(e => String(e.id) === btn.dataset.editEmp);
      if (emp) abrirFormEmpleado(emp);
    });
  });

  lista.querySelectorAll('[data-toggle-emp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const activo = btn.dataset.activo === '1' ? 0 : 1;
      const accion = activo ? 'activar' : 'desactivar';
      if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a este empleado?`)) return;
      try {
        await apiFetch(`/personal/${btn.dataset.toggleEmp}`, { method: 'PATCH', body: JSON.stringify({ activo }) });
        await cargarEmpleados();
      } catch (e) { alert('Error: ' + e.message); }
    });
  });
}

async function cargarTurnos() {
  const fechaEl = $('turnos-fecha');
  if (!fechaEl._init) {
    fechaEl.value = new Date().toISOString().slice(0, 10);
    fechaEl._init = true;
  }
  const lista = $('turnos-lista');
  try {
    const data = await apiFetch(`/turnos?fecha=${fechaEl.value}`) || [];
    renderTurnos(data);
  } catch (e) {
    lista.innerHTML = `<div style="padding:2rem;text-align:center;color:#e74c3c;font-size:13px;">⚠️ ${e.message}</div>`;
  }
}

function renderTurnos(turnos) {
  const lista = $('turnos-lista');
  if (!turnos.length) {
    lista.innerHTML = '<div style="padding:2.5rem;text-align:center;color:var(--text-secondary);font-size:13px;">Sin turnos para esta fecha</div>';
    return;
  }
  lista.innerHTML = turnos.map(t => `
    <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:12px 18px;border-bottom:0.5px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;">${t.empleado_nombre}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
          <i class="ti ti-clock" style="font-size:11px;"></i> ${t.hora_inicio}–${t.hora_fin}
          ${t.zona ? ' · ' + t.zona : ''}
        </div>
      </div>
      <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;background:rgba(55,138,221,0.14);color:#378add;text-transform:uppercase;">${t.empleado_rol}</span>
      <button class="btn-sm danger" data-del-turno="${t.id}" aria-label="Eliminar turno"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');

  lista.querySelectorAll('[data-del-turno]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este turno?')) return;
      try {
        await apiFetch(`/turnos/${btn.dataset.delTurno}`, { method: 'DELETE' });
        await cargarTurnos();
      } catch (e) { alert('Error: ' + e.message); }
    });
  });
}

function mostrarTabPersonal(tab) {
  tabPersonal = tab;
  const esEmpleados = tab === 'empleados';
  $('personal-lista').style.display  = esEmpleados ? 'block' : 'none';
  $('turnos-panel').style.display    = esEmpleados ? 'none'  : 'block';
  $('btn-nuevo-empleado').style.display = esEmpleados ? 'flex' : 'none';
  $('btn-nuevo-turno').style.display    = esEmpleados ? 'none' : 'flex';
  $('turnos-fecha').style.display       = esEmpleados ? 'none' : 'block';

  $('btn-tab-empleados').style.background = esEmpleados ? 'var(--amber)' : 'var(--bg-secondary)';
  $('btn-tab-empleados').style.color      = esEmpleados ? '#1a1208' : 'var(--text-secondary)';
  $('btn-tab-empleados').style.border     = esEmpleados ? 'none' : '0.5px solid var(--border-md)';
  $('btn-tab-turnos').style.background    = !esEmpleados ? 'var(--amber)' : 'var(--bg-secondary)';
  $('btn-tab-turnos').style.color         = !esEmpleados ? '#1a1208' : 'var(--text-secondary)';
  $('btn-tab-turnos').style.border        = !esEmpleados ? 'none' : '0.5px solid var(--border-md)';
}

$('btn-tab-empleados')?.addEventListener('click', () => mostrarTabPersonal('empleados'));
$('btn-tab-turnos')?.addEventListener('click', () => mostrarTabPersonal('turnos'));
$('turnos-fecha')?.addEventListener('change', cargarTurnos);

function abrirFormEmpleado(emp = null) {
  const esEdicion = !!emp;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-users" style="color:var(--amber)"></i> ${esEdicion ? 'Editar empleado' : 'Nuevo empleado'}</span>
        <button class="modal-close" id="ep-close">×</button>
      </div>
      <div class="form-row"><label>Nombre completo</label><input id="ep-nombre" type="text" value="${emp?.nombre || ''}"></div>
      <div class="form-grid">
        <div class="form-row"><label>Rol</label>
          <select id="ep-rol">
            <option value="sala" ${emp?.rol==='sala'?'selected':''}>Sala</option>
            <option value="cocina" ${emp?.rol==='cocina'?'selected':''}>Cocina</option>
            <option value="admin" ${emp?.rol==='admin'?'selected':''}>Admin</option>
          </select>
        </div>
        <div class="form-row"><label>Zona</label><input id="ep-zona" type="text" value="${emp?.zona || ''}" placeholder="Ej: Mesas 1–5"></div>
      </div>
      <div id="ep-msg" style="display:none;margin-top:10px;font-size:12px;color:#e74c3c;"></div>
      <button class="btn-primary" id="ep-submit"><i class="ti ti-check"></i> ${esEdicion ? 'Guardar cambios' : 'Crear empleado'}</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('ep-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  $('ep-submit').addEventListener('click', async () => {
    const nombre = $('ep-nombre').value.trim();
    const rol    = $('ep-rol').value;
    const zona   = $('ep-zona').value.trim() || null;
    const msgEl  = $('ep-msg');
    if (!nombre) { msgEl.style.display = 'block'; msgEl.textContent = 'El nombre es obligatorio'; return; }
    try {
      if (esEdicion) {
        await apiFetch(`/personal/${emp.id}`, { method: 'PATCH', body: JSON.stringify({ nombre, rol, zona }) });
      } else {
        await apiFetch('/personal', { method: 'POST', body: JSON.stringify({ nombre, rol, zona }) });
      }
      overlay.remove();
      await cargarEmpleados();
    } catch (e) { msgEl.style.display = 'block'; msgEl.textContent = e.message; }
  });
}

$('btn-nuevo-empleado')?.addEventListener('click', () => abrirFormEmpleado());

$('btn-nuevo-turno')?.addEventListener('click', async () => {
  let empleados = [];
  try { empleados = await apiFetch('/personal') || []; } catch (_) {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-clock" style="color:var(--amber)"></i> Nuevo turno</span>
        <button class="modal-close" id="nt-close">×</button>
      </div>
      <div class="form-row"><label>Empleado</label>
        <select id="nt-emp">
          <option value="" disabled selected>Selecciona un empleado</option>
          ${empleados.map(e => `<option value="${e.id}">${e.nombre} (${e.rol})</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="form-row"><label>Fecha</label><input id="nt-fecha" type="date" value="${$('turnos-fecha')?.value || new Date().toISOString().slice(0,10)}"></div>
        <div class="form-row"><label>Zona</label><input id="nt-zona" type="text" placeholder="Ej: Cocina principal"></div>
        <div class="form-row"><label>Hora inicio</label><input id="nt-inicio" type="time" value="10:00"></div>
        <div class="form-row"><label>Hora fin</label><input id="nt-fin" type="time" value="17:00"></div>
      </div>
      <div id="nt-msg" style="display:none;margin-top:10px;font-size:12px;color:#e74c3c;"></div>
      <button class="btn-primary" id="nt-submit"><i class="ti ti-check"></i> Crear turno</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('nt-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  $('nt-submit').addEventListener('click', async () => {
    const empleado_id  = $('nt-emp').value;
    const fecha        = $('nt-fecha').value;
    const hora_inicio  = $('nt-inicio').value;
    const hora_fin     = $('nt-fin').value;
    const zona         = $('nt-zona').value.trim() || null;
    const msgEl        = $('nt-msg');
    if (!empleado_id || !fecha || !hora_inicio || !hora_fin) {
      msgEl.style.display = 'block'; msgEl.textContent = 'Rellena todos los campos obligatorios'; return;
    }
    try {
      await apiFetch('/turnos', { method: 'POST', body: JSON.stringify({ empleado_id, fecha, hora_inicio, hora_fin, zona }) });
      overlay.remove();
      await cargarTurnos();
    } catch (e) { msgEl.style.display = 'block'; msgEl.textContent = e.message; }
  });
});


// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const ok = await Auth.verificar();
  if (!ok) return;

  renderFecha();
  initAuthUI();
  await cargarResumen();

  // Redirigir según rol
  const usuario = Auth.getUsuario();
  if (usuario?.rol === 'cocina') {
    const navCocina = document.querySelector('.nav-item[data-view="cocina"]');
    navCocina?.classList.add('active');
    document.querySelector('.nav-item[data-view="resumen"]')?.classList.remove('active');
    switchView('cocina');
  } else if (usuario?.rol === 'sala') {
    const navMesas = document.querySelector('.nav-item[data-view="mesas"]');
    navMesas?.classList.add('active');
    document.querySelector('.nav-item[data-view="resumen"]')?.classList.remove('active');
    switchView('mesas');
  }

  setInterval(cargarResumen, 30_000);
  setInterval(rotateTicker, 4_000);
  actualizarBtnNuevaMesa();
}
init();

// ═══════════════════════════════════════════════════════════════════════════
// VISTA: INFORMES / VENTAS
// ═══════════════════════════════════════════════════════════════════════════

const PAGE_TITLES_EXT = { ventas: 'Informes y ventas' };
Object.assign(PAGE_TITLES, PAGE_TITLES_EXT);

// Añadir ventas a switchView
const _switchViewOrig = switchView;
// eslint-disable-next-line no-global-assign
window._infSwitchPatch = function(viewName) {
  if (viewName === 'ventas') cargarInformes();
};
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.dataset.view === 'ventas') {
    item.addEventListener('click', () => cargarInformes());
  }
});

// ── Helpers fecha ────────────────────────────────────────────────────────
function isoDesde(dias) {
  const d = new Date();
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
}
function isoHoy() { return new Date().toISOString().slice(0, 10); }

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${meses[parseInt(m) - 1]}`;
}

// ── Estado informes ──────────────────────────────────────────────────────
let infDias = 7;

async function cargarInformes() {
  const desde = $('inf-desde')?.value || isoDesde(infDias);
  const hasta = $('inf-hasta')?.value || isoHoy();

  try {
    const data = await apiFetch(`/informes/resumen?desde=${desde}&hasta=${hasta}`);
    renderInformesKpis(data.totales);
    renderInformesChartDia(data.por_dia, data.desde, data.hasta);
    renderInformesCat(data.por_categoria);
    renderInformesTopProductos(data.top_productos);

    const lbl = $('inf-periodo-label');
    if (lbl) lbl.textContent = `${fmtFecha(data.desde)} → ${fmtFecha(data.hasta)}`;
  } catch (e) {
    console.error('Error cargando informes:', e);
  }
}

function renderInformesKpis(totales) {
  const cont = $('inf-kpis');
  if (!cont) return;
  cont.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Facturación período</div>
      <div class="metric-value">${fmt(totales.facturacion)} €</div>
      <div class="metric-delta"><i class="ti ti-receipt" style="font-size:12px"></i> ${totales.total_pedidos} pedidos</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Ticket medio</div>
      <div class="metric-value">${fmt(totales.ticket_medio)} €</div>
      <div class="metric-delta"><i class="ti ti-trending-up" style="font-size:12px"></i> máx. ${fmt(totales.ticket_maximo)} €</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Ticket mínimo</div>
      <div class="metric-value">${fmt(totales.ticket_minimo)} €</div>
      <div class="metric-delta" style="color:var(--text-secondary)"><i class="ti ti-minus" style="font-size:12px"></i> mínimo registrado</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Hora punta</div>
      <div class="metric-value">${totales.hora_punta}</div>
      <div class="metric-delta" style="color:var(--text-secondary)"><i class="ti ti-clock" style="font-size:12px"></i> más pedidos cerrados</div>
    </div>
  `;
}

function renderInformesChartDia(porDia, desde, hasta) {
  const cont = $('inf-chart-dia');
  if (!cont) return;

  // Rellenar días sin datos en el rango
  const mapaFechas = {};
  porDia.forEach(r => { mapaFechas[r.fecha] = r; });

  const dias = [];
  const cur = new Date(desde);
  const fin = new Date(hasta);
  while (cur <= fin) {
    const iso = cur.toISOString().slice(0, 10);
    dias.push(mapaFechas[iso] || { fecha: iso, num_pedidos: 0, facturacion: 0, ticket_medio: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  if (!dias.length) { cont.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:2rem">Sin datos en este período</p>'; return; }

  const maxVal = Math.max(...dias.map(d => d.facturacion), 1);

  const bars = dias.map(d => {
    const pct = Math.max((d.facturacion / maxVal) * 100, d.facturacion > 0 ? 4 : 0);
    return `
      <div class="inf-bar-col" title="${fmtFecha(d.fecha)}: ${fmt(d.facturacion)} € (${d.num_pedidos} pedidos)">
        <div class="inf-bar-val">${d.facturacion > 0 ? fmt(d.facturacion) + '€' : ''}</div>
        <div class="inf-bar" style="height:${pct}%"></div>
        <div class="inf-bar-label">${fmtFecha(d.fecha)}</div>
      </div>`;
  }).join('');

  cont.innerHTML = `<div class="inf-bar-wrap">${bars}</div>`;
}

function renderInformesCat(porCategoria) {
  const cont = $('inf-chart-cat');
  if (!cont) return;
  if (!porCategoria.length) { cont.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:2rem">Sin datos</p>'; return; }

  const max = Math.max(...porCategoria.map(c => c.importe), 1);
  const total = porCategoria.reduce((s, c) => s + c.importe, 0);

  cont.innerHTML = porCategoria.map(c => {
    const pct = (c.importe / max * 100).toFixed(1);
    const share = total > 0 ? ((c.importe / total) * 100).toFixed(1) : 0;
    return `
      <div class="inf-cat-row">
        <div class="inf-cat-name">${c.categoria}</div>
        <div class="inf-cat-bar-wrap"><div class="inf-cat-bar" style="width:${pct}%"></div></div>
        <div class="inf-cat-val">${fmt(c.importe)} € <span style="font-size:10px;color:var(--text-secondary)">(${share}%)</span></div>
      </div>`;
  }).join('');
}

function renderInformesTopProductos(topProductos) {
  const cont = $('inf-top-productos');
  if (!cont) return;
  if (!topProductos.length) { cont.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:2rem">Sin datos</p>'; return; }

  const medallas = ['🥇','🥈','🥉','4º','5º'];
  cont.innerHTML = topProductos.map((p, i) => `
    <div class="inf-prod-row">
      <div class="inf-prod-rank">${medallas[i] || (i+1)+'º'}</div>
      <div class="inf-prod-name">${p.producto}</div>
      <div class="inf-prod-units">${p.unidades} uds.</div>
      <div class="inf-prod-val">${fmt(p.importe)} €</div>
    </div>`).join('');
}

// ── Botones de rango ─────────────────────────────────────────────────────
document.querySelectorAll('.inf-range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inf-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    infDias = parseInt(btn.dataset.days);
    const desde = isoDesde(infDias);
    const hasta = isoHoy();
    const inpDesde = $('inf-desde');
    const inpHasta = $('inf-hasta');
    if (inpDesde) inpDesde.value = desde;
    if (inpHasta) inpHasta.value = hasta;
    cargarInformes();
  });
});

$('inf-btn-aplicar')?.addEventListener('click', () => {
  document.querySelectorAll('.inf-range-btn').forEach(b => b.classList.remove('active'));
  cargarInformes();
});

// Inicializar fechas
(function() {
  const inpDesde = $('inf-desde');
  const inpHasta = $('inf-hasta');
  if (inpDesde) inpDesde.value = isoDesde(7);
  if (inpHasta) inpHasta.value = isoHoy();
})();


// ═══════════════════════════════════════════════════════════════════════════
// IMPRESIÓN DE TICKET / COMANDA
// ═══════════════════════════════════════════════════════════════════════════

function abrirTicket(pedidoId, modo = 'ticket') {
  apiFetch(`/pedidos/${pedidoId}/ticket`).then(pedido => {
    mostrarModalTicket(pedido, modo);
  }).catch(e => console.error('Error cargando ticket:', e));
}

function mostrarModalTicket(pedido, modo) {
  const esComanda = modo === 'comanda';
  const ahora = new Date().toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const lineas = pedido.lineas.map(l => `
    <div class="t-linea">
      <span class="t-prod">${l.cantidad}× ${l.producto}</span>
      ${!esComanda ? `<span>${fmt(l.cantidad * l.precio_unit)} €</span>` : ''}
    </div>`).join('');

  const html = `
    <div class="ticket-inner" id="ticket-printable">
      <h2>🔥 La Brasería</h2>
      <div class="t-sub">${esComanda ? 'COMANDA DE COCINA' : 'TICKET'}</div>
      <hr>
      <div style="font-size:11px; margin-bottom:6px;">
        Mesa ${pedido.mesa_numero} &nbsp;|&nbsp; Pedido #${pedido.id}<br>
        ${ahora}
      </div>
      <hr>
      ${lineas}
      <hr>
      ${!esComanda ? `
        <div class="t-total">
          <span>TOTAL</span>
          <span>${fmt(pedido.total)} €</span>
        </div>
        <div style="font-size:10px; color:#555; margin-top:4px;">IVA incluido (10%)</div>
      ` : ''}
      <div class="t-footer">¡Gracias por su visita!</div>
    </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'ticket-modal';
  overlay.id = 'ticket-modal-overlay';
  overlay.innerHTML = `
    <div class="ticket-box">
      ${html}
      <div class="ticket-actions">
        <button class="btn-print" onclick="imprimirTicket()">
          <i class="ti ti-printer"></i> Imprimir
        </button>
        <button class="btn-cerrar" onclick="cerrarTicketModal()">Cerrar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarTicketModal(); });
}

window.cerrarTicketModal = function() {
  document.getElementById('ticket-modal-overlay')?.remove();
};

window.imprimirTicket = function() {
  const inner = document.getElementById('ticket-printable');
  if (!inner) return;
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>Ticket</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size:13px; line-height:1.6; width:300px; margin:0 auto; padding:16px; color:#111; }
      h2 { text-align:center; margin:0 0 4px; font-size:16px; }
      .t-sub { text-align:center; font-size:11px; color:#555; margin-bottom:10px; }
      hr { border:none; border-top:1px dashed #aaa; margin:8px 0; }
      .t-linea { display:flex; justify-content:space-between; gap:8px; }
      .t-prod { flex:1; }
      .t-total { display:flex; justify-content:space-between; font-weight:bold; font-size:15px; margin-top:4px; }
      .t-footer { text-align:center; font-size:10px; color:#777; margin-top:12px; }
    </style></head><body>
    ${inner.innerHTML}
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 400);
};

// ── Inyectar botón de ticket/comanda en las tarjetas de kanban y cocina ──

// Parchar renderKanban para añadir botón ticket
const _renderKanbanOrig = renderKanban;
window.renderKanban = function(pedidos) {
  _renderKanbanOrig(pedidos);
  // Añadir botones de ticket después de renderizar
  document.querySelectorAll('#kanban-board .kanban-card').forEach(card => {
    if (card.querySelector('.btn-ticket')) return;
    const pedidoId = card.dataset.pedidoId;
    if (!pedidoId) return;
    const btn = document.createElement('button');
    btn.className = 'btn-ticket';
    btn.innerHTML = '<i class="ti ti-printer"></i> Ticket';
    btn.style.cssText = 'margin-top:8px; width:100%; padding:5px 8px; background:rgba(255,255,255,0.05); border:0.5px solid var(--border-md); border-radius:6px; color:var(--text-secondary); font-size:11px; cursor:pointer; display:flex; align-items:center; gap:4px; justify-content:center;';
    btn.addEventListener('click', e => { e.stopPropagation(); abrirTicket(pedidoId, 'ticket'); });
    card.appendChild(btn);
  });
};

// Parchar renderKitchen para añadir botón comanda
const _renderKitchenOrig = renderKitchen;
window.renderKitchen = function(pedidos) {
  _renderKitchenOrig(pedidos);
  document.querySelectorAll('#kitchen-board .kitchen-card').forEach(card => {
    if (card.querySelector('.btn-comanda')) return;
    const pedidoId = card.dataset.pedidoId;
    if (!pedidoId) return;
    const btn = document.createElement('button');
    btn.className = 'btn-comanda';
    btn.innerHTML = '<i class="ti ti-printer"></i> Comanda';
    btn.style.cssText = 'margin-top:8px; width:100%; padding:5px 8px; background:rgba(255,255,255,0.05); border:0.5px solid var(--border-md); border-radius:6px; color:var(--text-secondary); font-size:11px; cursor:pointer; display:flex; align-items:center; gap:4px; justify-content:center;';
    btn.addEventListener('click', e => { e.stopPropagation(); abrirTicket(pedidoId, 'comanda'); });
    card.appendChild(btn);
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// NUEVA MESA — crear y eliminar desde el plano
// ═══════════════════════════════════════════════════════════════════════════

// Zonas del restaurante con sus límites en % del plano
// Coinciden con los .floorplan-zone del HTML
const ZONAS = [
  { nombre: 'Terraza',         x1:  1.5, y1:  4, x2: 39.5, y2: 44 },
  { nombre: 'Salón principal', x1: 42,   y1:  4, x2: 98.5, y2: 66 },
  { nombre: 'Reservados',      x1:  1.5, y1: 48, x2: 39.5, y2: 96 },
  { nombre: 'Junto a barra',   x1: 42,   y1: 70, x2: 98.5, y2: 96 },
];

// Devuelve una posición libre dentro de la zona, evitando solapamientos con mesas existentes
function posicionLibreEnZona(zonaNombre, mesasExistentes) {
  const zona = ZONAS.find(z => z.nombre === zonaNombre);
  if (!zona) return { x: 50, y: 50 };

  const ocupadas = mesasExistentes.map(m => FLOORPLAN_POS[m.numero] || null).filter(Boolean);

  // Grid de candidatos dentro de la zona (margen de 8%)
  const paso = 12;
  const candidatos = [];
  for (let x = zona.x1 + 6; x < zona.x2 - 4; x += paso) {
    for (let y = zona.y1 + 10; y < zona.y2 - 6; y += paso) {
      candidatos.push({ x: Math.round(x), y: Math.round(y) });
    }
  }

  // Elegir el candidato más alejado de todas las mesas existentes
  let mejor = candidatos[0] || { x: Math.round((zona.x1 + zona.x2) / 2), y: Math.round((zona.y1 + zona.y2) / 2) };
  let mejorDist = -1;

  candidatos.forEach(c => {
    const distMin = ocupadas.length
      ? Math.min(...ocupadas.map(o => Math.hypot(c.x - o.x, c.y - o.y)))
      : 999;
    if (distMin > mejorDist) { mejorDist = distMin; mejor = c; }
  });

  return mejor;
}

// Mostrar/ocultar botón según rol
function actualizarBtnNuevaMesa() {
  const btn = $('btn-nueva-mesa');
  if (!btn) return;
  const u = Auth.getUsuario();
  const puedeCrear = u && (u.rol === 'admin' || u.rol === 'sala');
  btn.style.display = puedeCrear ? 'flex' : 'none';
}

$('btn-nueva-mesa')?.addEventListener('click', () => abrirFormNuevaMesa());

function abrirFormNuevaMesa() {
  // Calcular número sugerido (siguiente al máximo existente)
  const numMax = lastMesas.length ? Math.max(...lastMesas.map(m => m.numero)) : 0;
  const numSugerido = numMax + 1;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'nueva-mesa-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-armchair"></i> Nueva mesa</span>
        <button class="modal-close" id="nm-close">&times;</button>
      </div>

      <div class="form-grid">
        <div class="form-row">
          <label>Número de mesa</label>
          <input id="nm-numero" type="number" min="1" value="${numSugerido}" placeholder="Ej: 11">
        </div>
        <div class="form-row">
          <label>Capacidad (pax)</label>
          <input id="nm-capacidad" type="number" min="1" max="20" value="4" placeholder="Ej: 4">
        </div>
      </div>

      <div class="form-row" style="margin-top:10px;">
        <label>Zona del restaurante</label>
        <select id="nm-zona">
          <option value="Terraza">Terraza</option>
          <option value="Salón principal" selected>Salón principal</option>
          <option value="Reservados">Reservados</option>
          <option value="Junto a barra">Junto a barra</option>
        </select>
      </div>

      <div id="nm-preview" style="margin-top:14px; padding:10px 12px; background:var(--bg-secondary); border-radius:8px; font-size:12px; color:var(--text-secondary);">
        <i class="ti ti-map-pin"></i> La mesa se colocará automáticamente en la zona seleccionada.
      </div>

      <div id="nm-error" style="display:none; margin-top:10px; padding:8px 12px; background:rgba(231,76,60,0.12); border-radius:8px; font-size:12px; color:#e74c3c;"></div>

      <button class="btn-primary" id="nm-guardar" style="margin-top:16px;">
        <i class="ti ti-check"></i> Añadir mesa
      </button>
    </div>`;

  document.body.appendChild(overlay);

  $('nm-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  $('nm-guardar').addEventListener('click', async () => {
    const numero    = parseInt($('nm-numero').value);
    const capacidad = parseInt($('nm-capacidad').value);
    const zona      = $('nm-zona').value;
    const errDiv    = $('nm-error');

    errDiv.style.display = 'none';

    if (!numero || numero < 1)    { mostrarErrorNM('El número de mesa debe ser mayor que 0'); return; }
    if (!capacidad || capacidad < 1) { mostrarErrorNM('La capacidad debe ser mayor que 0'); return; }
    if (lastMesas.find(m => m.numero === numero)) { mostrarErrorNM(`Ya existe la mesa ${numero}`); return; }

    const btn = $('nm-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const nuevaMesa = await apiFetch('/mesas', {
        method: 'POST',
        body: JSON.stringify({ numero, capacidad, zona }),
      });

      // Calcular posición automática en la zona
      const pos = posicionLibreEnZona(zona, lastMesas);
      FLOORPLAN_POS[numero] = pos;

      overlay.remove();
      await cargarResumen();
      renderFloorplan(lastMesas);
    } catch (e) {
      mostrarErrorNM(e.message || 'Error al crear la mesa');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i> Añadir mesa';
    }
  });

  function mostrarErrorNM(msg) {
    const d = $('nm-error');
    d.textContent = msg;
    d.style.display = 'block';
  }
}

// ── Botón eliminar en el detalle de mesa (solo admin, solo si está libre) ──
// Parchamos abrirDetalleMesa para añadir el botón de eliminar
const _abrirDetalleMesaOrig = abrirDetalleMesa;
window.abrirDetalleMesa = function(mesa) {
  _abrirDetalleMesaOrig(mesa);

  // Solo admin puede eliminar, y solo si la mesa está libre
  const u = Auth.getUsuario();
  if (u?.rol !== 'admin') return;
  if (mesa.estado !== 'libre') return;

  // Buscar el modal que acaba de abrirse y añadir botón eliminar
  setTimeout(() => {
    const modal = document.querySelector('.modal-overlay');
    if (!modal) return;
    const box = modal.querySelector('.modal-box');
    if (!box) return;

    const btnEliminar = document.createElement('button');
    btnEliminar.innerHTML = '<i class="ti ti-trash"></i> Eliminar mesa';
    btnEliminar.style.cssText = 'margin-top:8px; width:100%; padding:9px; background:rgba(231,76,60,0.1); border:0.5px solid rgba(231,76,60,0.3); border-radius:8px; color:#e74c3c; font-size:13px; font-weight:600; cursor:pointer;';
    btnEliminar.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la mesa ${mesa.numero}? Esta acción no se puede deshacer.`)) return;
      try {
        await apiFetch(`/mesas/${mesa.id}`, { method: 'DELETE' });
        // Limpiar posición del plano
        delete FLOORPLAN_POS[mesa.numero];
        modal.remove();
        await cargarResumen();
        renderFloorplan(lastMesas);
      } catch (e) {
        alert('No se puede eliminar: ' + e.message);
      }
    });
    box.appendChild(btnEliminar);
  }, 50);
};

// La visibilidad del botón se gestiona en switchView() e init()

// ── Configuración ───────────────────────────────────────────────────────────
async function cargarConfig() {
  try {
    const data = await apiFetch('/config');
    const cfg = data.data || data;
    const campos = [
      'nombre_restaurante','direccion','telefono','email','cif',
      'iva','moneda','ticket_pie','horario_apertura','horario_cierre',
      'capacidad_max','aviso_cocina_min'
    ];
    campos.forEach(clave => {
      const el = document.getElementById('cfg-' + clave);
      if (el && cfg[clave] !== undefined) el.value = cfg[clave];
    });
  } catch (e) {
    console.error('Error cargando configuración:', e);
  }
}

document.getElementById('btn-cfg-save')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-cfg-save');
  const msg = document.getElementById('cfg-save-msg');
  const campos = [
    'nombre_restaurante','direccion','telefono','email','cif',
    'iva','moneda','ticket_pie','horario_apertura','horario_cierre',
    'capacidad_max','aviso_cocina_min'
  ];
  const payload = {};
  campos.forEach(clave => {
    const el = document.getElementById('cfg-' + clave);
    if (el) payload[clave] = el.value;
  });
  try {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    await apiFetch('/config', { method: 'PATCH', body: JSON.stringify(payload) });
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), 3000);
  } catch (e) {
    alert('Error al guardar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
});

/* ── Tema claro / oscuro ── */
(function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('braseria-theme', next);
  });
})();
