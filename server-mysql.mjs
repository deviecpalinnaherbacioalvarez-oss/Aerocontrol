import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_ROLES,
  FLIGHT_STATES,
  INCIDENT_PRIORITIES,
  LOGIN_LOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  SESSION_TTL_MS,
  buildSessionCookie,
  canManageUsers,
  generateSessionToken,
  hasAnyPermission,
  hashPassword,
  hashSessionToken,
  isAreaAllowedForProfileUpdate,
  parseCookies,
  passwordPolicyError,
  publicUser,
  resolveActor,
  resolvePublicRegistrationArea,
  validateUser,
  verifyPassword
} from "./lib/access-control.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const defaultPublicDir = join(root, "public");

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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new HttpError(413, "Solicitud demasiado grande");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Formato JSON inválido");
  }
}

function normalizeFlightType(tipo) {
  if (tipo === "Tránsito") return "Transito";
  return tipo;
}

function validateFlight(data) {
  const required = ["codigo", "ruta", "hora", "puerta", "estado", "tipo"];
  const missing = required.filter(key => !String(data[key] ?? "").trim());
  if (missing.length) return `Faltan campos: ${missing.join(", ")}`;
  if (!/^[A-Z0-9-]{3,12}$/i.test(data.codigo)) return "Código de vuelo inválido";
  if (!FLIGHT_STATES.includes(String(data.estado).trim())) return "Estado de vuelo inválido";
  return null;
}

async function columnExists(pool, table, column) {
  if (!["reportes", "usuarios"].includes(table)) {
    throw new Error(`Tabla no permitida para inspección: ${table}`);
  }
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function ensureColumn(pool, table, column, definition) {
  if (!(await columnExists(pool, table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

/** Creates required schema tables (including persistent sessions & login attempts) and seeds demo data. */
export async function ensureDatabase(pool) {
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

  await ensureColumn(pool, "usuarios", "habilitado", "habilitado TINYINT(1) NOT NULL DEFAULT 1");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      usuario_id INT NOT NULL,
      expira_en BIGINT NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sesiones_usuarios
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS intentos_login (
      clave VARCHAR(120) PRIMARY KEY,
      intentos INT NOT NULL DEFAULT 0,
      primer_intento BIGINT NOT NULL,
      bloqueado_hasta BIGINT NOT NULL DEFAULT 0,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

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

  await ensureColumn(pool, "reportes", "tipo", "tipo VARCHAR(80) NOT NULL DEFAULT 'Operacional'");
  await ensureColumn(pool, "reportes", "titulo", "titulo VARCHAR(160) NOT NULL DEFAULT 'Reporte operacional'");
  await ensureColumn(pool, "reportes", "fuente", "fuente VARCHAR(180) NOT NULL DEFAULT 'vuelos, recursos, incidencias y bitacora'");
  await ensureColumn(pool, "reportes", "fecha_generacion", "fecha_generacion DATE NULL");
  await ensureColumn(pool, "reportes", "eliminado", "eliminado TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn(pool, "reportes", "creado_por", "creado_por INT NULL");
  await ensureColumn(pool, "reportes", "creado_en", "creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(pool, "reportes", "actualizado_en", "actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  if (await columnExists(pool, "reportes", "tipo_reporte")) {
    await pool.query("ALTER TABLE reportes MODIFY tipo_reporte VARCHAR(80) NOT NULL DEFAULT 'Operacional'");
    await pool.query("UPDATE reportes SET tipo = tipo_reporte WHERE (tipo IS NULL OR tipo = '' OR tipo = 'Operacional') AND tipo_reporte IS NOT NULL");
  }
  if (await columnExists(pool, "reportes", "id_usuario")) {
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

/** Creates the HTTP request handler backed by a MySQL-compatible connection pool. */
export function createRequestHandler(pool, { publicDir = defaultPublicDir } = {}) {
  const resolvedPublicDir = resolve(publicDir);

  async function serveStatic(res, pathname) {
    const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(resolvedPublicDir, safePath);

    if (filePath !== resolvedPublicDir && !filePath.startsWith(resolvedPublicDir + sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
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

  async function logAudit(action, detail) {
    await pool.query("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)", [action, detail]);
  }

  async function resolveSession(req) {
    const token = parseCookies(req).aerocontrol_session;
    if (!token) return null;

    const tokenHash = hashSessionToken(token);
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.apellido, u.dni, u.celular, u.correo, u.rol, u.area, u.habilitado,
              s.expira_en
       FROM sesiones s
       INNER JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    const row = rows[0];
    if (!row || Number(row.expira_en) <= Date.now() || !row.habilitado) {
      await pool.query("DELETE FROM sesiones WHERE token_hash = ?", [tokenHash]);
      return null;
    }

    return { tokenHash, user: publicUser(row) };
  }

  async function createSession(res, user) {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await pool.query(
      "INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)",
      [tokenHash, user.id, expiresAt]
    );
    res.setHeader("Set-Cookie", buildSessionCookie(token));
    return token;
  }

  async function destroySessionByRequest(req, res) {
    const token = parseCookies(req).aerocontrol_session;
    let activeUser = null;
    if (token) {
      const tokenHash = hashSessionToken(token);
      const existing = await resolveSession(req);
      activeUser = existing?.user || null;
      await pool.query("DELETE FROM sesiones WHERE token_hash = ?", [tokenHash]);
    }
    res.setHeader("Set-Cookie", buildSessionCookie("", 0));
    return activeUser;
  }

  async function revokeUserSessions(userId) {
    await pool.query("DELETE FROM sesiones WHERE usuario_id = ?", [userId]);
  }

  function loginKeysFor(req, dni) {
    const ip = String(req.socket?.remoteAddress || "local").slice(0, 64);
    const cleanDni = String(dni || "").trim();
    return [`ip:${ip}:${cleanDni}`, `dni:${cleanDni}`];
  }

  async function readAttemptState(clave, now) {
    const [rows] = await pool.query(
      "SELECT clave, intentos, primer_intento, bloqueado_hasta FROM intentos_login WHERE clave = ? LIMIT 1",
      [clave]
    );
    const state = rows[0];
    if (!state) return { clave, intentos: 0, primer_intento: now, bloqueado_hasta: 0 };
    if (Number(state.bloqueado_hasta) > now) {
      return {
        clave,
        intentos: Number(state.intentos),
        primer_intento: Number(state.primer_intento),
        bloqueado_hasta: Number(state.bloqueado_hasta)
      };
    }
    if (now - Number(state.primer_intento) > LOGIN_WINDOW_MS) {
      await pool.query("DELETE FROM intentos_login WHERE clave = ?", [clave]);
      return { clave, intentos: 0, primer_intento: now, bloqueado_hasta: 0 };
    }
    return {
      clave,
      intentos: Number(state.intentos),
      primer_intento: Number(state.primer_intento),
      bloqueado_hasta: Number(state.bloqueado_hasta)
    };
  }

  async function getBlockedUntil(keys, now) {
    let blockedUntil = 0;
    for (const key of keys) {
      const state = await readAttemptState(key, now);
      if (state.bloqueado_hasta > blockedUntil) blockedUntil = state.bloqueado_hasta;
    }
    return blockedUntil;
  }

  async function recordLoginFailure(keys, now) {
    let maxAttempts = 0;
    let blockedUntil = 0;
    for (const key of keys) {
      const current = await readAttemptState(key, now);
      const nextCount = current.intentos + 1;
      const nextBlockedUntil = nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_LOCK_MS : 0;
      await pool.query(
        `INSERT INTO intentos_login (clave, intentos, primer_intento, bloqueado_hasta)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          intentos = VALUES(intentos),
          primer_intento = VALUES(primer_intento),
          bloqueado_hasta = VALUES(bloqueado_hasta)`,
        [key, nextCount, current.primer_intento, nextBlockedUntil]
      );
      if (nextCount > maxAttempts) maxAttempts = nextCount;
      if (nextBlockedUntil > blockedUntil) blockedUntil = nextBlockedUntil;
    }
    return { count: maxAttempts, blockedUntil };
  }

  async function clearLoginAttempts(keys) {
    for (const key of keys) {
      await pool.query("DELETE FROM intentos_login WHERE clave = ?", [key]);
    }
  }

  async function requireAuth(req, res) {
    const session = await resolveSession(req);
    if (!session) {
      if (parseCookies(req).aerocontrol_session) {
        res.setHeader("Set-Cookie", buildSessionCookie("", 0));
      }
      sendJson(res, 401, { error: "No autorizado" });
      return null;
    }
    return session;
  }

  async function requirePermission(req, res, permissions, deniedMessage) {
    const session = await requireAuth(req, res);
    if (!session) return null;
    const required = Array.isArray(permissions) ? permissions : [permissions];
    if (!hasAnyPermission(session.user, required)) {
      sendJson(res, 403, { error: deniedMessage });
      return null;
    }
    return session;
  }

  return async function requestHandler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        return serveStatic(res, url.pathname);
      }

      if (req.method === "GET" && url.pathname === "/api/auth/me") {
        const session = await resolveSession(req);
        if (!session && parseCookies(req).aerocontrol_session) {
          res.setHeader("Set-Cookie", buildSessionCookie("", 0));
        }
        return sendJson(res, 200, { user: session?.user || null });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/register") {
        const data = await readJson(req);
        const error = validateUser(data);
        if (error) return sendJson(res, 400, { error });

        // Self-registration is always restricted to standard Operador accounts in non-privileged areas.
        const rol = "Operador";
        const areaCheck = resolvePublicRegistrationArea(data.area);
        if (!areaCheck.ok) return sendJson(res, 400, { error: areaCheck.error });

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
              areaCheck.area,
              hashPassword(data.password)
            ]
          );

          await logAudit("REGISTRO_USUARIO", `Auto-registro de usuario DNI ${String(data.dni).trim()} como Operador`);
          const [[user]] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [result.insertId]);
          return sendJson(res, 201, { user: publicUser(user) });
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, { error: "DNI o correo ya registrado" });
          }
          throw err;
        }
      }

      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const data = await readJson(req);
        const dni = String(data.dni || "").trim();
        const password = String(data.password || "");
        if (!/^\d{8}$/.test(dni) || !password) {
          return sendJson(res, 400, { error: "Ingresa un DNI válido y tu contraseña." });
        }

        const now = Date.now();
        const attemptKeys = loginKeysFor(req, dni);
        const blockedUntil = await getBlockedUntil(attemptKeys, now);
        if (blockedUntil > now) {
          const retryAfterSeconds = Math.ceil((blockedUntil - now) / 1000);
          res.setHeader("Retry-After", String(retryAfterSeconds));
          return sendJson(res, 429, {
            error: "Demasiados intentos. El acceso está bloqueado temporalmente.",
            retryAfterSeconds
          });
        }

        const [[user]] = await pool.query("SELECT * FROM usuarios WHERE dni = ?", [dni]);
        if (!user || !verifyPassword(password, user.password_hash)) {
          const failed = await recordLoginFailure(attemptKeys, now);
          const attemptsRemaining = Math.max(0, LOGIN_MAX_ATTEMPTS - failed.count);
          if (failed.blockedUntil > now) {
            await logAudit("LOGIN_BLOQUEADO", `Bloqueo temporal tras ${LOGIN_MAX_ATTEMPTS} intentos fallidos para DNI ${dni}`);
            const retryAfterSeconds = Math.ceil((failed.blockedUntil - now) / 1000);
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
          await logAudit("LOGIN_CUENTA_DESHABILITADA", `Intento de acceso a cuenta deshabilitada DNI ${dni}`);
          return sendJson(res, 403, { error: "Esta cuenta está deshabilitada. Contacta al administrador." });
        }

        await clearLoginAttempts(attemptKeys);

        // Migrate legacy unsalted SHA-256 hashes seamlessly upon successful login.
        if (!String(user.password_hash).startsWith("scrypt$")) {
          await pool.query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [hashPassword(password), user.id]);
        }

        // Prevent session fixation by invalidating any prior token carried by the client before issuing a new one.
        const oldToken = parseCookies(req).aerocontrol_session;
        if (oldToken) {
          await pool.query("DELETE FROM sesiones WHERE token_hash = ?", [hashSessionToken(oldToken)]);
        }

        const publicData = publicUser(user);
        await createSession(res, publicData);
        await logAudit("LOGIN_EXITOSO", `Inicio de sesión de ${publicData.dni} (${resolveActor(publicData)})`);
        return sendJson(res, 200, { user: publicData });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        const previousUser = await destroySessionByRequest(req, res);
        if (previousUser) {
          await logAudit("LOGOUT", `Cierre de sesión de ${previousUser.dni}`);
        }
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "PATCH" && url.pathname === "/api/auth/profile") {
        const session = await requireAuth(req, res);
        if (!session) return;
        const active = session.user;

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
        if (!isAreaAllowedForProfileUpdate(active.rol, area, active.area)) {
          return sendJson(res, 403, { error: "No puedes asignarte un área con privilegios distintos a tu rol actual." });
        }
        if (newPassword) {
          const passwordError = passwordPolicyError(newPassword);
          if (passwordError) return sendJson(res, 400, { error: passwordError });
        }

        try {
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
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, { error: "Correo ya registrado en otra cuenta." });
          }
          throw err;
        }

        await logAudit(
          newPassword ? "ACTUALIZACION_PERFIL_CLAVE" : "ACTUALIZACION_PERFIL",
          `Usuario ${active.dni} actualizó su perfil`
        );

        const [[user]] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [active.id]);
        const publicData = publicUser(user);

        if (newPassword) {
          await revokeUserSessions(active.id);
          await createSession(res, publicData);
        }

        return sendJson(res, 200, { user: publicData });
      }

      if (req.method === "GET" && url.pathname === "/api/usuarios") {
        const session = await requirePermission(req, res, "manageUsers", "Solo el Administrador puede consultar usuarios.");
        if (!session) return;

        const [rows] = await pool.query(
          `SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado
           FROM usuarios
           ORDER BY id`
        );
        return sendJson(res, 200, rows);
      }

      if (req.method === "PATCH" && url.pathname.startsWith("/api/usuarios/")) {
        const session = await requirePermission(req, res, "manageUsers", "Tu perfil no puede modificar usuarios.");
        if (!session) return;
        const active = session.user;

        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: "Usuario inválido" });

        const data = await readJson(req);
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
          return sendJson(res, 400, { error: "El celular debe tener 9 dígitos y empezar con 9." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
          return sendJson(res, 400, { error: "Correo inválido." });
        }
        if (!ALLOWED_ROLES.includes(rol)) {
          return sendJson(res, 400, { error: "Rol inválido." });
        }
        if (Number(active.id) === id && !habilitado) {
          return sendJson(res, 400, { error: "No puedes deshabilitar tu propia cuenta activa." });
        }
        if (Number(active.id) === id && rol !== existingUser.rol) {
          return sendJson(res, 400, { error: "No puedes modificar tu propio rol desde esta vista." });
        }

        try {
          await pool.query(
            `UPDATE usuarios
             SET nombre = ?, apellido = ?, celular = ?, correo = ?, rol = ?, area = ?, habilitado = ?
             WHERE id = ?`,
            [nombre, apellido, celular, correo, rol, area, habilitado ? 1 : 0, id]
          );
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, { error: "El correo ya pertenece a otro usuario." });
          }
          throw err;
        }

        if (!habilitado || rol !== existingUser.rol || area !== existingUser.area) {
          await revokeUserSessions(id);
        }

        await logAudit("ACTUALIZACION_USUARIO", `Usuario ${active.dni} actualizó datos del usuario ID ${id}`);

        const [[user]] = await pool.query(
          `SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado
           FROM usuarios
           WHERE id = ?`,
          [id]
        );
        return sendJson(res, 200, user);
      }

      if (req.method === "GET" && url.pathname === "/api/vuelos") {
        const session = await requireAuth(req, res);
        if (!session) return;
        const [rows] = await pool.query("SELECT * FROM vuelos ORDER BY hora ASC, id ASC");
        return sendJson(res, 200, rows);
      }

      if (req.method === "POST" && url.pathname === "/api/vuelos") {
        const session = await requirePermission(
          req,
          res,
          ["createFlight", "approveIncoming"],
          "Tu perfil no puede registrar ni autorizar vuelos."
        );
        if (!session) return;

        const data = await readJson(req);
        const error = validateFlight(data);
        if (error) return sendJson(res, 400, { error });

        const tipo = normalizeFlightType(String(data.tipo).trim());
        try {
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
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return sendJson(res, 409, { error: "El código de vuelo ya existe." });
          }
          throw err;
        }

        await logAudit("REGISTRO_VUELO", `Usuario ${session.user.dni} registró un vuelo`);
        return sendJson(res, 201, { ok: true });
      }

      if (req.method === "PATCH" && url.pathname.startsWith("/api/vuelos/")) {
        const session = await requirePermission(req, res, "changeFlight", "Tu perfil no puede cambiar el estado de vuelos.");
        if (!session) return;

        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: "Vuelo inválido." });

        const data = await readJson(req);
        const estado = String(data.estado || "").trim();
        if (!FLIGHT_STATES.includes(estado)) {
          return sendJson(res, 400, { error: "Estado de vuelo inválido." });
        }

        const [result] = await pool.query("UPDATE vuelos SET estado = ? WHERE id = ?", [estado, id]);
        if (!result.affectedRows) return sendJson(res, 404, { error: "Vuelo no encontrado." });

        await logAudit("CAMBIO_ESTADO_VUELO", `Usuario ${session.user.dni} cambió el estado del vuelo ID ${id}`);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/incidencias") {
        const session = await requireAuth(req, res);
        if (!session) return;
        const [rows] = await pool.query("SELECT * FROM incidencias ORDER BY creado_en DESC, id DESC");
        return sendJson(res, 200, rows);
      }

      if (req.method === "POST" && url.pathname === "/api/incidencias") {
        const session = await requirePermission(req, res, "simulateIncident", "Tu perfil no puede registrar incidencias.");
        if (!session) return;

        const data = await readJson(req);
        const prioridad = String(data.prioridad || "Alta").trim();
        if (!INCIDENT_PRIORITIES.includes(prioridad)) {
          return sendJson(res, 400, { error: "Prioridad de incidencia inválida." });
        }

        const [[countRow]] = await pool.query("SELECT COUNT(*) AS total FROM incidencias");
        const next = Number(countRow.total) + 1;
        const codigo = `INC-${String(next).padStart(3, "0")}`;

        await pool.query(
          "INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id) VALUES (?, ?, ?, ?, NULL)",
          [
            codigo,
            String(data.tipo || "Infraestructura").trim(),
            prioridad,
            String(data.descripcion || "Incidencia operativa registrada").trim()
          ]
        );

        await logAudit("REGISTRO_INCIDENCIA", `Usuario ${session.user.dni} registró incidencia ${codigo}`);
        return sendJson(res, 201, { ok: true, codigo });
      }

      if (req.method === "GET" && url.pathname === "/api/recursos") {
        const session = await requireAuth(req, res);
        if (!session) return;
        const [rows] = await pool.query("SELECT * FROM recursos ORDER BY tipo ASC, codigo ASC");
        return sendJson(res, 200, rows);
      }

      if (req.method === "PATCH" && url.pathname.startsWith("/api/recursos/")) {
        const session = await requirePermission(req, res, "updateResource", "Tu perfil no puede actualizar recursos.");
        if (!session) return;

        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: "Recurso inválido." });

        const data = await readJson(req);
        const estado = String(data.estado || "").trim();
        if (!estado) return sendJson(res, 400, { error: "Estado de recurso inválido." });

        const [result] = await pool.query("UPDATE recursos SET estado = ? WHERE id = ?", [estado, id]);
        if (!result.affectedRows) return sendJson(res, 404, { error: "Recurso no encontrado." });

        const [[resource]] = await pool.query("SELECT * FROM recursos WHERE id = ?", [id]);
        await logAudit("ACTUALIZACION_RECURSO", `Usuario ${session.user.dni} actualizó recurso ${resource?.codigo || id}`);
        return sendJson(res, 200, resource);
      }

      if (req.method === "GET" && url.pathname === "/api/reportes") {
        const session = await requirePermission(req, res, "generateReport", "Tu perfil no tiene acceso a reportes.");
        if (!session) return;

        const reportIdColumn = (await columnExists(pool, "reportes", "id")) ? "id" : "id_reporte";
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
        const session = await requirePermission(req, res, "generateReport", "Tu perfil no puede generar reportes.");
        if (!session) return;

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
          [tipo, titulo, contenido, fecha, session.user.id]
        );

        await logAudit("REPORTE_CREADO", `Usuario ${session.user.dni} generó reporte ${titulo}`);
        return sendJson(res, 201, { ok: true, id: result.insertId });
      }

      if (req.method === "PATCH" && url.pathname.startsWith("/api/reportes/")) {
        const session = await requirePermission(req, res, "generateReport", "Tu perfil no puede editar reportes.");
        if (!session) return;

        const id = Number(url.pathname.split("/").pop());
        const data = await readJson(req);
        const tipo = String(data.tipo || data.type || "").trim();
        const titulo = String(data.titulo || data.title || "").trim();
        const contenido = String(data.contenido || data.desc || "").trim();
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha_generacion || data.dateInput || ""))
          ? String(data.fecha_generacion || data.dateInput)
          : new Date().toISOString().slice(0, 10);

        if (!Number.isInteger(id) || id <= 0 || !tipo || !titulo || !contenido) {
          return sendJson(res, 400, { error: "Datos de reporte inválidos." });
        }

        const reportIdColumn = (await columnExists(pool, "reportes", "id")) ? "id" : "id_reporte";
        const [result] = await pool.query(
          `UPDATE reportes
           SET tipo = ?, titulo = ?, contenido = ?, fecha_generacion = ?
           WHERE ${reportIdColumn} = ? AND eliminado = 0`,
          [tipo, titulo, contenido, fecha, id]
        );
        if (!result.affectedRows) return sendJson(res, 404, { error: "Reporte no encontrado." });

        await logAudit("REPORTE_ACTUALIZADO", `Usuario ${session.user.dni} actualizó reporte ID ${id}`);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "DELETE" && url.pathname.startsWith("/api/reportes/")) {
        const session = await requirePermission(req, res, "generateReport", "Tu perfil no puede eliminar reportes.");
        if (!session) return;

        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: "Reporte inválido." });

        const reportIdColumn = (await columnExists(pool, "reportes", "id")) ? "id" : "id_reporte";
        const [result] = await pool.query(`UPDATE reportes SET eliminado = 1 WHERE ${reportIdColumn} = ? AND eliminado = 0`, [id]);
        if (!result.affectedRows) return sendJson(res, 404, { error: "Reporte no encontrado." });

        await logAudit("REPORTE_ELIMINADO", `Usuario ${session.user.dni} eliminó reporte ID ${id}`);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/solicitudes") {
        const session = await requireAuth(req, res);
        if (!session) return;

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
        const session = await requirePermission(
          req,
          res,
          ["createFlight", "changeFlight", "approveIncoming"],
          "Tu perfil no puede crear solicitudes operativas."
        );
        if (!session) return;

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

        await logAudit("SOLICITUD_OPERATIVA", `Usuario ${session.user.dni} registró solicitud ${codigo}`);

        const [[requestRow]] = await pool.query(
          `SELECT id, codigo, ruta, hora, puerta, estado, tipo, motivo, origen_vuelo,
                  UNIX_TIMESTAMP(disponible_desde) * 1000 AS dueAt
           FROM solicitudes_operativas WHERE codigo = ?`,
          [codigo]
        );
        return sendJson(res, 201, requestRow);
      }

      if ((req.method === "PATCH" || req.method === "DELETE") && url.pathname.startsWith("/api/solicitudes/")) {
        const session = await requirePermission(
          req,
          res,
          ["createFlight", "changeFlight", "approveIncoming"],
          "Tu perfil no puede gestionar solicitudes operativas."
        );
        if (!session) return;

        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: "Solicitud inválida." });

        const nextState = req.method === "DELETE" ? "Cerrada" : String((await readJson(req)).estado || "Cerrada").trim();
        const [result] = await pool.query("UPDATE solicitudes_operativas SET estado = ? WHERE id = ?", [nextState, id]);
        if (!result.affectedRows) return sendJson(res, 404, { error: "Solicitud no encontrada." });

        await logAudit("SOLICITUD_ACTUALIZADA", `Usuario ${session.user.dni} cambió solicitud ID ${id} a ${nextState}`);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/role-tools") {
        const session = await requireAuth(req, res);
        if (!session) return;

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
        const session = await requireAuth(req, res);
        if (!session) return;
        const active = session.user;

        const data = await readJson(req);
        const serverActor = resolveActor(active);
        const requestedActor = String(data.actor || "").trim().toLowerCase();
        if (requestedActor && requestedActor !== serverActor) {
          return sendJson(res, 403, { error: "No puedes registrar acciones a nombre de otro rol." });
        }

        const tipo = String(data.tipo || "ACCION_ROL").trim().slice(0, 80);
        const detalle = String(data.detalle || "Accion operacional registrada").trim();
        const datos = JSON.stringify(data.datos || {});

        const [result] = await pool.query(
          `INSERT INTO acciones_rol (usuario_id, actor, tipo, detalle, datos)
           VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
          [active.id, serverActor, tipo, detalle, datos]
        );

        await logAudit(tipo, `Usuario ${active.dni} registró acción de rol (${serverActor}): ${detalle}`);
        return sendJson(res, 201, { ok: true, id: result.insertId });
      }

      if (req.method === "GET" && url.pathname === "/api/metricas") {
        const session = await requireAuth(req, res);
        if (!session) return;

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
        const session = await requirePermission(req, res, "viewAudit", "Tu perfil no tiene acceso a la bitácora de auditoría.");
        if (!session) return;

        const [rows] = await pool.query("SELECT * FROM bitacora ORDER BY fecha_hora DESC, id DESC LIMIT 50");
        return sendJson(res, 200, rows);
      }

      return sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(res, error.status, { error: error.message });
      }
      console.error(error);
      return sendJson(res, 500, { error: "Error interno del servidor" });
    }
  };
}

const isMainModule = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const { default: mysql } = await import("mysql2/promise");
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

  // Allow previewing an existing database without reapplying demonstration seeds.
  if (process.env.SKIP_DATABASE_INIT !== "1") await ensureDatabase(pool);

  const server = createServer(createRequestHandler(pool, { publicDir: defaultPublicDir }));
  const port = Number(process.env.PORT || 4173);

  server.listen(port, "127.0.0.1", () => {
    console.log(`AeroControl Ops con MySQL disponible en http://127.0.0.1:${port}`);
    console.log(`Base de datos MySQL: ${dbConfig.database} en ${dbConfig.host}:${dbConfig.port}`);
  });
}
