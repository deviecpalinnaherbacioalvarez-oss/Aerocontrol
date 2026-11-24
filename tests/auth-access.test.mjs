import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createRequestHandler } from "../server-mysql.mjs";
import { hashPassword, hashSessionToken, legacyHashPassword } from "../lib/access-control.mjs";

function createInMemoryPool() {
  const db = {
    usuarios: [
      { id: 1, nombre: "Admin", apellido: "AeroControl", dni: "12345678", celular: "987654321", correo: "admin@aerocontrol.local", rol: "Administrador", area: "Sistemas", password_hash: hashPassword("AeroControl1!"), habilitado: 1 },
      { id: 2, nombre: "Carlos", apellido: "Operador", dni: "23456789", celular: "987654322", correo: "operador@aerocontrol.local", rol: "Operador", area: "Operaciones aeroportuarias", password_hash: hashPassword("AeroControl1!"), habilitado: 1 },
      { id: 3, nombre: "Mariana", apellido: "Supervisora", dni: "34567890", celular: "987654323", correo: "supervisor@aerocontrol.local", rol: "Supervisor", area: "Supervision de operaciones", password_hash: hashPassword("AeroControl1!"), habilitado: 1 },
      { id: 4, nombre: "Javier", apellido: "Torre", dni: "45678901", celular: "987654324", correo: "torre@aerocontrol.local", rol: "Supervisor", area: "Torre de control", password_hash: hashPassword("AeroControl1!"), habilitado: 1 },
      { id: 5, nombre: "Rosa", apellido: "CORPAC", dni: "56789012", celular: "987654325", correo: "gerencia@aerocontrol.local", rol: "Administrador", area: "Gerencia CORPAC", password_hash: hashPassword("AeroControl1!"), habilitado: 1 },
      { id: 6, nombre: "Legacy", apellido: "Migrado", dni: "67890123", celular: "987654326", correo: "legacy@aerocontrol.local", rol: "Operador", area: "Plataforma", password_hash: legacyHashPassword("AeroControl1!"), habilitado: 1 }
    ],
    sesiones: [],
    intentos_login: [],
    vuelos: [
      { id: 1, codigo: "AVA240", ruta: "Bogota (BOG)", hora: "15:45", puerta: "A-04", estado: "Embarcando", tipo: "Salida" }
    ],
    incidencias: [
      { id: 1, codigo: "INC-001", tipo: "Operacion", prioridad: "Alta", descripcion: "Demora", estado: "Abierta", vuelo_id: 1, creado_en: new Date().toISOString() }
    ],
    recursos: [
      { id: 1, tipo: "Pista", codigo: "Pista 01", estado: "Disponible", detalle: "Habilitada" }
    ],
    reportes: [
      { id: 1, tipo: "Operacional", titulo: "Reporte diario", contenido: "Detalle", fuente: "vuelos", fecha_generacion: "2026-11-23", eliminado: 0, creado_por: 1, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }
    ],
    solicitudes_operativas: [],
    acciones_rol: [],
    bitacora: [{ id: 1, accion: "INICIALIZACION", detalle: "Init", fecha_hora: new Date().toISOString() }]
  };
  let nextIds = { usuarios: 7, sesiones: 1, vuelos: 2, incidencias: 2, recursos: 2, reportes: 2, solicitudes_operativas: 1, acciones_rol: 1, bitacora: 2 };

  async function query(sql, params = []) {
    const q = sql.replace(/\s+/g, " ").trim();

    if (q.startsWith("SHOW COLUMNS FROM reportes LIKE")) return [[{ Field: "id" }]];

    if (q.startsWith("SELECT u.id, u.nombre") && q.includes("FROM sesiones s")) {
      const tokenHash = params[0];
      const ses = db.sesiones.find(s => s.token_hash === tokenHash);
      if (!ses) return [[]];
      const usr = db.usuarios.find(u => u.id === ses.usuario_id);
      if (!usr) return [[]];
      return [[{ ...usr, expira_en: ses.expira_en }]];
    }

    if (q.startsWith("INSERT INTO sesiones")) {
      const row = { id: nextIds.sesiones++, token_hash: params[0], usuario_id: params[1], expira_en: params[2] };
      db.sesiones.push(row);
      return [{ insertId: row.id }];
    }

    if (q.startsWith("DELETE FROM sesiones WHERE token_hash = ?")) {
      const before = db.sesiones.length;
      db.sesiones = db.sesiones.filter(s => s.token_hash !== params[0]);
      return [{ affectedRows: before - db.sesiones.length }];
    }

    if (q.startsWith("DELETE FROM sesiones WHERE usuario_id = ?")) {
      const before = db.sesiones.length;
      db.sesiones = db.sesiones.filter(s => s.usuario_id !== Number(params[0]));
      return [{ affectedRows: before - db.sesiones.length }];
    }

    if (q.startsWith("SELECT clave, intentos, primer_intento, bloqueado_hasta FROM intentos_login")) {
      const row = db.intentos_login.find(r => r.clave === params[0]);
      return [row ? [row] : []];
    }

    if (q.startsWith("INSERT INTO intentos_login")) {
      const existing = db.intentos_login.find(r => r.clave === params[0]);
      if (existing) {
        existing.intentos = params[1];
        existing.primer_intento = params[2];
        existing.bloqueado_hasta = params[3];
      } else {
        db.intentos_login.push({ clave: params[0], intentos: params[1], primer_intento: params[2], bloqueado_hasta: params[3] });
      }
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("DELETE FROM intentos_login WHERE clave = ?")) {
      db.intentos_login = db.intentos_login.filter(r => r.clave !== params[0]);
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("INSERT INTO bitacora")) {
      const row = { id: nextIds.bitacora++, accion: params[0], detalle: params[1], fecha_hora: new Date().toISOString() };
      db.bitacora.unshift(row);
      return [{ insertId: row.id }];
    }

    if (q.startsWith("SELECT * FROM bitacora")) return [db.bitacora.slice(0, 50)];

    if (q.startsWith("INSERT INTO usuarios")) {
      const [, , dni, , correo] = params;
      if (db.usuarios.some(u => u.dni === dni || u.correo === correo)) {
        const err = new Error("Duplicate");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      const user = {
        id: nextIds.usuarios++,
        nombre: params[0],
        apellido: params[1],
        dni: params[2],
        celular: params[3],
        correo: params[4],
        rol: params[5],
        area: params[6],
        password_hash: params[7],
        habilitado: 1
      };
      db.usuarios.push(user);
      return [{ insertId: user.id }];
    }

    if (q.startsWith("SELECT * FROM usuarios WHERE dni = ?")) {
      return [db.usuarios.filter(u => u.dni === params[0])];
    }
    if (q.startsWith("SELECT * FROM usuarios WHERE id = ?")) {
      return [db.usuarios.filter(u => u.id === Number(params[0]))];
    }
    if (q.startsWith("SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado FROM usuarios WHERE id = ?")) {
      const u = db.usuarios.find(item => item.id === Number(params[0]));
      return [u ? [{ id: u.id, nombre: u.nombre, apellido: u.apellido, dni: u.dni, celular: u.celular, correo: u.correo, rol: u.rol, area: u.area, habilitado: u.habilitado }] : []];
    }
    if (q.startsWith("SELECT id, nombre, apellido, dni, celular, correo, rol, area, habilitado FROM usuarios ORDER BY id")) {
      return [db.usuarios.map(({ password_hash, ...rest }) => rest)];
    }

    if (q.startsWith("UPDATE usuarios SET nombre = ?, apellido = ?, celular = ?, correo = ?, area = ?, password_hash = ? WHERE id = ?")) {
      const u = db.usuarios.find(item => item.id === Number(params[6]));
      Object.assign(u, { nombre: params[0], apellido: params[1], celular: params[2], correo: params[3], area: params[4], password_hash: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE usuarios SET nombre = ?, apellido = ?, celular = ?, correo = ?, area = ? WHERE id = ?")) {
      const u = db.usuarios.find(item => item.id === Number(params[5]));
      Object.assign(u, { nombre: params[0], apellido: params[1], celular: params[2], correo: params[3], area: params[4] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE usuarios SET password_hash = ? WHERE id = ?")) {
      const u = db.usuarios.find(item => item.id === Number(params[1]));
      u.password_hash = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE usuarios SET nombre = ?, apellido = ?, celular = ?, correo = ?, rol = ?, area = ?, habilitado = ? WHERE id = ?")) {
      const u = db.usuarios.find(item => item.id === Number(params[7]));
      Object.assign(u, { nombre: params[0], apellido: params[1], celular: params[2], correo: params[3], rol: params[4], area: params[5], habilitado: params[6] });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM vuelos")) return [db.vuelos];
    if (q.startsWith("INSERT INTO vuelos")) {
      if (db.vuelos.some(v => v.codigo === params[0])) {
        const err = new Error("Dup");
        err.code = "ER_DUP_ENTRY";
        throw err;
      }
      db.vuelos.push({ id: nextIds.vuelos++, codigo: params[0], ruta: params[1], hora: params[2], puerta: params[3], estado: params[4], tipo: params[5] });
      return [{ insertId: nextIds.vuelos - 1 }];
    }
    if (q.startsWith("UPDATE vuelos SET estado = ? WHERE id = ?")) {
      const v = db.vuelos.find(item => item.id === Number(params[1]));
      if (!v) return [{ affectedRows: 0 }];
      v.estado = params[0];
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM incidencias")) return [db.incidencias];
    if (q.startsWith("SELECT COUNT(*) AS total FROM incidencias WHERE")) {
      return [[{ total: db.incidencias.filter(i => i.estado === "Abierta").length }]];
    }
    if (q.startsWith("SELECT COUNT(*) AS total FROM incidencias")) return [[{ total: db.incidencias.length }]];
    if (q.startsWith("INSERT INTO incidencias")) {
      db.incidencias.push({ id: nextIds.incidencias++, codigo: params[0], tipo: params[1], prioridad: params[2], descripcion: params[3], estado: "Abierta" });
      return [{ insertId: nextIds.incidencias - 1 }];
    }

    if (q.startsWith("SELECT * FROM recursos WHERE id = ?")) return [db.recursos.filter(r => r.id === Number(params[0]))];
    if (q.startsWith("SELECT * FROM recursos")) return [db.recursos];
    if (q.startsWith("UPDATE recursos SET estado = ? WHERE id = ?")) {
      const r = db.recursos.find(item => item.id === Number(params[1]));
      if (!r) return [{ affectedRows: 0 }];
      r.estado = params[0];
      return [{ affectedRows: 1 }];
    }

    if (q.includes("FROM reportes")) {
      if (q.startsWith("SELECT")) return [db.reportes.filter(r => r.eliminado === 0)];
    }
    if (q.startsWith("INSERT INTO reportes")) {
      const id = nextIds.reportes++;
      db.reportes.push({ id, tipo: params[0], titulo: params[1], contenido: params[2], fecha_generacion: params[3], creado_por: params[4], eliminado: 0 });
      return [{ insertId: id }];
    }
    if (q.startsWith("UPDATE reportes SET tipo = ?")) {
      const r = db.reportes.find(item => item.id === Number(params[4]) && item.eliminado === 0);
      if (!r) return [{ affectedRows: 0 }];
      Object.assign(r, { tipo: params[0], titulo: params[1], contenido: params[2], fecha_generacion: params[3] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE reportes SET eliminado = 1")) {
      const r = db.reportes.find(item => item.id === Number(params[0]) && item.eliminado === 0);
      if (!r) return [{ affectedRows: 0 }];
      r.eliminado = 1;
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT") && q.includes("FROM solicitudes_operativas WHERE codigo = ?")) {
      return [db.solicitudes_operativas.filter(s => s.codigo === params[0])];
    }
    if (q.startsWith("SELECT") && q.includes("FROM solicitudes_operativas")) {
      return [db.solicitudes_operativas.filter(s => s.estado === "Pendiente")];
    }
    if (q.startsWith("INSERT INTO solicitudes_operativas")) {
      let existing = db.solicitudes_operativas.find(s => s.codigo === params[0]);
      if (!existing) {
        existing = { id: nextIds.solicitudes_operativas++, codigo: params[0], estado: "Pendiente" };
        db.solicitudes_operativas.push(existing);
      }
      Object.assign(existing, { ruta: params[1], hora: params[2], puerta: params[3], tipo: params[4], motivo: params[5], origen_vuelo: params[6], dueAt: Date.now(), estado: "Pendiente" });
      return [{ insertId: existing.id }];
    }
    if (q.startsWith("UPDATE solicitudes_operativas SET estado = ? WHERE id = ?")) {
      const s = db.solicitudes_operativas.find(item => item.id === Number(params[1]));
      if (!s) return [{ affectedRows: 0 }];
      s.estado = params[0];
      return [{ affectedRows: 1 }];
    }

    if (q.includes("FROM acciones_rol ar")) return [db.acciones_rol];
    if (q.startsWith("INSERT INTO acciones_rol")) {
      const id = nextIds.acciones_rol++;
      db.acciones_rol.push({ id, usuario_id: params[0], actor: params[1], tipo: params[2], detalle: params[3], datos: params[4], creado_en: new Date().toISOString() });
      return [{ insertId: id }];
    }

    if (q.startsWith("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Llegada'")) return [[{ total: db.vuelos.filter(v => v.tipo === "Llegada").length }]];
    if (q.startsWith("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Salida'")) return [[{ total: db.vuelos.filter(v => v.tipo === "Salida").length }]];
    if (q.startsWith("SELECT COUNT(*) AS total FROM vuelos WHERE estado = 'Retrasado'")) return [[{ total: db.vuelos.filter(v => v.estado === "Retrasado").length }]];
    if (q.startsWith("SELECT COUNT(*) AS total FROM bitacora")) return [[{ total: db.bitacora.length }]];

    throw new Error(`Unhandled SQL in mock pool: ${q}`);
  }

  return { db, query };
}

async function apiFetch(baseUrl, path, { method = "GET", cookie = "", body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookieHeader = res.headers.get("set-cookie");
  const nextCookie = setCookieHeader ? setCookieHeader.split(";")[0] : cookie;
  const parsed = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, setCookieHeader, cookie: nextCookie, body: parsed };
}

async function loginAs(baseUrl, dni, password = "AeroControl1!") {
  const res = await apiFetch(baseUrl, "/api/auth/login", { method: "POST", body: { dni, password } });
  assert.equal(res.status, 200, `Expected 200 login for ${dni}, got ${res.status}`);
  return res;
}

test("Point 6 Auth & Access Control: unauthenticated routes return 401 and public /me returns null", async t => {
  const pool = createInMemoryPool();
  const server = createServer(createRequestHandler(pool));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const me = await apiFetch(baseUrl, "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.user, null);

  const protectedGets = [
    "/api/vuelos",
    "/api/incidencias",
    "/api/recursos",
    "/api/reportes",
    "/api/solicitudes",
    "/api/role-tools",
    "/api/metricas",
    "/api/bitacora",
    "/api/usuarios"
  ];
  for (const route of protectedGets) {
    const res = await apiFetch(baseUrl, route);
    assert.equal(res.status, 401, `Expected 401 without session on ${route}`);
  }
});

test("Point 6 Privilege Escalation: self-registration forces Operador and blocks privileged areas", async t => {
  const pool = createInMemoryPool();
  const server = createServer(createRequestHandler(pool));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const badArea = await apiFetch(baseUrl, "/api/auth/register", {
    method: "POST",
    body: {
      nombre: "Atacante",
      apellido: "Prueba",
      dni: "77778888",
      celular: "911223344",
      correo: "atacante@test.local",
      rol: "Administrador",
      area: "Gerencia CORPAC",
      password: "PasswordSegura1!"
    }
  });
  assert.equal(badArea.status, 400);

  const reg = await apiFetch(baseUrl, "/api/auth/register", {
    method: "POST",
    body: {
      nombre: "Nuevo",
      apellido: "Operario",
      dni: "77778889",
      celular: "911223345",
      correo: "nuevo@test.local",
      rol: "Administrador",
      area: "Plataforma",
      password: "PasswordSegura1!"
    }
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.rol, "Operador");
  assert.equal(reg.body.user.area, "Plataforma");
});

test("Point 6 Authentication Hardening: persistent hashed sessions, legacy migration, lockout, logout, and immediate disable revocation", async t => {
  const pool = createInMemoryPool();
  const serverA = createServer(createRequestHandler(pool));
  await new Promise(resolve => serverA.listen(0, "127.0.0.1", resolve));
  const baseUrlA = `http://127.0.0.1:${serverA.address().port}`;

  // Legacy SHA-256 user logs in cleanly and gets upgraded to scrypt
  const legacyLogin = await loginAs(baseUrlA, "67890123");
  assert.ok(legacyLogin.setCookieHeader.includes("HttpOnly"));
  assert.ok(legacyLogin.setCookieHeader.includes("SameSite=Lax"));
  assert.equal(legacyLogin.setCookieHeader.includes("Secure"), false, "HTTPS flag #8 intentionally untouched");
  assert.equal(pool.db.usuarios.find(u => u.dni === "67890123").password_hash.startsWith("scrypt$"), true);

  // Stored session uses SHA-256 hash, never plaintext token
  const rawToken = decodeURIComponent(legacyLogin.cookie.split("=")[1]);
  assert.equal(pool.db.sesiones.length, 1);
  assert.equal(pool.db.sesiones[0].token_hash, hashSessionToken(rawToken));
  assert.notEqual(pool.db.sesiones[0].token_hash, rawToken);

  // Simulate server restart: new handler on existing DB retains session
  await new Promise(resolve => serverA.close(resolve));
  const serverB = createServer(createRequestHandler(pool));
  await new Promise(resolve => serverB.listen(0, "127.0.0.1", resolve));
  t.after(() => serverB.close());
  const baseUrlB = `http://127.0.0.1:${serverB.address().port}`;

  const resumed = await apiFetch(baseUrlB, "/api/auth/me", { cookie: legacyLogin.cookie });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.user.dni, "67890123");

  // Disabling user immediately invalidates active session
  const adminLogin = await loginAs(baseUrlB, "12345678");
  const disableRes = await apiFetch(baseUrlB, "/api/usuarios/6", {
    method: "PATCH",
    cookie: adminLogin.cookie,
    body: {
      nombre: "Legacy",
      apellido: "Migrado",
      celular: "987654326",
      correo: "legacy@aerocontrol.local",
      rol: "Operador",
      area: "Plataforma",
      habilitado: false
    }
  });
  assert.equal(disableRes.status, 200);
  const kickedOut = await apiFetch(baseUrlB, "/api/vuelos", { cookie: legacyLogin.cookie });
  assert.equal(kickedOut.status, 401);

  // Password change rotates session token and revokes prior session
  const opLogin = await loginAs(baseUrlB, "23456789");
  const profileChange = await apiFetch(baseUrlB, "/api/auth/profile", {
    method: "PATCH",
    cookie: opLogin.cookie,
    body: {
      nombre: "Carlos",
      apellido: "Operador",
      celular: "987654322",
      correo: "operador@aerocontrol.local",
      area: "Plataforma",
      password: "NuevaClaveSegura1!"
    }
  });
  assert.equal(profileChange.status, 200);
  assert.notEqual(profileChange.cookie, opLogin.cookie);
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: opLogin.cookie })).status, 401);
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: profileChange.cookie })).status, 200);

  // Logout clears DB session
  await apiFetch(baseUrlB, "/api/auth/logout", { method: "POST", cookie: profileChange.cookie });
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: profileChange.cookie })).status, 401);

  // Expired session in DB is rejected and deleted
  const expiredTokenCheck = await loginAs(baseUrlB, "56789012");
  const expiredRawToken = decodeURIComponent(expiredTokenCheck.cookie.split("=")[1]);
  const storedExpired = pool.db.sesiones.find(s => s.token_hash === hashSessionToken(expiredRawToken));
  assert.ok(storedExpired);
  storedExpired.expira_en = Date.now() - 5000;
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: expiredTokenCheck.cookie })).status, 401);
  assert.equal(pool.db.sesiones.some(s => s.token_hash === hashSessionToken(expiredRawToken)), false);

  // Session fixation defense: logging in while holding prior cookie invalidates old token and rotates to a new one
  const initialSession = await loginAs(baseUrlB, "12345678");
  const rotatedSession = await apiFetch(baseUrlB, "/api/auth/login", {
    method: "POST",
    cookie: initialSession.cookie,
    body: { dni: "12345678", password: "AeroControl1!" }
  });
  assert.equal(rotatedSession.status, 200);
  assert.notEqual(rotatedSession.cookie, initialSession.cookie);
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: initialSession.cookie })).status, 401);
  assert.equal((await apiFetch(baseUrlB, "/api/vuelos", { cookie: rotatedSession.cookie })).status, 200);

  // Cross-IP brute force lockout against one DNI (5 failures across different remoteAddress IPs -> 429)
  const handler = createRequestHandler(pool);
  for (let i = 0; i < 4; i++) {
    const req = new Readable({ read() { this.push(JSON.stringify({ dni: "34567890", password: "WrongPassword1!" })); this.push(null); } });
    req.method = "POST";
    req.url = "/api/auth/login";
    req.headers = { host: "127.0.0.1", "content-type": "application/json" };
    req.socket = { remoteAddress: `10.0.0.${i + 10}` };
    const status = await new Promise(resolve => {
      const res = {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(s) { this.statusCode = s; },
        end() { resolve(this.statusCode); }
      };
      handler(req, res);
    });
    assert.equal(status, 401);
  }
  const fifthFromNewIp = await apiFetch(baseUrlB, "/api/auth/login", { method: "POST", body: { dni: "34567890", password: "WrongPassword1!" } });
  assert.equal(fifthFromNewIp.status, 429);

  // Brute force lockout (5 failures -> 429 + bitacora)
  for (let i = 0; i < 4; i++) {
    const attempt = await apiFetch(baseUrlB, "/api/auth/login", { method: "POST", body: { dni: "23456789", password: "WrongPassword1!" } });
    assert.equal(attempt.status, 401);
  }
  const locked = await apiFetch(baseUrlB, "/api/auth/login", { method: "POST", body: { dni: "23456789", password: "WrongPassword1!" } });
  assert.equal(locked.status, 429);
  assert.ok(locked.headers.get("retry-after"));
  assert.equal(pool.db.bitacora[0].accion, "LOGIN_BLOQUEADO");
});

test("Point 6 RBAC Matrix & Self-Profile Guard: enforces 403 across roles and prevents spoofing", async t => {
  const pool = createInMemoryPool();
  const server = createServer(createRequestHandler(pool));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const op = await loginAs(baseUrl, "23456789");
  const sup = await loginAs(baseUrl, "34567890");
  const torre = await loginAs(baseUrl, "45678901");
  const gerencia = await loginAs(baseUrl, "56789012");
  const admin = await loginAs(baseUrl, "12345678");

  // Operador RBAC
  assert.equal((await apiFetch(baseUrl, "/api/usuarios", { cookie: op.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/bitacora", { cookie: op.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/reportes", { cookie: op.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/role-tools", { method: "POST", cookie: op.cookie, body: { actor: "administrador", tipo: "AUDIT", detalle: "spoof" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/auth/profile", { method: "PATCH", cookie: op.cookie, body: { nombre: "Carlos", apellido: "Operador", celular: "987654322", correo: "operador@aerocontrol.local", area: "Gerencia CORPAC" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/incidencias", { method: "POST", cookie: op.cookie, body: { tipo: "Rampa", prioridad: "Alta", descripcion: "Ok" } })).status, 201);

  // Supervisor RBAC
  assert.equal((await apiFetch(baseUrl, "/api/usuarios", { cookie: sup.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/vuelos", { method: "POST", cookie: sup.cookie, body: { codigo: "SUP100", ruta: "LIM", hora: "12:00", puerta: "A1", estado: "Programado", tipo: "Salida" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/recursos/1", { method: "PATCH", cookie: sup.cookie, body: { estado: "Mantenimiento" } })).status, 200);
  assert.equal((await apiFetch(baseUrl, "/api/bitacora", { cookie: sup.cookie })).status, 200);

  // Torre RBAC (can approve flights via POST /api/vuelos & change flight status, cannot manage users/reports/resources)
  assert.equal((await apiFetch(baseUrl, "/api/usuarios", { cookie: torre.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/reportes", { method: "POST", cookie: torre.cookie, body: { tipo: "T", titulo: "X", contenido: "Y" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/recursos/1", { method: "PATCH", cookie: torre.cookie, body: { estado: "Cerrada" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/vuelos/1", { method: "PATCH", cookie: torre.cookie, body: { estado: "En hora" } })).status, 200);
  assert.equal((await apiFetch(baseUrl, "/api/vuelos", { method: "POST", cookie: torre.cookie, body: { codigo: "TOR999", ruta: "Lima - Cusco", hora: "19:00", puerta: "A-02", estado: "Programado", tipo: "Llegada" } })).status, 201);

  // Gerencia RBAC (cannot escalate area to Sistemas, cannot create flights, can manage reports)
  assert.equal((await apiFetch(baseUrl, "/api/usuarios", { cookie: gerencia.cookie })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/auth/profile", { method: "PATCH", cookie: gerencia.cookie, body: { nombre: "Rosa", apellido: "CORPAC", celular: "987654325", correo: "gerencia@aerocontrol.local", area: "Sistemas" } })).status, 403);
  assert.equal((await apiFetch(baseUrl, "/api/reportes", { method: "POST", cookie: gerencia.cookie, body: { tipo: "Regulatorio", titulo: "DGAC", contenido: "Resumen" } })).status, 201);

  // Admin can manage users and cannot disable or demote self
  assert.equal((await apiFetch(baseUrl, "/api/usuarios", { cookie: admin.cookie })).status, 200);
  assert.equal((await apiFetch(baseUrl, "/api/usuarios/1", { method: "PATCH", cookie: admin.cookie, body: { nombre: "Admin", apellido: "AeroControl", celular: "987654321", correo: "admin@aerocontrol.local", rol: "Operador", area: "Sistemas", habilitado: true } })).status, 400);
});
