import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export const ALLOWED_ROLES = ["Operador", "Supervisor", "Administrador"];
export const PUBLIC_REGISTER_AREAS = [
  "Operaciones aeroportuarias",
  "Plataforma",
  "Rampa",
  "Operaciones"
];
export const FLIGHT_STATES = ["Programado", "Embarcando", "En hora", "Retrasado", "Finalizado"];
export const INCIDENT_PRIORITIES = ["Alta", "Media", "Baja"];

const PRIVILEGED_AREA_PATTERN = /(torre|gerencia|corpac|sistemas|supervis)/i;

export const ROLE_PERMISSIONS = {
  administrador: new Set([
    "createFlight",
    "changeFlight",
    "simulateIncident",
    "updateResource",
    "generateReport",
    "approveIncoming",
    "manageUsers",
    "viewAudit"
  ]),
  operador: new Set([
    "createFlight",
    "changeFlight",
    "simulateIncident",
    "updateResource"
  ]),
  supervisor: new Set([
    "updateResource",
    "generateReport",
    "viewAudit"
  ]),
  torre: new Set([
    "changeFlight",
    "approveIncoming"
  ]),
  gerencia: new Set([
    "generateReport",
    "viewAudit"
  ])
};

/** Legacy unsalted SHA-256 support kept strictly for automatic migration of old DB hashes on login. */
export function legacyHashPassword(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Hashes a password with a per-user random salt using scrypt. */
export function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/** Constant-time verification supporting scrypt and migrating legacy SHA-256 hashes. */
export function verifyPassword(value, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  if (storedHash.startsWith("scrypt$")) {
    const [, salt, hash] = storedHash.split("$");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const derived = scryptSync(value, salt, 64);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
  const legacy = Buffer.from(legacyHashPassword(value), "utf8");
  const target = Buffer.from(storedHash, "utf8");
  return legacy.length === target.length && timingSafeEqual(legacy, target);
}

/** Validates password complexity against server policy. */
export function passwordPolicyError(value) {
  const password = String(value || "");
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (password.length > 72) return "La contraseña no debe superar 72 caracteres.";
  if (/\s/.test(password)) return "La contraseña no debe contener espacios.";
  if (!/[A-Z]/.test(password)) return "La contraseña debe incluir al menos una letra mayúscula.";
  if (!/[a-z]/.test(password)) return "La contraseña debe incluir al menos una letra minúscula.";
  if (!/\d/.test(password)) return "La contraseña debe incluir al menos un número.";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "La contraseña debe incluir al menos un símbolo especial.";
  return null;
}

/** Generates a 256-bit random session token. */
export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

/** Hashes a bearer session cookie token with SHA-256 before database storage/lookup. */
export function hashSessionToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

/** Builds an HttpOnly SameSite=Lax cookie string without forcing HTTPS (handled separately). */
export function buildSessionCookie(token, maxAgeSeconds = SESSION_TTL_SECONDS) {
  return `aerocontrol_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** Parses Cookie header pairs safely. */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const pairs = header.split(";").map(part => part.trim()).filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const rawValue = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

/** Projects a database user row into a safe public response object. */
export function publicUser(row) {
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

/** Maps a user's DB role (primary) and area (secondary specialization) to an RBAC actor key. */
export function resolveActor(user) {
  const area = String(user?.area || "").toLowerCase();
  const role = String(user?.rol || "").toLowerCase();

  // Check role first so an Operador can never inherit Torre/Gerencia capabilities via area text.
  if (role.includes("administrador")) {
    if (area.includes("gerencia") || area.includes("corpac")) return "gerencia";
    return "administrador";
  }
  if (role.includes("supervisor")) {
    if (area.includes("torre")) return "torre";
    return "supervisor";
  }
  return "operador";
}

/** Checks whether the user is an enabled Administrador del sistema. */
export function canManageUsers(user) {
  return Boolean(user?.habilitado) && resolveActor(user) === "administrador";
}

/** Returns true if the authenticated, enabled user holds the specified permission. */
export function hasPermission(user, permission) {
  if (!user || !user.habilitado) return false;
  const actor = resolveActor(user);
  return ROLE_PERMISSIONS[actor]?.has(permission) ?? false;
}

/** Returns true if the authenticated, enabled user holds at least one of the listed permissions. */
export function hasAnyPermission(user, permissions) {
  return permissions.some(permission => hasPermission(user, permission));
}

/** Validates self-registration payload fields and password strength. */
export function validateUser(data) {
  const required = ["nombre", "apellido", "dni", "celular", "correo", "password"];
  const missing = required.filter(key => !String(data[key] ?? "").trim());
  if (missing.length) return `Faltan campos: ${missing.join(", ")}`;
  if (!/^\d{8}$/.test(String(data.dni).trim())) return "El DNI debe tener 8 dígitos";
  if (!/^9\d{8}$/.test(String(data.celular).trim())) return "El celular debe tener 9 dígitos y empezar con 9";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.correo).trim())) return "Correo inválido";
  const passwordError = passwordPolicyError(data.password);
  if (passwordError) return passwordError;
  return null;
}

/** Enforces safe non-privileged area selection during public registration. */
export function resolvePublicRegistrationArea(rawArea) {
  const area = String(rawArea || "").trim() || "Operaciones aeroportuarias";
  if (PUBLIC_REGISTER_AREAS.includes(area)) return { ok: true, area };
  return {
    ok: false,
    error: "Área no permitida en registro público. Todo auto-registro inicia como Operador en un área operativa."
  };
}

/** Prevents self-escalation when updating one's own area on PATCH /api/auth/profile. */
export function isAreaAllowedForProfileUpdate(rol, requestedArea, currentArea) {
  const normalizedArea = String(requestedArea || "").trim();
  if (!normalizedArea) return false;
  if (normalizedArea === String(currentArea || "").trim()) return true;
  const currentActor = resolveActor({ rol, area: currentArea });
  if (currentActor === "administrador") return true;
  return resolveActor({ rol, area: normalizedArea }) === currentActor && !PRIVILEGED_AREA_PATTERN.test(normalizedArea);
}
