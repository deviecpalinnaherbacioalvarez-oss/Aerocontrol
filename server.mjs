import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "aerocontrol.db"));
db.exec("PRAGMA foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS vuelos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    ruta TEXT NOT NULL,
    hora TEXT NOT NULL,
    puerta TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('Programado','Embarcando','En hora','Retrasado','Finalizado')),
    tipo TEXT NOT NULL CHECK (tipo IN ('Salida','Llegada','Tránsito')),
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS incidencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    prioridad TEXT NOT NULL CHECK (prioridad IN ('Alta','Media','Baja')),
    descripcion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Abierta',
    vuelo_id INTEGER,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vuelo_id) REFERENCES vuelos(id)
  );

  CREATE TABLE IF NOT EXISTS recursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    codigo TEXT NOT NULL UNIQUE,
    estado TEXT NOT NULL,
    detalle TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bitacora (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accion TEXT NOT NULL,
    detalle TEXT NOT NULL,
    fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedCount = db.prepare("SELECT COUNT(*) AS total FROM vuelos").get().total;
if (seedCount === 0) {
  const insertFlight = db.prepare("INSERT INTO vuelos (codigo, ruta, hora, puerta, estado, tipo) VALUES (?, ?, ?, ?, ?, ?)");
  [
    ["IBE3421", "Madrid (MAD)", "15:10", "C-12", "En hora", "Llegada"],
    ["AVA240", "Bogotá (BOG)", "15:45", "A-04", "Embarcando", "Salida"],
    ["AAL982", "Miami (MIA)", "16:00", "B-02", "Retrasado", "Salida"],
    ["LAT4412", "Santiago (SCL)", "16:20", "C-08", "Programado", "Salida"],
    ["SKY119", "Cusco (CUZ)", "17:05", "A-09", "En hora", "Llegada"]
  ].forEach(row => insertFlight.run(...row));

  const insertResource = db.prepare("INSERT INTO recursos (tipo, codigo, estado, detalle) VALUES (?, ?, ?, ?)");
  [
    ["Pista", "Pista 01", "Disponible", "Habilitada para llegadas y salidas"],
    ["Pista", "Pista 02", "En observación", "Posible restricción meteorológica"],
    ["Puerta", "A-04", "Embarque", "Asignada al vuelo AVA240"],
    ["Puerta", "B-02", "Retrasado", "Asignada al vuelo AAL982"]
  ].forEach(row => insertResource.run(...row));

  const flightId = db.prepare("SELECT id FROM vuelos WHERE codigo = 'AAL982'").get().id;
  db.prepare("INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id) VALUES (?, ?, ?, ?, ?)")
    .run("INC-001", "Operación", "Alta", "Retraso por condiciones meteorológicas", flightId);
  db.prepare("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)").run("INICIALIZACION", "Base de datos creada con datos de demostración");
}

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Solicitud demasiado grande");
  }
  return raw ? JSON.parse(raw) : {};
}

function validateFlight(data) {
  const required = ["codigo", "ruta", "hora", "puerta", "estado", "tipo"];
  const missing = required.filter(key => !String(data[key] ?? "").trim());
  if (missing.length) return `Faltan campos: ${missing.join(", ")}`;
  if (!/^[A-Z0-9-]{3,12}$/i.test(data.codigo)) return "Código de vuelo inválido";
  return null;
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/vuelos") {
    return sendJson(res, 200, db.prepare("SELECT * FROM vuelos ORDER BY hora, codigo").all());
  }

  if (req.method === "POST" && url.pathname === "/api/vuelos") {
    const data = await readJson(req);
    const error = validateFlight(data);
    if (error) return sendJson(res, 400, { error });
    try {
      const result = db.prepare("INSERT INTO vuelos (codigo, ruta, hora, puerta, estado, tipo) VALUES (?, ?, ?, ?, ?, ?)")
        .run(data.codigo.toUpperCase(), data.ruta, data.hora, data.puerta.toUpperCase(), data.estado, data.tipo);
      db.prepare("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)").run("CREAR_VUELO", `Vuelo ${data.codigo.toUpperCase()} registrado`);
      return sendJson(res, 201, db.prepare("SELECT * FROM vuelos WHERE id = ?").get(result.lastInsertRowid));
    } catch (error) {
      return sendJson(res, 409, { error: error.message.includes("UNIQUE") ? "El código de vuelo ya existe" : "No se pudo registrar el vuelo" });
    }
  }

  const flightMatch = url.pathname.match(/^\/api\/vuelos\/(\d+)$/);
  if (req.method === "PATCH" && flightMatch) {
    const data = await readJson(req);
    const allowed = ["Programado", "Embarcando", "En hora", "Retrasado", "Finalizado"];
    if (!allowed.includes(data.estado)) return sendJson(res, 400, { error: "Estado inválido" });
    const result = db.prepare("UPDATE vuelos SET estado = ? WHERE id = ?").run(data.estado, Number(flightMatch[1]));
    if (!result.changes) return sendJson(res, 404, { error: "Vuelo no encontrado" });
    db.prepare("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)").run("ACTUALIZAR_VUELO", `Vuelo ${flightMatch[1]} cambió a ${data.estado}`);
    return sendJson(res, 200, db.prepare("SELECT * FROM vuelos WHERE id = ?").get(Number(flightMatch[1])));
  }

  if (req.method === "GET" && url.pathname === "/api/incidencias") {
    return sendJson(res, 200, db.prepare(`
      SELECT i.*, v.codigo AS vuelo_codigo
      FROM incidencias i LEFT JOIN vuelos v ON v.id = i.vuelo_id
      ORDER BY i.id DESC
    `).all());
  }

  if (req.method === "POST" && url.pathname === "/api/incidencias") {
    const data = await readJson(req);
    if (!data.tipo || !data.prioridad || !data.descripcion) return sendJson(res, 400, { error: "Tipo, prioridad y descripción son obligatorios" });
    const next = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS value FROM incidencias").get().value;
    const codigo = `INC-${String(next).padStart(3, "0")}`;
    const result = db.prepare("INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id) VALUES (?, ?, ?, ?, ?)")
      .run(codigo, data.tipo, data.prioridad, data.descripcion, data.vuelo_id || null);
    db.prepare("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)").run("CREAR_INCIDENCIA", `${codigo}: ${data.descripcion}`);
    return sendJson(res, 201, db.prepare("SELECT * FROM incidencias WHERE id = ?").get(result.lastInsertRowid));
  }

  if (req.method === "GET" && url.pathname === "/api/recursos") {
    return sendJson(res, 200, db.prepare("SELECT * FROM recursos ORDER BY tipo, codigo").all());
  }

  if (req.method === "GET" && url.pathname === "/api/metricas") {
    const vuelos = db.prepare("SELECT COUNT(*) AS total FROM vuelos").get().total;
    const llegadas = db.prepare("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Llegada'").get().total;
    const salidas = db.prepare("SELECT COUNT(*) AS total FROM vuelos WHERE tipo = 'Salida'").get().total;
    const retrasados = db.prepare("SELECT COUNT(*) AS total FROM vuelos WHERE estado = 'Retrasado'").get().total;
    const incidencias = db.prepare("SELECT COUNT(*) AS total FROM incidencias WHERE estado != 'Cerrada'").get().total;
    const auditadas = db.prepare("SELECT COUNT(*) AS total FROM bitacora").get().total;
    return sendJson(res, 200, { vuelos, llegadas, salidas, retrasados, incidencias, auditadas, disponibilidad: 99.3 });
  }

  if (req.method === "GET" && url.pathname === "/api/bitacora") {
    return sendJson(res, 200, db.prepare("SELECT * FROM bitacora ORDER BY id DESC LIMIT 50").all());
  }

  return sendJson(res, 404, { error: "Endpoint no encontrado" });
}

async function staticFile(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Archivo no encontrado");
  }
  const body = await readFile(filePath);
  res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Error interno del servidor" });
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`AeroControl Ops disponible en http://127.0.0.1:${port}`);
  console.log(`Base de datos: ${join(dataDir, "aerocontrol.db")}`);
});
