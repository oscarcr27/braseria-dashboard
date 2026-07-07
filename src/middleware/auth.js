// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// En producción, JWT_SECRET es obligatorio. En desarrollo se genera uno
// aleatorio en cada arranque (los tokens dejan de ser válidos al reiniciar,
// lo cual es preferible a tener un secreto fijo compartido en el código).
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('❌  Falta la variable de entorno JWT_SECRET en producción. Defínela en tu .env');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️   JWT_SECRET no definido — usando un secreto aleatorio solo válido para esta ejecución (modo desarrollo).');
}
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Permisos por rol
const PERMISOS = {
  admin:  ['dashboard', 'mesas', 'pedidos', 'cocina', 'carta', 'personal', 'ventas', 'config', 'reservas'],
  sala:   ['mesas', 'pedidos', 'carta', 'reservas'],
  cocina: ['cocina', 'pedidos', 'reservas'],
};

function verificarToken(req, res, next) {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    req.usuario = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

module.exports = { verificarToken, requiereRol, SECRET, PERMISOS };
