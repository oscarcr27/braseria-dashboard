// src/db/database.js
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');

const DB_PATH = path.join(__dirname, '../../data/braseria.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

// ── Esquema ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario        TEXT UNIQUE NOT NULL,
    nombre         TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    rol            TEXT NOT NULL DEFAULT 'sala',
    activo         INTEGER NOT NULL DEFAULT 1,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ultimo_acceso  TEXT
  );

  CREATE TABLE IF NOT EXISTS mesas (
    id           INTEGER PRIMARY KEY,
    numero       INTEGER UNIQUE NOT NULL,
    capacidad    INTEGER NOT NULL DEFAULT 4,
    estado       TEXT NOT NULL DEFAULT 'libre',
    pax_actual   INTEGER DEFAULT 0,
    inicio_turno TEXT,
    zona         TEXT
  );

  CREATE TABLE IF NOT EXISTS personal (
    id      INTEGER PRIMARY KEY,
    nombre  TEXT NOT NULL,
    rol     TEXT NOT NULL,
    zona    TEXT,
    activo  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa_id    INTEGER NOT NULL REFERENCES mesas(id),
    estado     TEXT NOT NULL DEFAULT 'cocina',
    total      REAL DEFAULT 0,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    cerrado_en TEXT
  );

  CREATE TABLE IF NOT EXISTS lineas_pedido (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id   INTEGER NOT NULL REFERENCES pedidos(id),
    producto    TEXT NOT NULL,
    cantidad    INTEGER NOT NULL DEFAULT 1,
    precio_unit REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ventas_dia (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha     TEXT NOT NULL DEFAULT (date('now','localtime')),
    categoria TEXT NOT NULL,
    importe   REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reservas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT NOT NULL,
    fecha      TEXT NOT NULL,
    hora       TEXT NOT NULL,
    pax        INTEGER NOT NULL DEFAULT 2,
    mesa_id    INTEGER REFERENCES mesas(id),
    notas      TEXT,
    estado     TEXT NOT NULL DEFAULT 'confirmada',
    creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS turnos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id  INTEGER NOT NULL REFERENCES personal(id),
    fecha        TEXT NOT NULL,
    hora_inicio  TEXT NOT NULL,
    hora_fin     TEXT NOT NULL,
    zona         TEXT,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS carta (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria   TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    precio      REAL NOT NULL,
    disponible  INTEGER NOT NULL DEFAULT 1,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Seed usuarios ──────────────────────────────────────────────────────────
const yaHayUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;

if (!yaHayUsuarios) {
  const insUser = db.prepare(`
    INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?, ?, ?, ?)
  `);
  [
    ['admin',  'Administrador',     bcrypt.hashSync('admin123', 10),  'admin'],
    ['carlos', 'Carlos Ruiz',       bcrypt.hashSync('sala456', 10),   'sala'],
    ['ana',    'Ana Martínez',      bcrypt.hashSync('sala456', 10),   'sala'],
    ['pedro',  'Pedro García',      bcrypt.hashSync('cocina789', 10), 'cocina'],
    ['laura',  'Laura Fernández',   bcrypt.hashSync('cocina789', 10), 'cocina'],
  ].forEach(r => insUser.run(...r));
  console.log('✅  Usuarios creados (admin/admin123, carlos/sala456, pedro/cocina789)');
}

// ── Seed resto de tablas ───────────────────────────────────────────────────
const yaHayMesas = db.prepare('SELECT COUNT(*) AS n FROM mesas').get().n;

if (!yaHayMesas) {
  const insMesa = db.prepare(`INSERT INTO mesas (numero,capacidad,estado,pax_actual,inicio_turno) VALUES (?,?,?,?,?)`);
  [
    [1,2,'libre',0,null],[2,4,'ocupada',4,'12:15'],[3,2,'ocupada',2,'12:38'],
    [4,6,'reservada',0,null],[5,6,'ocupada',6,'11:55'],[6,4,'pendiente',4,'11:20'],
    [7,4,'ocupada',3,'13:00'],[8,4,'libre',0,null],[9,4,'reservada',0,null],
    [10,4,'ocupada',4,'12:22'],
  ].forEach(r => insMesa.run(...r));

  const insPer = db.prepare(`INSERT INTO personal (nombre,rol,zona) VALUES (?,?,?)`);
  [
    ['Carlos Ruiz','Jefe de sala','Mesas 1–5'],
    ['Ana Martínez','Camarera','Mesas 6–10'],
    ['Pedro García','Jefe de cocina','Cocina principal'],
    ['Laura Fernández','Ayudante cocina','Entrantes'],
  ].forEach(r => insPer.run(...r));

  const insPed   = db.prepare(`INSERT INTO pedidos (mesa_id,estado,total,creado_en) VALUES (?,?,?,datetime('now','-'||?||' minutes','localtime'))`);
  const insLinea = db.prepare(`INSERT INTO lineas_pedido (pedido_id,producto,cantidad,precio_unit) VALUES (?,?,?,?)`);

  const p1 = insPed.run(2,'cocina',68.5,45).lastInsertRowid;
  insLinea.run(p1,'Cocido madrileño',2,18.5); insLinea.run(p1,'Vino Ribera Duero',1,22.0); insLinea.run(p1,'Agua',1,2.5);
  const p2 = insPed.run(3,'servir',32.0,22).lastInsertRowid;
  insLinea.run(p2,'Croquetas caseras',1,9.5); insLinea.run(p2,'Carpaccio de ternera',1,14.5); insLinea.run(p2,'Agua con gas',2,2.0);
  const p3 = insPed.run(5,'cobrar',198.0,60).lastInsertRowid;
  insLinea.run(p3,'Paella valenciana',6,24.0); insLinea.run(p3,'Sangría jarra',2,18.0); insLinea.run(p3,'Pan',6,1.5);
  const p4 = insPed.run(7,'cocina',54.5,12).lastInsertRowid;
  insLinea.run(p4,'Chuletón 1kg',1,38.0); insLinea.run(p4,'Ensalada mixta',1,9.5); insLinea.run(p4,'Cerveza caña',2,2.5);
  const p5 = insPed.run(10,'servir',62.0,38).lastInsertRowid;
  insLinea.run(p5,'Merluza a la vasca',2,22.0); insLinea.run(p5,'Postre del día',2,6.5); insLinea.run(p5,'Café con leche',2,1.8);

  const insVenta = db.prepare('INSERT INTO ventas_dia (categoria,importe) VALUES (?,?)');
  [['Carnes',840],['Pescados',610],['Bebidas',580],['Vinos',450],['Entrantes',390],['Postres',210]]
    .forEach(r => insVenta.run(...r));

  console.log('✅  Base de datos inicializada con datos de ejemplo');
}

// ── Seed carta ──────────────────────────────────────────────────────────────
const yaHayCarta = db.prepare('SELECT COUNT(*) AS n FROM carta').get().n;

if (!yaHayCarta) {
  const insCarta = db.prepare(`
    INSERT INTO carta (categoria, nombre, descripcion, precio, disponible) VALUES (?, ?, ?, ?, ?)
  `);
  [
    ['Entrantes','Croquetas caseras','Jamón ibérico, bechamel cremosa',9.5,1],
    ['Entrantes','Carpaccio de ternera','Rúcula, parmesano, aceite de trufa',14.5,1],
    ['Entrantes','Ensalada mixta','Lechuga, tomate, cebolla, atún',9.5,1],
    ['Carnes','Chuletón 1kg','Buey madurado, a la brasa',38.0,1],
    ['Carnes','Cocido madrileño','Receta tradicional de la casa',18.5,1],
    ['Carnes','Solomillo al whisky','Con patata panadera',22.0,1],
    ['Pescados','Merluza a la vasca','Salsa verde, almejas',22.0,1],
    ['Pescados','Paella valenciana','Mínimo 2 personas',24.0,1],
    ['Pescados','Pulpo a la brasa','Pimentón de la Vera, patata',19.5,0],
    ['Vinos','Vino Ribera Duero','Copa',22.0,1],
    ['Vinos','Sangría jarra','1 litro, fruta de temporada',18.0,1],
    ['Bebidas','Agua',null,2.5,1],
    ['Bebidas','Agua con gas',null,2.0,1],
    ['Bebidas','Cerveza caña',null,2.5,1],
    ['Bebidas','Café con leche',null,1.8,1],
    ['Postres','Postre del día','Consultar a tu camarero',6.5,1],
    ['Postres','Pan',null,1.5,1],
  ].forEach(r => insCarta.run(...r));

  console.log('✅  Carta inicializada con platos de ejemplo');
}

// ── Seed reservas ──────────────────────────────────────────────────────────
const yaHayReservas = db.prepare('SELECT COUNT(*) AS n FROM reservas').get().n;
if (!yaHayReservas) {
  const insRes = db.prepare(`INSERT INTO reservas (nombre, fecha, hora, pax, mesa_id, notas, estado) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const hoy = new Date().toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  insRes.run('García Martínez', hoy,    '14:00', 4, 4, 'Cumpleaños, pedir tarta', 'confirmada');
  insRes.run('López Familia',   hoy,    '14:30', 6, 5, null, 'confirmada');
  insRes.run('Fernández',       hoy,    '15:00', 2, 9, 'Aniversario', 'confirmada');
  insRes.run('Pérez & co',      manana, '13:30', 4, 1, null, 'confirmada');
  insRes.run('Sánchez',         manana, '14:00', 8, 4, 'Mesa de empresa', 'confirmada');
  console.log('✅  Reservas de ejemplo creadas');
}

// ── Seed turnos ─────────────────────────────────────────────────────────────
const yaHayTurnos = db.prepare('SELECT COUNT(*) AS n FROM turnos').get().n;
if (!yaHayTurnos) {
  const insTurno = db.prepare(`INSERT INTO turnos (empleado_id, fecha, hora_inicio, hora_fin, zona) VALUES (?, ?, ?, ?, ?)`);
  const hoy = new Date().toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // IDs: 1=Carlos, 2=Ana, 3=Pedro, 4=Laura (del seed de personal)
  insTurno.run(1, hoy,    '11:00', '17:00', 'Mesas 1–5');
  insTurno.run(2, hoy,    '12:00', '18:00', 'Mesas 6–10');
  insTurno.run(3, hoy,    '10:00', '16:00', 'Cocina principal');
  insTurno.run(4, hoy,    '10:00', '16:00', 'Entrantes');
  insTurno.run(1, manana, '12:00', '18:00', 'Mesas 1–5');
  insTurno.run(2, manana, '11:00', '17:00', 'Mesas 6–10');
  insTurno.run(3, manana, '11:00', '17:00', 'Cocina principal');
  insTurno.run(4, manana, '11:00', '17:00', 'Entrantes');
  console.log('✅  Turnos de ejemplo creados');
}

// ── Migración: añadir zona a mesas si no existe ───────────────────────────
try {
  db.prepare('SELECT zona FROM mesas LIMIT 1').get();
} catch (_) {
  db.prepare('ALTER TABLE mesas ADD COLUMN zona TEXT').run();
  console.log('✅  Migración: columna zona añadida a mesas');
}

// ── Tabla de configuración del restaurante ────────────────────────────────
db.prepare(`
  CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )
`).run();

// Valores por defecto si la tabla está vacía
const yaHayConfig = db.prepare('SELECT COUNT(*) AS n FROM config').get().n;
if (!yaHayConfig) {
  const insConfig = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
  insConfig.run('nombre_restaurante', 'La Brasería');
  insConfig.run('direccion', 'Calle Mayor, 12 — Madrid');
  insConfig.run('telefono', '+34 91 000 00 00');
  insConfig.run('email', 'info@labraseria.es');
  insConfig.run('cif', 'B12345678');
  insConfig.run('iva', '10');
  insConfig.run('moneda', 'EUR');
  insConfig.run('ticket_pie', 'Gracias por su visita. ¡Hasta pronto!');
  insConfig.run('horario_apertura', '12:00');
  insConfig.run('horario_cierre', '23:30');
  insConfig.run('capacidad_max', '60');
  insConfig.run('aviso_cocina_min', '15');
  console.log('✅  Configuración por defecto creada');
}

module.exports = db;
