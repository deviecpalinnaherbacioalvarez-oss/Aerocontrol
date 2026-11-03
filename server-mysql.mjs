import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import mysql from "mysql2/promise";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const sessions = new Map();
const loginAttempts = new Map();

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "aerocontrol_ops",
  waitForConnections: true,
  connectionLimit: 10
};

const setupPool = await mysql.createPool({
  ...dbConfig,
  database: undefined
});

await setupPool.query(`
  CREATE DATABASE IF NOT EXISTS ${dbConfig.database}
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci
`);
await setupPool.end();

const pool = await mysql.createPool(dbConfig);

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

function legacyHashPassword(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(value), salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(value, storedHash) {
  const stored = String(storedHash || "");
  if (stored.startsWith("scrypt$")) {
    const [, salt, expectedHex] = stored.split("$");
    if (!salt || !expectedHex) return false;
    const actual = scryptSync(String(value), salt, 32);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  const actual = Buffer.from(legacyHashPassword(value), "hex");
  const expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function passwordPolicyError(value) {
  const password = String(value || "");
  const missing = [];
  if (password.length < 10) missing.push("10 caracteres");
  if (password.length > 72) missing.push("máximo 72 caracteres");
  if (!/[a-z]/.test(password)) missing.push("una minúscula");
  if (!/[A-Z]/.test(password)) missing.push("una mayúscula");
  if (!/\d/.test(password)) missing.push("un número");
  if (!/[^A-Za-z0-9\s]/.test(password)) missing.push("un símbolo");
  if (/\s/.test(password)) missing.push("sin espacios");
  return missing.length ? `La contraseña requiere: ${missing.join(", ")}.` : null;
}

function loginAttemptKey(req, dni) {
  return `${req.socket.remoteAddress || "local"}:${String(dni || "").trim()}`;
}

function getLoginAttemptState(key) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) return { count: 0, firstAttemptAt: now, blockedUntil: 0 };
  if (state.blockedUntil > now) return state;
  if (now - state.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { count: 0, firstAttemptAt: now, blockedUntil: 0 };
  }
  return state;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const state = getLoginAttemptState(key);
  state.count += 1;
  if (state.count >= LOGIN_MAX_ATTEMPTS) state.blockedUntil = now + LOGIN_LOCK_MS;
  loginAttempts.set(key, state);
  return state;
}

function revokeUserSessions(userId) {
  for (const [token, user] of sessions.entries()) {
    if (Number(user?.id) === Number(userId)) sessions.delete(token);
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map(cookie => {
        const [key, ...value] = cookie.trim().split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      })
  );
}

function sessionUser(req) {
  const token = parseCookies(req).aerocontrol_session;
  return token ? sessions.get(token) : null;
}

function setSession(res, user) {
  const token = randomUUID();
  sessions.set(token, user);
  res.setHeader(
    "Set-Cookie",
    `aerocontrol_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`
  );
}

function clearSession(req, res) {
  const token = parseCookies(req).aerocontrol_session;
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "aerocontrol_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    dni: row.dni,
    celular: row.celular,
    correo: row.correo,
    rol: row.rol,
    area: row.area,
    habilitado: Boolean(row.habilitado)
  };
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Solicitud demasiado grande");
  }
  return raw ? JSON.parse(raw) : {};
}

function normalizeFlightType(tipo) {
  if (tipo === "TrÃ¡nsito") return "Transito";
  return tipo;
}

function validateFlight(data) {
  const required = ["codigo", "ruta", "hora", "puerta", "estado", "tipo"];
  const missing = required.filter(key => !String(data[key] ?? "").trim());
  if (missing.length) return `Faltan campos: ${missing.join(", ")}`;
  if (!/^[A-Z0-9-]{3,12}$/i.test(data.codigo)) return "CÃ³digo de vuelo invÃ¡lido";
  return null;
}

function validateUser(data) {
  const required = ["nombre", "apellido", "dni", "celular", "correo", "password"];
  const missing = required.filter(key => !String(data[key] ?? "").trim());
  if (missing.length) return `Faltan campos: ${missing.join(", ")}`;
  if (!/^\d{8}$/.test(String(data.dni))) return "El DNI debe tener 8 dÃ­gitos";
  if (!/^9\d{8}$/.test(String(data.celular))) return "El celular debe tener 9 dÃ­gitos y empezar con 9";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.correo))) return "Correo invÃ¡lido";
  const passwordError = passwordPolicyError(data.password);
  if (passwordError) return passwordError;
  return null;
}

function canManageUsers(user) {
  const area = String(user?.area || "").toLowerCase();
  const role = String(user?.rol || "").toLowerCase();
  return (
    role.includes("administrador") ||
    role.includes("supervisor") ||
    area.includes("gerencia") ||
    area.includes("corpac") ||
    area.includes("torre")
  );
}

async function columnExists(table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function ensureColumn(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function ensureDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vuelos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(12) NOT NULL UNIQUE,
      ruta VARCHAR(120) NOT NULL,
      hora VARCHAR(10) NOT NULL,
      puerta VARCHAR(20) NOT NULL,
      estado ENUM('Programado','Embarcando','En hora','Retrasado','Finalizado') NOT NULL,
      tipo ENUM('Salida','Llegada','Transito') NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(12) NOT NULL UNIQUE,
      tipo VARCHAR(60) NOT NULL,
      prioridad ENUM('Alta','Media','Baja') NOT NULL,
      descripcion TEXT NOT NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'Abierta',
      vuelo_id INT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_incidencias_vuelos
        FOREIGN KEY (vuelo_id) REFERENCES vuelos(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recursos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(60) NOT NULL,
      codigo VARCHAR(40) NOT NULL UNIQUE,
      estado VARCHAR(40) NOT NULL,
      detalle VARCHAR(180) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bitacora (
      id INT AUTO_INCREMENT PRIMARY KEY,
      accion VARCHAR(80) NOT NULL,
      detalle TEXT NOT NULL,
      fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL,
      apellido VARCHAR(80) NOT NULL,
      dni VARCHAR(8) NOT NULL UNIQUE,
      celular VARCHAR(9) NOT NULL,
      correo VARCHAR(120) NOT NULL UNIQUE,
      rol ENUM('Operador','Supervisor','Administrador') NOT NULL DEFAULT 'Operador',
      area VARCHAR(80) NOT NULL DEFAULT 'Operaciones',
      password_hash VARCHAR(128) NOT NULL,
      habilitado TINYINT(1) NOT NULL DEFAULT 1,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("usuarios", "habilitado", "habilitado TINYINT(1) NOT NULL DEFAULT 1");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reportes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(80) NOT NULL,
      titulo VARCHAR(160) NOT NULL,
      contenido TEXT NOT NULL,
      fuente VARCHAR(180) NOT NULL DEFAULT 'vuelos, recursos, incidencias y bitacora',
      fecha_generacion DATE NOT NULL,
      eliminado TINYINT(1) NOT NULL DEFAULT 0,
      creado_por INT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reportes_usuarios
        FOREIGN KEY (creado_por) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    )
  `);

  await ensureColumn("reportes", "tipo", "tipo VARCHAR(80) NOT NULL DEFAULT 'Operacional'");
  await ensureColumn("reportes", "titulo", "titulo VARCHAR(160) NOT NULL DEFAULT 'Reporte operacional'");
  await ensureColumn("reportes", "fuente", "fuente VARCHAR(180) NOT NULL DEFAULT 'vuelos, recursos, incidencias y bitacora'");
  await ensureColumn("reportes", "fecha_generacion", "fecha_generacion DATE NULL");
  await ensureColumn("reportes", "eliminado", "eliminado TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("reportes", "creado_por", "creado_por INT NULL");
  await ensureColumn("reportes", "creado_en", "creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("reportes", "actualizado_en", "actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  if (await columnExists("reportes", "tipo_reporte")) {
    await pool.query("ALTER TABLE reportes MODIFY tipo_reporte VARCHAR(80) NOT NULL DEFAULT 'Operacional'");
    await pool.query("UPDATE reportes SET tipo = tipo_reporte WHERE (tipo IS NULL OR tipo = '' OR tipo = 'Operacional') AND tipo_reporte IS NOT NULL");
  }
  if (await columnExists("reportes", "id_usuario")) {
    await pool.query("ALTER TABLE reportes MODIFY id_usuario INT NULL");
  }
  await pool.query("UPDATE reportes SET titulo = tipo WHERE titulo IS NULL OR titulo = '' OR titulo = 'Reporte operacional'");
  await pool.query("UPDATE reportes SET fecha_generacion = CURDATE() WHERE fecha_generacion IS NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_operativas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(12) NOT NULL UNIQUE,
      ruta VARCHAR(120) NOT NULL,
      hora VARCHAR(10) NOT NULL,
      puerta VARCHAR(20) NOT NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
      tipo ENUM('Salida','Llegada') NOT NULL,
      motivo TEXT NOT NULL,
      origen_vuelo VARCHAR(12) NULL,
      disponible_desde DATETIME NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS acciones_rol (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NULL,
      actor VARCHAR(40) NOT NULL,
      tipo VARCHAR(80) NOT NULL,
      detalle TEXT NOT NULL,
      datos JSON NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_acciones_rol_usuarios
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    )
  `);

  const seedUsers = [
    ["Admin", "AeroControl", "12345678", "987654321", "admin@aerocontrol.local", "Administrador", "Sistemas", "AeroControl1!"],
    ["Carlos", "Operador", "23456789", "987654322", "operador@aerocontrol.local", "Operador", "Operaciones aeroportuarias", "AeroControl1!"],
    ["Mariana", "Supervisora", "34567890", "987654323", "supervisor@aerocontrol.local", "Supervisor", "Supervision de operaciones", "AeroControl1!"],
    ["Javier", "Torre", "45678901", "987654324", "torre@aerocontrol.local", "Supervisor", "Torre de control", "AeroControl1!"],
    ["Rosa", "CORPAC", "56789012", "987654325", "gerencia@aerocontrol.local", "Administrador", "Gerencia CORPAC", "AeroControl1!"]
  ];

  for (const user of seedUsers) {
    await pool.query(
      `INSERT INTO usuarios (nombre, apellido, dni, celular, correo, rol, area, password_hash, habilitado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        apellido = VALUES(apellido),
        celular = VALUES(celular),
        correo = VALUES(correo),
        rol = VALUES(rol),
        area = VALUES(area),
        password_hash = VALUES(password_hash),
        habilitado = 1`,
      [...user.slice(0, 7), hashPassword(user[7])]
    );
  }

  await pool.query(`
    INSERT INTO vuelos (codigo, ruta, hora, puerta, estado, tipo)
    VALUES
      ('IBE3421', 'Madrid (MAD)', '15:10', 'C-12', 'En hora', 'Llegada'),
      ('AVA240', 'Bogota (BOG)', '15:45', 'A-04', 'Embarcando', 'Salida'),
      ('AAL982', 'Miami (MIA)', '16:00', 'B-02', 'Retrasado', 'Salida'),
      ('LAT4412', 'Santiago (SCL)', '16:20', 'C-08', 'Programado', 'Salida'),
      ('SKY119', 'Cusco (CUZ)', '17:05', 'A-09', 'En hora', 'Llegada')
    ON DUPLICATE KEY UPDATE
      ruta = VALUES(ruta),
      hora = VALUES(hora),
      puerta = VALUES(puerta),
      estado = VALUES(estado),
      tipo = VALUES(tipo)
  `);

  await pool.query(`
    INSERT INTO recursos (tipo, codigo, estado, detalle)
    VALUES
      ('Pista', 'Pista 01', 'Disponible', 'Habilitada para llegadas y salidas'),
      ('Pista', 'Pista 02', 'En observacion', 'Posible restriccion meteorologica'),
      ('Puerta', 'A-04', 'Embarque', 'Asignada al vuelo AVA240'),
      ('Puerta', 'B-02', 'Retrasado', 'Asignada al vuelo AAL982'),
      ('Soporte', 'Equipo GSE-01', 'Disponible', 'Equipo terrestre disponible para asistencia'),
      ('Soporte', 'Bus PB-02', 'Mantenimiento', 'Unidad en revision preventiva')
    ON DUPLICATE KEY UPDATE
      tipo = VALUES(tipo),
      estado = VALUES(estado),
      detalle = VALUES(detalle)
  `);

  const [[flight]] = await pool.query("SELECT id FROM vuelos WHERE codigo = ?", ["AAL982"]);
  if (flight) {
    await pool.query(
      `INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tipo = VALUES(tipo),
        prioridad = VALUES(prioridad),
        descripcion = VALUES(descripcion),
        vuelo_id = VALUES(vuelo_id)`,
      ["INC-001", "Operacion", "Alta", "Retraso por condiciones meteorologicas", flight.id]
    );
  }

  const [[adminUser]] = await pool.query("SELECT id FROM usuarios WHERE dni = ?", ["12345678"]);
  const reportSeeds = [
    ["Operacional", "Reporte diario de vuelos", "Vuelos monitoreados por turno, salidas autorizadas, llegadas confirmadas y operaciones con retraso."],
    ["Incidencias operativas", "Reporte de incidencias abiertas", "Seguimiento de incidencias por prioridad, responsable operativo y estado de atencion."],
    ["Recursos aeroportuarios", "Disponibilidad de pistas y puertas", "Control de pistas, puertas, posiciones y soporte terrestre disponibles para operacion."],
    ["Puntualidad", "Reporte de puntualidad operacional", "Revision de demoras promedio, vuelos en hora y operaciones que requieren coordinacion con torre."],
    ["Auditoria del sistema", "Reporte de acciones auditadas", "Trazabilidad de cambios realizados por usuarios, roles y eventos registrados en bitacora."],
    ["Disponibilidad operacional", "Reporte de disponibilidad del sistema", "Indicadores de continuidad operativa, terminal, servicios criticos y base de datos."]
  ];

  for (const report of reportSeeds) {
    await pool.query(
      `INSERT INTO reportes (tipo, titulo, contenido, fecha_generacion, creado_por)
       SELECT ?, ?, ?, CURDATE(), ?
       WHERE NOT EXISTS (
         SELECT 1 FROM reportes WHERE tipo = ? AND titulo = ? AND eliminado = 0
       )`,
      [report[0], report[1], report[2], adminUser?.id || null, report[0], report[1]]
    );
  }

  await pool.query(
    `INSERT INTO bitacora (accion, detalle)
     SELECT 'INICIALIZACION', 'Base de datos MySQL lista para AeroControl OPS'
     WHERE NOT EXISTS (SELECT 1 FROM bitacora)`
  );
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Acceso denegado");
  }

  try {
    const content = await readFile(filePath);
    const type = mime[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Archivo no encontrado");
  }
}

// Allow previewing an existing database without reapplying demonstration seeds.
if (process.env.SKIP_DATABASE_INIT !== "1") await ensureDatabase();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      return serveStatic(req, res, url.pathname);
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const active = sessionUser(req);
      return sendJson(res, 200, { user: active || null });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const data = await readJson(req);
      const error = validateUser(data);
      if (error) return sendJson(res, 400, { error });

      const rol = ["Operador", "Supervisor", "Administrador"].includes(data.rol) ? data.rol : "Operador";
      const area = String(data.area || "Operaciones").trim();

      try {
        const [result] = await pool.query(
          `INSERT INTO usuarios (nombre, apellido, dni, celular, correo, rol, area, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(data.nombre).trim(),
            String(data.apellido).trim(),
            String(data.dni).trim(),
            String(data.celular).trim(),
            String(data.correo).trim(),
            rol,
            area,
            hashPassword(data.password)
          ]
        );

        const [[user]] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [result.insertId]);
        return sendJson(res, 201, { user: publicUser(user) });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          return sendJson(res, 409, { error: "DNI o correo ya registrado" });
        }
        throw error;
      }
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const data = await readJson(req);
      const dni = String(data.dni || "").trim();
      const password = String(data.password || "");
      if (!/^\d{8}$/.test(dni) || !password) {
        return sendJson(res, 400, { error: "Ingresa un DNI válido y tu contraseña." });
      }

      const attemptKey = loginAttemptKey(req, dni);
      const attemptState = getLoginAttemptState(attemptKey);
      if (attemptState.blockedUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((attemptState.blockedUntil - Date.now()) / 1000);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return sendJson(res, 429, {
          error: "Demasiados intentos. El acceso está bloqueado temporalmente.",
          retryAfterSeconds
        });
      }

      const [[user]] = await pool.query("SELECT * FROM usuarios WHERE dni = ?", [dni]);

      if (!user || !verifyPassword(password, user.password_hash)) {
        const failed = recordLoginFailure(attemptKey);
        const attemptsRemaining = Math.max(0, LOGIN_MAX_ATTEMPTS - failed.count);
        if (failed.blockedUntil > Date.now()) {
          const retryAfterSeconds = Math.ceil((failed.blockedUntil - Date.now()) / 1000);
          res.setHeader("Retry-After", String(retryAfterSeconds));
          return sendJson(res, 429, {
            error: "Límite de intentos alcanzado. Intenta nuevamente en 15 minutos.",
            attemptsRemaining: 0,
            retryAfterSeconds
          });
        }
        return sendJson(res, 401, {
          error: `Credenciales incorrectas. Te quedan ${attemptsRemaining} intento${attemptsRemaining === 1 ? "" : "s"}.`,
          attemptsRemaining
        });
      }

      if (!user.habilitado) {
        return sendJson(res, 403, { error: "Esta cuenta está deshabilitada. Contacta al administrador." });
      }

      loginAttempts.delete(attemptKey);

      const publicData = publicUser(user);
      setSession(res, publicData);
      return sendJson(res, 200, { user: publicData });
    }

    if (req.method === "GET" && url.pathname === "/api/usuarios") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const [rows] = await pool.query(
        `SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado
         FROM usuarios
         ORDER BY id`
      );

      return sendJson(res, 200, rows);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/usuarios/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      if (!canManageUsers(active)) {
        return sendJson(res, 403, { error: "Tu perfil no puede modificar usuarios." });
      }

      const id = Number(url.pathname.split("/").pop());
      if (!id) return sendJson(res, 400, { error: "Usuario invÃ¡lido" });

      const data = await readJson(req);
      const allowedRoles = ["Operador", "Supervisor", "Administrador"];

      const [[existingUser]] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [id]);
      if (!existingUser) return sendJson(res, 404, { error: "Usuario no encontrado." });

      const nombre = String(data.nombre || "").trim();
      const apellido = String(data.apellido || "").trim();
      const celular = String(data.celular || "").trim();
      const correo = String(data.correo || "").trim();
      const rol = String(data.rol || "").trim();
      const area = String(data.area || "").trim();
      const habilitado = data.habilitado === undefined
        ? Boolean(existingUser.habilitado)
        : data.habilitado === true || data.habilitado === 1 || data.habilitado === "1";

      if (!nombre || !apellido || !celular || !correo || !rol || !area) {
        return sendJson(res, 400, { error: "Completa todos los campos del usuario." });
      }

      if (!/^9\d{8}$/.test(celular)) {
        return sendJson(res, 400, { error: "El celular debe tener 9 dÃ­gitos y empezar con 9." });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return sendJson(res, 400, { error: "Correo invÃ¡lido." });
      }

      if (!allowedRoles.includes(rol)) {
        return sendJson(res, 400, { error: "Rol invÃ¡lido." });
      }

      if (Number(active.id) === id && !habilitado) {
        return sendJson(res, 400, { error: "No puedes deshabilitar tu propia cuenta activa." });
      }

      await pool.query(
        `UPDATE usuarios
         SET nombre = ?, apellido = ?, celular = ?, correo = ?, rol = ?, area = ?, habilitado = ?
         WHERE id = ?`,
        [nombre, apellido, celular, correo, rol, area, habilitado ? 1 : 0, id]
      );

      if (!habilitado) revokeUserSessions(id);

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["ACTUALIZACION_USUARIO", `Usuario ${active.dni} actualizÃ³ datos del usuario ID ${id}`]
      );

      const [[user]] = await pool.query(
        `SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado
         FROM usuarios
         WHERE id = ?`,
        [id]
      );

      return sendJson(res, 200, user);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      clearSession(req, res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "PATCH" && url.pathname === "/api/auth/profile") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const data = await readJson(req);

      const nombre = String(data.nombre || "").trim();
      const apellido = String(data.apellido || "").trim();
      const celular = String(data.celular || "").trim();
      const correo = String(data.correo || "").trim();
      const area = String(data.area || "").trim();
      const newPassword = String(data.password || "");

      if (!nombre || !apellido || !celular || !correo || !area) {
        return sendJson(res, 400, { error: "Completa todos los campos." });
      }

      if (!/^9\d{8}$/.test(celular)) {
        return sendJson(res, 400, { error: "El celular debe tener 9 dígitos y empezar con 9." });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return sendJson(res, 400, { error: "Correo inválido." });
      }

      if (newPassword) {
        const passwordError = passwordPolicyError(newPassword);
        if (passwordError) return sendJson(res, 400, { error: passwordError });
      }

      if (newPassword) {
        await pool.query(
          "UPDATE usuarios SET nombre = ?, apellido = ?, celular = ?, correo = ?, area = ?, password_hash = ? WHERE id = ?",
          [nombre, apellido, celular, correo, area, hashPassword(newPassword), active.id]
        );
      } else {
        await pool.query(
          "UPDATE usuarios SET nombre = ?, apellido = ?, celular = ?, correo = ?, area = ? WHERE id = ?",
          [nombre, apellido, celular, correo, area, active.id]
        );
      }

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        [newPassword ? "ACTUALIZACION_PERFIL_CLAVE" : "ACTUALIZACION_PERFIL", `Usuario ${active.dni} actualizó su perfil`]
      );

      const [[user]] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [active.id]);
      const publicData = publicUser(user);

      const token = parseCookies(req).aerocontrol_session;
      if (token) sessions.set(token, publicData);

      return sendJson(res, 200, { user: publicData });
    }

    if (req.method === "GET" && url.pathname === "/api/vuelos") {
      const [rows] = await pool.query("SELECT * FROM vuelos ORDER BY hora ASC, id ASC");
      return sendJson(res, 200, rows);
    }

    if (req.method === "POST" && url.pathname === "/api/vuelos") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const data = await readJson(req);
      const error = validateFlight(data);
      if (error) return sendJson(res, 400, { error });

      const tipo = normalizeFlightType(String(data.tipo).trim());

      await pool.query(
        `INSERT INTO vuelos (codigo, ruta, hora, puerta, estado, tipo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(data.codigo).trim().toUpperCase(),
          String(data.ruta).trim(),
          String(data.hora).trim(),
          String(data.puerta).trim().toUpperCase(),
          String(data.estado).trim(),
          tipo
        ]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["REGISTRO_VUELO", `Usuario ${active.dni} registrÃ³ un vuelo`]
      );

      return sendJson(res, 201, { ok: true });
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/vuelos/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const id = Number(url.pathname.split("/").pop());
      const data = await readJson(req);

      await pool.query("UPDATE vuelos SET estado = ? WHERE id = ?", [String(data.estado).trim(), id]);

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["CAMBIO_ESTADO_VUELO", `Usuario ${active.dni} cambiÃ³ el estado del vuelo ID ${id}`]
      );

      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/incidencias") {
      const [rows] = await pool.query("SELECT * FROM incidencias ORDER BY creado_en DESC, id DESC");
      return sendJson(res, 200, rows);
    }

    if (req.method === "POST" && url.pathname === "/api/incidencias") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const data = await readJson(req);
      const [[countRow]] = await pool.query("SELECT COUNT(*) AS total FROM incidencias");
      const next = Number(countRow.total) + 1;
      const codigo = `INC-${String(next).padStart(3, "0")}`;

      await pool.query(
        "INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id) VALUES (?, ?, ?, ?, NULL)",
        [
          codigo,
          String(data.tipo || "Infraestructura").trim(),
          String(data.prioridad || "Alta").trim(),
          String(data.descripcion || "Incidencia operativa registrada").trim()
        ]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["REGISTRO_INCIDENCIA", `Usuario ${active.dni} registrÃ³ incidencia ${codigo}`]
      );

      return sendJson(res, 201, { ok: true, codigo });
    }

    if (req.method === "GET" && url.pathname === "/api/recursos") {
      const [rows] = await pool.query("SELECT * FROM recursos ORDER BY tipo ASC, codigo ASC");
      return sendJson(res, 200, rows);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/recursos/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const id = Number(url.pathname.split("/").pop());
      const data = await readJson(req);

      await pool.query("UPDATE recursos SET estado = ? WHERE id = ?", [String(data.estado).trim(), id]);

      const [[resource]] = await pool.query("SELECT * FROM recursos WHERE id = ?", [id]);

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["ACTUALIZACION_RECURSO", `Usuario ${active.dni} actualizÃ³ recurso ${resource?.codigo || id}`]
      );

      return sendJson(res, 200, resource);
    }

    if (req.method === "GET" && url.pathname === "/api/reportes") {
      const reportIdColumn = (await columnExists("reportes", "id")) ? "id" : "id_reporte";
      const [rows] = await pool.query(
        `SELECT ${reportIdColumn} AS id, tipo, titulo, contenido, fuente,
                DATE_FORMAT(fecha_generacion, '%Y-%m-%d') AS fecha_generacion,
                creado_en, actualizado_en
         FROM reportes
         WHERE eliminado = 0
         ORDER BY fecha_generacion DESC, ${reportIdColumn} DESC`
      );
      return sendJson(res, 200, rows);
    }

    if (req.method === "POST" && url.pathname === "/api/reportes") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      if (!canManageUsers(active)) return sendJson(res, 403, { error: "Tu perfil no puede generar reportes." });

      const data = await readJson(req);
      const tipo = String(data.tipo || data.type || "Operacional").trim();
      const titulo = String(data.titulo || data.title || "Reporte operacional").trim();
      const contenido = String(data.contenido || data.desc || "Reporte generado desde el panel operacional.").trim();
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha_generacion || data.dateInput || ""))
        ? String(data.fecha_generacion || data.dateInput)
        : new Date().toISOString().slice(0, 10);

      if (!tipo || !titulo || !contenido) return sendJson(res, 400, { error: "Completa tipo, titulo y contenido del reporte." });

      const [result] = await pool.query(
        `INSERT INTO reportes (tipo, titulo, contenido, fecha_generacion, creado_por)
         VALUES (?, ?, ?, ?, ?)`,
        [tipo, titulo, contenido, fecha, active.id]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["REPORTE_CREADO", `Usuario ${active.dni} genero reporte ${titulo}`]
      );

      return sendJson(res, 201, { ok: true, id: result.insertId });
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/reportes/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      if (!canManageUsers(active)) return sendJson(res, 403, { error: "Tu perfil no puede editar reportes." });

      const id = Number(url.pathname.split("/").pop());
      const data = await readJson(req);
      const tipo = String(data.tipo || data.type || "").trim();
      const titulo = String(data.titulo || data.title || "").trim();
      const contenido = String(data.contenido || data.desc || "").trim();
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha_generacion || data.dateInput || ""))
        ? String(data.fecha_generacion || data.dateInput)
        : new Date().toISOString().slice(0, 10);

      if (!id || !tipo || !titulo || !contenido) return sendJson(res, 400, { error: "Datos de reporte invalidos." });

      const reportIdColumn = (await columnExists("reportes", "id")) ? "id" : "id_reporte";
      await pool.query(
        `UPDATE reportes
         SET tipo = ?, titulo = ?, contenido = ?, fecha_generacion = ?
         WHERE ${reportIdColumn} = ? AND eliminado = 0`,
        [tipo, titulo, contenido, fecha, id]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["REPORTE_ACTUALIZADO", `Usuario ${active.dni} actualizo reporte ID ${id}`]
      );

      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/reportes/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      if (!canManageUsers(active)) return sendJson(res, 403, { error: "Tu perfil no puede eliminar reportes." });

      const id = Number(url.pathname.split("/").pop());
      if (!id) return sendJson(res, 400, { error: "Reporte invalido." });

      const reportIdColumn = (await columnExists("reportes", "id")) ? "id" : "id_reporte";
      await pool.query(`UPDATE reportes SET eliminado = 1 WHERE ${reportIdColumn} = ?`, [id]);
      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["REPORTE_ELIMINADO", `Usuario ${active.dni} elimino reporte ID ${id}`]
      );
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/solicitudes") {
      const [rows] = await pool.query(
        `SELECT id, codigo, ruta, hora, puerta, estado, tipo, motivo, origen_vuelo,
                UNIX_TIMESTAMP(disponible_desde) * 1000 AS dueAt,
                creado_en
         FROM solicitudes_operativas
         WHERE estado = 'Pendiente'
         ORDER BY disponible_desde ASC, creado_en ASC`
      );
      return sendJson(res, 200, rows);
    }

    if (req.method === "POST" && url.pathname === "/api/solicitudes") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      const data = await readJson(req);
      const codigo = String(data.codigo || "").trim().toUpperCase();
      const ruta = String(data.ruta || "").trim();
      const hora = String(data.hora || "").trim();
      const puerta = String(data.puerta || "").trim().toUpperCase();
      const tipo = String(data.tipo || "Salida").trim() === "Llegada" ? "Llegada" : "Salida";
      const motivo = String(data.motivo || "Solicitud operativa pendiente").trim();
      const origen = String(data.origen_vuelo || data.sourceArrival || "").trim() || null;
      const dueDate = Number(data.dueAt) ? new Date(Number(data.dueAt)) : new Date();

      if (!codigo || !ruta || !hora || !puerta) return sendJson(res, 400, { error: "Datos incompletos para solicitud operativa." });

      await pool.query(
        `INSERT INTO solicitudes_operativas (codigo, ruta, hora, puerta, tipo, motivo, origen_vuelo, disponible_desde)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          ruta = VALUES(ruta),
          hora = VALUES(hora),
          puerta = VALUES(puerta),
          tipo = VALUES(tipo),
          motivo = VALUES(motivo),
          origen_vuelo = VALUES(origen_vuelo),
          disponible_desde = VALUES(disponible_desde),
          estado = 'Pendiente'`,
        [codigo, ruta, hora, puerta, tipo, motivo, origen, dueDate]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["SOLICITUD_OPERATIVA", `Usuario ${active.dni} registro solicitud ${codigo}`]
      );

      const [[request]] = await pool.query(
        `SELECT id, codigo, ruta, hora, puerta, estado, tipo, motivo, origen_vuelo,
                UNIX_TIMESTAMP(disponible_desde) * 1000 AS dueAt
         FROM solicitudes_operativas WHERE codigo = ?`,
        [codigo]
      );
      return sendJson(res, 201, request);
    }

    if ((req.method === "PATCH" || req.method === "DELETE") && url.pathname.startsWith("/api/solicitudes/")) {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });
      const id = Number(url.pathname.split("/").pop());
      if (!id) return sendJson(res, 400, { error: "Solicitud invalida." });

      const nextState = req.method === "DELETE" ? "Cerrada" : String((await readJson(req)).estado || "Cerrada").trim();
      await pool.query("UPDATE solicitudes_operativas SET estado = ? WHERE id = ?", [nextState, id]);
      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        ["SOLICITUD_ACTUALIZADA", `Usuario ${active.dni} cambio solicitud ID ${id} a ${nextState}`]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/role-tools") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const [rows] = await pool.query(
        `SELECT ar.id, ar.actor, ar.tipo, ar.detalle, ar.datos, ar.creado_en,
                u.nombre, u.apellido, u.dni, u.area
         FROM acciones_rol ar
         LEFT JOIN usuarios u ON u.id = ar.usuario_id
         ORDER BY ar.creado_en DESC, ar.id DESC
         LIMIT 80`
      );

      return sendJson(res, 200, rows.map(row => ({
        ...row,
        datos: typeof row.datos === "string" ? JSON.parse(row.datos || "{}") : (row.datos || {})
      })));
    }

    if (req.method === "POST" && url.pathname === "/api/role-tools") {
      const active = sessionUser(req);
      if (!active) return sendJson(res, 401, { error: "No autorizado" });

      const data = await readJson(req);
      const actor = String(data.actor || "operador").trim().slice(0, 40);
      const tipo = String(data.tipo || "ACCION_ROL").trim().slice(0, 80);
      const detalle = String(data.detalle || "Accion operacional registrada").trim();
      const datos = JSON.stringify(data.datos || {});

      const [result] = await pool.query(
        `INSERT INTO acciones_rol (usuario_id, actor, tipo, detalle, datos)
         VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
        [active.id, actor, tipo, detalle, datos]
      );

      await pool.query(
        "INSERT INTO bitacora (accion, detalle) VALUES (?, ?)",
        [tipo, `Usuario ${active.dni} registro accion de rol: ${detalle}`]
      );

      return sendJson(res, 201, { ok: true, id: result.insertId });
    }

    if (req.method === "GET" && url.pathname === "/api/metricas") {
      const [[llegadas]] = await pool.query("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Llegada'");
      const [[salidas]] = await pool.query("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Salida'");
      const [[retrasados]] = await pool.query("SELECT COUNT(*) AS total FROM vuelos WHERE estado = 'Retrasado'");
      const [[incidencias]] = await pool.query("SELECT COUNT(*) AS total FROM incidencias WHERE estado = 'Abierta'");
      const [[auditadas]] = await pool.query("SELECT COUNT(*) AS total FROM bitacora");

      return sendJson(res, 200, {
        llegadas: llegadas.total,
        salidas: salidas.total,
        retrasados: retrasados.total,
        incidencias: incidencias.total,
        auditadas: auditadas.total,
        retrasoPromedio: retrasados.total ? 14 : 0
      });
    }

    if (req.method === "GET" && url.pathname === "/api/bitacora") {
      const [rows] = await pool.query("SELECT * FROM bitacora ORDER BY fecha_hora DESC, id DESC LIMIT 50");
      return sendJson(res, 200, rows);
    }

    return sendJson(res, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Error interno del servidor" });
  }
});

const port = Number(process.env.PORT || 4173);

server.listen(port, "127.0.0.1", () => {
  console.log(`AeroControl Ops con MySQL disponible en http://127.0.0.1:${port}`);
  console.log(`Base de datos MySQL: ${dbConfig.database} en ${dbConfig.host}:${dbConfig.port}`);
});











