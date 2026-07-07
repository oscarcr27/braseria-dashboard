# 🔥 La Brasería — Dashboard de gestión

Dashboard web dinámico para restaurantes. Stack: **Node.js + Express + SQLite**.  
Sin dependencias de nube. Todo corre en local.

---

## Requisitos

- **Node.js 22.5 o superior** (usa el módulo nativo `node:sqlite`, aún experimental)
- npm

---

## Instalación y arranque

```bash
# 1. Instala dependencias
npm install

# 2. Configura las variables de entorno
cp .env.example .env
# Edita .env y define un JWT_SECRET propio, sobre todo si vas a desplegar en producción

# 3. Arranca el servidor
npm start          # producción
npm run dev        # desarrollo (recarga automática con --watch)
```

Abre **http://localhost:3000** en tu navegador. Te redirigirá a `/login.html` si no tienes sesión.

La base de datos SQLite se crea automáticamente en `data/braseria.db`  
con datos de ejemplo la primera vez que arranques. **Este archivo no se sube a git** (ver `.gitignore`), así que cada persona que clone el repo arranca con datos limpios de ejemplo.

### Usuarios de ejemplo

| Usuario | Contraseña | Rol | Acceso |
|---------|-----------|-----|--------|
| `admin` | `admin123` | admin | Total |
| `carlos` | `sala456` | sala | Mesas, pedidos, carta, reservas |
| `pedro` | `cocina789` | cocina | Cocina, pedidos, reservas |

⚠️ Cambia estas contraseñas (o borra `data/braseria.db` y edita el seed en `src/db/database.js`) antes de usar esto en un entorno real.

---

## Estructura del proyecto

```
braseria/
├── src/
│   ├── server.js            # Servidor Express
│   ├── db/
│   │   └── database.js      # Esquema SQLite + seed de datos
│   ├── middleware/
│   │   └── auth.js          # Verificación de JWT y permisos por rol
│   └── routes/
│       ├── auth.js          # Login, sesión y gestión de usuarios
│       └── api.js           # Endpoints REST del dashboard
├── public/
│   ├── index.html           # SPA del dashboard
│   ├── login.html           # Pantalla de login
│   ├── css/styles.css       # Estilos
│   └── js/
│       ├── auth.js          # Sesión en el cliente (token, permisos)
│       └── app.js           # Lógica del frontend
├── data/                    # Creado automáticamente (no se sube a git)
│   └── braseria.db          # Base de datos SQLite
├── .env.example              # Plantilla de variables de entorno
└── package.json
```

---

## Autenticación

Todas las rutas bajo `/api` requieren un JWT válido en la cabecera `Authorization: Bearer <token>`. Hay tres roles con permisos distintos (ver tabla de usuarios de ejemplo arriba): `admin`, `sala` y `cocina`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Inicia sesión, devuelve token + permisos |
| GET | `/auth/me` | Verifica el token actual y devuelve el usuario |
| POST | `/auth/logout` | Cierra sesión |
| GET/POST/PATCH/DELETE | `/auth/usuarios` | Gestión de usuarios (solo admin) |

### Ejemplo de login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","password":"admin123"}'
```

Guarda el `token` de la respuesta y úsalo en el resto de peticiones:

```bash
curl http://localhost:3000/api/resumen \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

## API REST (principales endpoints)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/resumen` | Todo el dashboard de una vez |
| GET | `/api/metricas` | Facturación, cubiertos, ticket medio, espera |
| GET | `/api/mesas` | Listado de mesas con estado |
| POST | `/api/mesas` | Crear mesa (admin/sala) |
| PATCH | `/api/mesas/:id` | Cambiar estado o pax de una mesa |
| DELETE | `/api/mesas/:id` | Eliminar mesa (admin) |
| GET | `/api/pedidos` | Pedidos activos (filtrable por estado/mesa) |
| POST | `/api/pedidos` | Crear pedido nuevo |
| PATCH | `/api/pedidos/:id/estado` | Avanzar estado: cocina→servir→cobrar→cerrado |
| GET | `/api/pedidos/:id/ticket` | Generar ticket de un pedido |
| GET | `/api/personal` | Personal activo |
| POST/PATCH/DELETE | `/api/personal/:id` | Gestión de personal (admin) |
| GET/POST/DELETE | `/api/turnos` | Gestión de turnos (admin) |
| GET/POST/PATCH/DELETE | `/api/carta` | Gestión de la carta (admin para escritura) |
| GET/POST/DELETE | `/api/reservas` | Gestión de reservas |
| GET | `/api/ventas` | Ventas por categoría del día |
| GET | `/api/informes/resumen` | Informes agregados |
| GET/PATCH | `/api/config` | Configuración del restaurante (admin) |

---

## Funcionalidades del dashboard

- **Login con roles** — admin, sala y cocina, cada uno con permisos y vistas distintas
- **Métricas en vivo** — facturación, cubiertos, ticket medio y tiempo de espera
- **Estado de mesas** — click en cualquier mesa para cambiar estado o comensales
- **Pedidos activos** — click en el badge de estado para avanzarlo (cocina → servir → cobrar → cerrado)
- **Carta** — gestión completa de platos por categoría (alta/edición/baja, solo admin)
- **Reservas y turnos de personal**
- **Ventas por categoría** — gráfico de barras con datos reales de BD
- **Informes** — resumen agregado por periodo
- **Ticker en vivo** — rotación de pedidos activos en tiempo real
- **Refresco automático** cada 30 segundos

---

## Personalización

### Cambiar número de mesas
Edita el array `mesasData` en `src/db/database.js` y elimina `data/braseria.db` para recrear la BD.

### Cambiar puerto
```bash
PORT=8080 npm start
```

### Conectar con una impresora de cocina
Instala `node-thermal-printer` y dispara la impresión en el endpoint `POST /api/pedidos`.
