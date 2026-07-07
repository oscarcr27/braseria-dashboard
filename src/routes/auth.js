// src/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const db      = require('../db/database');
const { SECRET, PERMISOS, verificarToken } = require('../middleware/auth');

const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// POST /auth/login
router.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return err(res, 'Usuario y contraseña requeridos');

  const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(usuario);
  if (!user) return err(res, 'Credenciales incorrectas', 401);

  const valido = bcrypt.compareSync(password, user.password_hash);
  if (!valido) return err(res, 'Credenciales incorrectas', 401);

  const token = jwt.sign(
    { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol },
    SECRET,
    { expiresIn: '8h' }
  );

  // Actualizar último acceso
  db.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?").run(user.id);

  ok(res, {
    token,
    usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
    permisos: PERMISOS[user.rol] || [],
  });
});

// GET /auth/me — verificar token vigente
router.get('/me', verificarToken, (req, res) => {
  const user = db.prepare('SELECT id, usuario, nombre, rol FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!user) return err(res, 'Usuario no encontrado', 404);
  ok(res, { ...user, permisos: PERMISOS[user.rol] || [] });
});

// POST /auth/logout — solo limpia en cliente, pero lo registramos
router.post('/logout', verificarToken, (req, res) => {
  ok(res, { mensaje: 'Sesión cerrada' });
});

// ── Gestión de usuarios (solo admin) ──────────────────────────────────────
const { requiereRol } = require('../middleware/auth');

router.get('/usuarios', verificarToken, requiereRol('admin'), (req, res) => {
  const usuarios = db.prepare(
    'SELECT id, usuario, nombre, rol, activo, ultimo_acceso FROM usuarios ORDER BY id'
  ).all();
  ok(res, usuarios);
});

router.post('/usuarios', verificarToken, requiereRol('admin'), (req, res) => {
  const { usuario, nombre, password, rol } = req.body;
  if (!usuario || !nombre || !password || !rol) return err(res, 'Todos los campos son obligatorios');
  const rolesPermitidos = ['admin', 'sala', 'cocina'];
  if (!rolesPermitidos.includes(rol)) return err(res, `Rol inválido. Valores: ${rolesPermitidos.join(', ')}`);

  const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
  if (existe) return err(res, 'El nombre de usuario ya existe');

  const hash = bcrypt.hashSync(password, 10);
  const id = db.prepare(
    'INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?, ?, ?, ?)'
  ).run(usuario, nombre, hash, rol).lastInsertRowid;

  ok(res, db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(id));
});

router.patch('/usuarios/:id', verificarToken, requiereRol('admin'), (req, res) => {
  const { nombre, rol, activo, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!user) return err(res, 'Usuario no encontrado', 404);

  // No puede desactivarse a sí mismo
  if (req.usuario.id === Number(req.params.id) && activo === 0) {
    return err(res, 'No puedes desactivar tu propia cuenta');
  }

  const sets = [], vals = [];
  if (nombre !== undefined)  { sets.push('nombre = ?');         vals.push(nombre); }
  if (rol    !== undefined)  { sets.push('rol = ?');            vals.push(rol); }
  if (activo !== undefined)  { sets.push('activo = ?');         vals.push(activo); }
  if (password)              { sets.push('password_hash = ?');  vals.push(bcrypt.hashSync(password, 10)); }

  if (!sets.length) return err(res, 'Sin campos para actualizar');
  vals.push(req.params.id);
  db.prepare(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  ok(res, db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(req.params.id));
});

router.delete('/usuarios/:id', verificarToken, requiereRol('admin'), (req, res) => {
  if (req.usuario.id === Number(req.params.id)) return err(res, 'No puedes eliminar tu propia cuenta');
  db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(req.params.id);
  ok(res, { id: Number(req.params.id) });
});

module.exports = router;
