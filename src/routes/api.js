// src/routes/api.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { requiereRol } = require('../middleware/auth');

// ── Helper ────────────────────────────────────────────────────────────────
const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// Fecha de "hoy" calculada con la hora local de SQLite (misma zona horaria
// que usan los campos creado_en/cerrado_en). Usar new Date().toISOString()
// en JS daba la fecha en UTC y desincronizaba el filtro de facturación
// entre medianoche y la 1-2 de la madrugada (hora de Madrid).
const hoyLocal = () => db.prepare(`SELECT date('now','localtime') AS d`).get().d;
const fechaLocalHace = (dias) => db.prepare(`SELECT date('now','localtime', '-' || ? || ' days') AS d`).get(dias).d;

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS DEL DÍA
// ═══════════════════════════════════════════════════════════════════════════
router.get('/metricas', (req, res) => {
  const hoy = hoyLocal();

  const facturacion = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS total
    FROM pedidos
    WHERE estado IN ('cobrar','cerrado')
      AND date(creado_en) = ?
  `).get(hoy);

  const cubiertos = db.prepare(`
    SELECT COALESCE(SUM(p.pax_actual),0) AS total
    FROM mesas p
    WHERE p.estado IN ('ocupada','pendiente')
  `).get();

  const ticketMedio = db.prepare(`
    SELECT COALESCE(AVG(total),0) AS media
    FROM pedidos
    WHERE estado IN ('cobrar','cerrado')
      AND date(creado_en) = ?
  `).get(hoy);

  const tiempoEspera = db.prepare(`
    SELECT COALESCE(
      AVG(CAST((julianday('now','localtime') - julianday(creado_en)) * 1440 AS INTEGER)),
      0
    ) AS minutos
    FROM pedidos
    WHERE estado IN ('cocina','servir')
  `).get();

  ok(res, {
    facturacion:  Math.round(facturacion.total * 100) / 100,
    cubiertos:    cubiertos.total,
    ticketMedio:  Math.round(ticketMedio.media * 100) / 100,
    tiempoEspera: Math.round(tiempoEspera.minutos),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MESAS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/mesas', (req, res) => {
  const mesas = db.prepare('SELECT * FROM mesas ORDER BY numero').all();
  ok(res, mesas);
});

// Crear mesa nueva (admin + sala)
router.post('/mesas', requiereRol('admin', 'sala'), (req, res) => {
  const { numero, capacidad, zona } = req.body;
  if (!numero || isNaN(numero) || numero < 1)
    return err(res, 'numero es obligatorio y debe ser positivo');
  if (!capacidad || isNaN(capacidad) || capacidad < 1)
    return err(res, 'capacidad es obligatoria y debe ser positiva');

  const existe = db.prepare('SELECT id FROM mesas WHERE numero = ?').get(numero);
  if (existe) return err(res, `Ya existe la mesa ${numero}`);

  const id = db.prepare(`
    INSERT INTO mesas (numero, capacidad, estado, pax_actual, zona)
    VALUES (?, ?, 'libre', 0, ?)
  `).run(numero, capacidad, zona || null).lastInsertRowid;

  ok(res, db.prepare('SELECT * FROM mesas WHERE id = ?').get(id));
});

// Eliminar mesa (solo admin, y solo si está libre y sin pedidos activos)
router.delete('/mesas/:id', requiereRol('admin'), (req, res) => {
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id);
  if (!mesa) return err(res, 'Mesa no encontrada', 404);
  if (mesa.estado !== 'libre') return err(res, 'Solo se puede eliminar una mesa libre');
  const pedidosActivos = db.prepare(`
    SELECT COUNT(*) AS n FROM pedidos WHERE mesa_id = ? AND estado != 'cerrado'
  `).get(req.params.id);
  if (pedidosActivos.n) return err(res, 'La mesa tiene pedidos activos');
  db.prepare('DELETE FROM mesas WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

router.get('/mesas/:id', (req, res) => {
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id);
  if (!mesa) return err(res, 'Mesa no encontrada', 404);
  ok(res, mesa);
});

// Actualizar estado de una mesa
router.patch('/mesas/:id', (req, res) => {
  const { estado, pax_actual, inicio_turno } = req.body;
  const allowed = ['libre','ocupada','reservada','pendiente'];
  if (estado && !allowed.includes(estado))
    return err(res, `Estado inválido. Valores permitidos: ${allowed.join(', ')}`);

  const fields = [];
  const values = [];
  if (estado        !== undefined) { fields.push('estado = ?');        values.push(estado); }
  if (pax_actual    !== undefined) { fields.push('pax_actual = ?');    values.push(pax_actual); }
  if (inicio_turno  !== undefined) { fields.push('inicio_turno = ?');  values.push(inicio_turno); }

  if (!fields.length) return err(res, 'Sin campos para actualizar');

  values.push(req.params.id);
  db.prepare(`UPDATE mesas SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  ok(res, db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id));
});

// ═══════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/pedidos', (req, res) => {
  const { estado, mesa_id } = req.query;
  let sql = `
    SELECT p.*, m.numero AS mesa_numero
    FROM pedidos p
    JOIN mesas m ON m.id = p.mesa_id
    WHERE p.estado != 'cerrado'
  `;
  const params = [];
  if (estado)  { sql += ' AND p.estado = ?';   params.push(estado); }
  if (mesa_id) { sql += ' AND p.mesa_id = ?';  params.push(mesa_id); }
  sql += ' ORDER BY p.creado_en DESC';

  const pedidos = db.prepare(sql).all(...params);

  // Inyecta las líneas de cada pedido
  const getLineas = db.prepare('SELECT * FROM lineas_pedido WHERE pedido_id = ?');
  pedidos.forEach(p => { p.lineas = getLineas.all(p.id); });

  ok(res, pedidos);
});

router.get('/pedidos/:id', (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return err(res, 'Pedido no encontrado', 404);
  pedido.lineas = db.prepare('SELECT * FROM lineas_pedido WHERE pedido_id = ?').all(pedido.id);
  ok(res, pedido);
});

// Crear pedido nuevo
router.post('/pedidos', (req, res) => {
  const { mesa_id, lineas } = req.body;
  if (!mesa_id) return err(res, 'mesa_id es obligatorio');
  if (!Array.isArray(lineas) || !lineas.length) return err(res, 'Debe incluir al menos una línea');

  const total = lineas.reduce((s, l) => s + (l.cantidad * l.precio_unit), 0);

  let pedido;
  try {
    db.exec('BEGIN');
    const pedidoId = db.prepare(`
      INSERT INTO pedidos (mesa_id, estado, total) VALUES (?, 'cocina', ?)
    `).run(mesa_id, total).lastInsertRowid;

    const insertLinea = db.prepare(`
      INSERT INTO lineas_pedido (pedido_id, producto, cantidad, precio_unit)
      VALUES (?, ?, ?, ?)
    `);
    lineas.forEach(l => insertLinea.run(pedidoId, l.producto, l.cantidad, l.precio_unit));

    db.prepare(`UPDATE mesas SET estado = 'ocupada' WHERE id = ?`).run(mesa_id);

    pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return err(res, 'Error al crear pedido: ' + e.message);
  }

  pedido.lineas = db.prepare('SELECT * FROM lineas_pedido WHERE pedido_id = ?').all(pedido.id);
  res.status(201).json({ ok: true, data: pedido });
});

// Avanzar estado de un pedido: cocina → servir → cobrar → cerrado
router.patch('/pedidos/:id/estado', (req, res) => {
  const { estado } = req.body;
  const allowed = ['cocina','servir','cobrar','cerrado'];
  if (!allowed.includes(estado)) return err(res, `Estado inválido`);

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return err(res, 'Pedido no encontrado', 404);

  try {
    db.exec('BEGIN');
    const cerradoEn = estado === 'cerrado' ? "datetime('now','localtime')" : 'NULL';
    db.prepare(`
      UPDATE pedidos SET estado = ?, cerrado_en = ${cerradoEn} WHERE id = ?
    `).run(estado, pedido.id);

    // Si se cierra el pedido, liberar la mesa si no tiene otros pedidos activos
    if (estado === 'cerrado') {
      const otrosPedidos = db.prepare(`
        SELECT COUNT(*) AS n FROM pedidos
        WHERE mesa_id = ? AND estado != 'cerrado' AND id != ?
      `).get(pedido.mesa_id, pedido.id);

      if (!otrosPedidos.n) {
        db.prepare(`UPDATE mesas SET estado = 'libre', pax_actual = 0, inicio_turno = NULL WHERE id = ?`)
          .run(pedido.mesa_id);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return err(res, 'Error al actualizar estado: ' + e.message);
  }

  ok(res, db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id));
});

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL
// ═══════════════════════════════════════════════════════════════════════════
router.get('/personal', (req, res) => {
  ok(res, db.prepare('SELECT * FROM personal WHERE activo = 1 ORDER BY id').all());
});

router.post('/personal', requiereRol('admin'), (req, res) => {
  const { nombre, rol, zona } = req.body;
  if (!nombre || !rol) return err(res, 'nombre y rol son obligatorios');
  const id = db.prepare('INSERT INTO personal (nombre, rol, zona) VALUES (?, ?, ?)').run(nombre, rol, zona || '').lastInsertRowid;
  ok(res, db.prepare('SELECT * FROM personal WHERE id = ?').get(id));
});

router.delete('/personal/:id', requiereRol('admin'), (req, res) => {
  db.prepare('UPDATE personal SET activo = 0 WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
// CARTA
// ═══════════════════════════════════════════════════════════════════════════
router.get('/carta', (req, res) => {
  ok(res, db.prepare('SELECT * FROM carta ORDER BY categoria, nombre').all());
});

router.post('/carta', requiereRol('admin'), (req, res) => {
  const { categoria, nombre, descripcion, precio, disponible } = req.body;
  if (!categoria || !nombre) return err(res, 'categoria y nombre son obligatorios');
  if (precio === undefined || isNaN(precio) || precio < 0) return err(res, 'precio inválido');

  const id = db.prepare(`
    INSERT INTO carta (categoria, nombre, descripcion, precio, disponible)
    VALUES (?, ?, ?, ?, ?)
  `).run(categoria, nombre, descripcion || null, precio, disponible === undefined ? 1 : Number(!!disponible)).lastInsertRowid;

  ok(res, db.prepare('SELECT * FROM carta WHERE id = ?').get(id));
});

router.patch('/carta/:id', requiereRol('admin'), (req, res) => {
  const plato = db.prepare('SELECT * FROM carta WHERE id = ?').get(req.params.id);
  if (!plato) return err(res, 'Plato no encontrado', 404);

  const { categoria, nombre, descripcion, precio, disponible } = req.body;
  const fields = [], values = [];
  if (categoria    !== undefined) { fields.push('categoria = ?');   values.push(categoria); }
  if (nombre       !== undefined) { fields.push('nombre = ?');      values.push(nombre); }
  if (descripcion  !== undefined) { fields.push('descripcion = ?'); values.push(descripcion); }
  if (precio       !== undefined) { fields.push('precio = ?');      values.push(precio); }
  if (disponible   !== undefined) { fields.push('disponible = ?');  values.push(Number(!!disponible)); }

  if (!fields.length) return err(res, 'Sin campos para actualizar');

  values.push(req.params.id);
  db.prepare(`UPDATE carta SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  ok(res, db.prepare('SELECT * FROM carta WHERE id = ?').get(req.params.id));
});

router.delete('/carta/:id', requiereRol('admin'), (req, res) => {
  const plato = db.prepare('SELECT * FROM carta WHERE id = ?').get(req.params.id);
  if (!plato) return err(res, 'Plato no encontrado', 404);
  db.prepare('DELETE FROM carta WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
// VENTAS POR CATEGORÍA (día actual)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/ventas', (req, res) => {
  const fecha = req.query.fecha || hoyLocal();
  const ventas = db.prepare(`
    SELECT categoria, SUM(importe) AS importe
    FROM ventas_dia WHERE fecha = ?
    GROUP BY categoria ORDER BY importe DESC
  `).all(fecha);
  ok(res, ventas);
});

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN COMPLETO (una sola llamada para el dashboard)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/resumen', (req, res) => {
  const hoy = hoyLocal();

  const facturacion = db.prepare(`SELECT COALESCE(SUM(total),0) AS v FROM pedidos WHERE estado IN ('cobrar','cerrado') AND date(creado_en) = ?`).get(hoy).v;
  const cubiertos   = db.prepare(`SELECT COALESCE(SUM(pax_actual),0) AS v FROM mesas WHERE estado IN ('ocupada','pendiente')`).get().v;
  const ticketMedio = db.prepare(`SELECT COALESCE(AVG(total),0) AS v FROM pedidos WHERE estado IN ('cobrar','cerrado') AND date(creado_en) = ?`).get(hoy).v;
  const tiempoEspera= db.prepare(`SELECT COALESCE(AVG(CAST((julianday('now','localtime')-julianday(creado_en))*1440 AS INTEGER)),0) AS v FROM pedidos WHERE estado IN ('cocina','servir')`).get().v;

  const mesas    = db.prepare('SELECT * FROM mesas ORDER BY numero').all();
  const personal = db.prepare('SELECT * FROM personal WHERE activo = 1').all();
  const ventas   = db.prepare(`SELECT categoria, SUM(importe) AS importe FROM ventas_dia WHERE fecha = ? GROUP BY categoria ORDER BY importe DESC`).all(hoy);

  const pedidos = db.prepare(`
    SELECT p.*, m.numero AS mesa_numero FROM pedidos p
    JOIN mesas m ON m.id = p.mesa_id
    WHERE p.estado != 'cerrado' ORDER BY p.creado_en DESC
  `).all();
  const getLineas = db.prepare('SELECT producto, cantidad, precio_unit FROM lineas_pedido WHERE pedido_id = ?');
  pedidos.forEach(p => { p.lineas = getLineas.all(p.id); });

  ok(res, {
    metricas: {
      facturacion:  Math.round(facturacion  * 100) / 100,
      cubiertos,
      ticketMedio:  Math.round(ticketMedio  * 100) / 100,
      tiempoEspera: Math.round(tiempoEspera),
    },
    mesas,
    pedidos,
    personal,
    ventas,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESERVAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/reservas?fecha=YYYY-MM-DD  (sin fecha → hoy; ?futuras=1 → todas desde hoy)
router.get('/reservas', (req, res) => {
  const hoy = hoyLocal();
  if (req.query.futuras) {
    const rows = db.prepare(`
      SELECT r.*, m.numero AS mesa_numero
      FROM reservas r
      LEFT JOIN mesas m ON m.id = r.mesa_id
      WHERE r.fecha >= ?
      ORDER BY r.fecha, r.hora
    `).all(hoy);
    return ok(res, rows);
  }
  const fecha = req.query.fecha || hoy;
  const rows = db.prepare(`
    SELECT r.*, m.numero AS mesa_numero
    FROM reservas r
    LEFT JOIN mesas m ON m.id = r.mesa_id
    WHERE r.fecha = ?
    ORDER BY r.hora
  `).all(fecha);
  ok(res, rows);
});

// POST /api/reservas
router.post('/reservas', (req, res) => {
  const { nombre, fecha, hora, pax, mesa_id, notas } = req.body;
  if (!nombre || !fecha || !hora || !pax) return err(res, 'nombre, fecha, hora y pax son obligatorios');
  const id = db.prepare(`
    INSERT INTO reservas (nombre, fecha, hora, pax, mesa_id, notas)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nombre, fecha, hora, pax, mesa_id || null, notas || null).lastInsertRowid;
  ok(res, db.prepare('SELECT * FROM reservas WHERE id = ?').get(id));
});

// DELETE /api/reservas/:id
router.delete('/reservas/:id', (req, res) => {
  const r = db.prepare('SELECT id FROM reservas WHERE id = ?').get(req.params.id);
  if (!r) return err(res, 'Reserva no encontrada', 404);
  db.prepare('DELETE FROM reservas WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL — turnos y horarios
// ═══════════════════════════════════════════════════════════════════════════

// PATCH /api/personal/:id  — editar nombre, rol, zona, activo
router.patch('/personal/:id', requiereRol('admin'), (req, res) => {
  const { nombre, rol, zona, activo } = req.body;
  const p = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!p) return err(res, 'Empleado no encontrado', 404);
  const sets = [], vals = [];
  if (nombre !== undefined) { sets.push('nombre = ?'); vals.push(nombre); }
  if (rol    !== undefined) { sets.push('rol = ?');    vals.push(rol); }
  if (zona   !== undefined) { sets.push('zona = ?');   vals.push(zona); }
  if (activo !== undefined) { sets.push('activo = ?'); vals.push(activo); }
  if (!sets.length) return err(res, 'Sin campos para actualizar');
  vals.push(req.params.id);
  db.prepare(`UPDATE personal SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  ok(res, db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id));
});

// GET /api/personal/:id/turnos
router.get('/personal/:id/turnos', requiereRol('admin'), (req, res) => {
  const turnos = db.prepare(`
    SELECT * FROM turnos WHERE empleado_id = ? ORDER BY fecha DESC, hora_inicio
  `).all(req.params.id);
  ok(res, turnos);
});

// GET /api/turnos?fecha=YYYY-MM-DD
router.get('/turnos', requiereRol('admin'), (req, res) => {
  const hoy = hoyLocal();
  const fecha = req.query.fecha || hoy;
  const turnos = db.prepare(`
    SELECT t.*, p.nombre AS empleado_nombre, p.rol AS empleado_rol
    FROM turnos t
    JOIN personal p ON p.id = t.empleado_id
    WHERE t.fecha = ?
    ORDER BY t.hora_inicio
  `).all(fecha);
  ok(res, turnos);
});

// POST /api/turnos
router.post('/turnos', requiereRol('admin'), (req, res) => {
  const { empleado_id, fecha, hora_inicio, hora_fin, zona } = req.body;
  if (!empleado_id || !fecha || !hora_inicio || !hora_fin) return err(res, 'empleado_id, fecha, hora_inicio y hora_fin son obligatorios');
  const id = db.prepare(`
    INSERT INTO turnos (empleado_id, fecha, hora_inicio, hora_fin, zona)
    VALUES (?, ?, ?, ?, ?)
  `).run(empleado_id, fecha, hora_inicio, hora_fin, zona || null).lastInsertRowid;
  ok(res, db.prepare('SELECT * FROM turnos WHERE id = ?').get(id));
});

// DELETE /api/turnos/:id
router.delete('/turnos/:id', requiereRol('admin'), (req, res) => {
  const t = db.prepare('SELECT id FROM turnos WHERE id = ?').get(req.params.id);
  if (!t) return err(res, 'Turno no encontrado', 404);
  db.prepare('DELETE FROM turnos WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
// INFORMES — datos históricos para la vista de análisis
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/informes/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/informes/resumen', (req, res) => {
  const hoy   = hoyLocal();
  const desde = req.query.desde || fechaLocalHace(6);
  const hasta = req.query.hasta || hoy;

  // Facturación y pedidos por día (usando pedidos reales)
  const porDia = db.prepare(`
    SELECT date(creado_en) AS fecha,
           COUNT(*) AS num_pedidos,
           COALESCE(SUM(total), 0) AS facturacion,
           COALESCE(AVG(total), 0) AS ticket_medio
    FROM pedidos
    WHERE estado IN ('cobrar','cerrado')
      AND date(creado_en) BETWEEN ? AND ?
    GROUP BY date(creado_en)
    ORDER BY fecha
  `).all(desde, hasta);

  // Ventas por categoría en el rango
  const porCategoria = db.prepare(`
    SELECT categoria,
           SUM(importe) AS importe,
           COUNT(*) AS entradas
    FROM ventas_dia
    WHERE fecha BETWEEN ? AND ?
    GROUP BY categoria
    ORDER BY importe DESC
  `).all(desde, hasta);

  // Totales del período
  const totales = db.prepare(`
    SELECT COUNT(*) AS total_pedidos,
           COALESCE(SUM(total), 0) AS facturacion_total,
           COALESCE(AVG(total), 0) AS ticket_medio,
           COALESCE(MAX(total), 0) AS ticket_maximo,
           COALESCE(MIN(total), 0) AS ticket_minimo
    FROM pedidos
    WHERE estado IN ('cobrar','cerrado')
      AND date(creado_en) BETWEEN ? AND ?
  `).get(desde, hasta);

  // Hora punta (franja de 1 h con más pedidos)
  const porHora = db.prepare(`
    SELECT strftime('%H', creado_en) AS hora,
           COUNT(*) AS num
    FROM pedidos
    WHERE estado IN ('cobrar','cerrado')
      AND date(creado_en) BETWEEN ? AND ?
    GROUP BY hora
    ORDER BY num DESC
    LIMIT 1
  `).get(desde, hasta);

  // Top 5 productos del período
  const topProductos = db.prepare(`
    SELECT lp.producto,
           SUM(lp.cantidad) AS unidades,
           SUM(lp.cantidad * lp.precio_unit) AS importe
    FROM lineas_pedido lp
    JOIN pedidos p ON p.id = lp.pedido_id
    WHERE p.estado IN ('cobrar','cerrado')
      AND date(p.creado_en) BETWEEN ? AND ?
    GROUP BY lp.producto
    ORDER BY importe DESC
    LIMIT 5
  `).all(desde, hasta);

  ok(res, {
    desde,
    hasta,
    totales: {
      total_pedidos:   totales.total_pedidos,
      facturacion:     Math.round(totales.facturacion_total * 100) / 100,
      ticket_medio:    Math.round(totales.ticket_medio * 100) / 100,
      ticket_maximo:   Math.round(totales.ticket_maximo * 100) / 100,
      ticket_minimo:   Math.round(totales.ticket_minimo * 100) / 100,
      hora_punta:      porHora ? porHora.hora + ':00' : '—',
    },
    por_dia:        porDia.map(r => ({ ...r, facturacion: Math.round(r.facturacion * 100) / 100, ticket_medio: Math.round(r.ticket_medio * 100) / 100 })),
    por_categoria:  porCategoria,
    top_productos:  topProductos,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKET DE IMPRESIÓN — devuelve el HTML del ticket de un pedido
// ═══════════════════════════════════════════════════════════════════════════
router.get('/pedidos/:id/ticket', (req, res) => {
  const pedido = db.prepare(`
    SELECT p.*, m.numero AS mesa_numero
    FROM pedidos p JOIN mesas m ON m.id = p.mesa_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!pedido) return err(res, 'Pedido no encontrado', 404);

  pedido.lineas = db.prepare('SELECT * FROM lineas_pedido WHERE pedido_id = ?').all(pedido.id);
  ok(res, pedido);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DEL RESTAURANTE
// ═══════════════════════════════════════════════════════════════════════════
router.get('/config', requiereRol('admin'), (req, res) => {
  const rows = db.prepare('SELECT clave, valor FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.clave] = r.valor; });
  ok(res, cfg);
});

router.patch('/config', requiereRol('admin'), (req, res) => {
  const campos = req.body;
  if (!campos || typeof campos !== 'object') return err(res, 'Datos inválidos');
  const upsert = db.prepare('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)');
  const actualizar = db.transaction((obj) => {
    for (const [clave, valor] of Object.entries(obj)) {
      upsert.run(clave, String(valor));
    }
  });
  actualizar(campos);
  ok(res, { actualizado: Object.keys(campos).length });
});

module.exports = router;
