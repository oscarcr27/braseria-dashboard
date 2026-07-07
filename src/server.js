// src/server.js
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { verificarToken } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Rutas públicas (login)
app.use('/auth', require('./routes/auth'));

// API protegida — requiere JWT válido
app.use('/api', verificarToken, require('./routes/api'));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Manejador de errores (siempre al final, con 4 argumentos)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🔥  La Brasería dashboard corriendo en http://localhost:${PORT}`);
  console.log(`🔐  Auth en http://localhost:${PORT}/auth/login`);
  console.log(`📡  API en  http://localhost:${PORT}/api/resumen\n`);
  console.log('   Usuarios por defecto:');
  console.log('   admin / admin123  → Acceso total');
  console.log('   carlos / sala456  → Sala (mesas + pedidos)');
  console.log('   pedro / cocina789 → Cocina (pedidos + vista cocina)\n');
});
