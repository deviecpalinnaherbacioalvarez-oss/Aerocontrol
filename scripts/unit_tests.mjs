import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// 1. Validador de códigos de vuelo IATA/ICAO
function isValidFlightCode(code) {
  return /^[A-Z0-9]{2,3}\d{3,4}$/.test(code);
}

// 2. Algoritmo de proximidad en radar (Canvas 2D)
function checkRadarCollision(p1, p2, minDistance = 50) {
  const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  return dist < minDistance;
}

// 3. Función de hash de contraseña (Seguridad)
function hashPassword(pass) {
  return createHash("sha256").update(pass).digest("hex");
}

// 4. Sanitizador XSS para interfaces de usuario
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 5. Verificador de conflicto de puerta
function hasGateConflict(scheduledFlights, newFlight) {
  return scheduledFlights.some(f => 
    f.puerta === newFlight.puerta && 
    f.hora === newFlight.hora && 
    f.codigo !== newFlight.codigo
  );
}

test("TC-U01: Validación de formato de códigos de vuelo IATA/ICAO", () => {
  assert.equal(isValidFlightCode("LA2045"), true, "LA2045 debe ser válido");
  assert.equal(isValidFlightCode("IB6651"), true, "IB6651 debe ser válido");
  assert.equal(isValidFlightCode("AV120"), true, "AV120 debe ser válido");
  assert.equal(isValidFlightCode("INVALIDO_123"), false, "Códigos con guiones o exceso de caracteres deben ser inválidos");
});

test("TC-U02: Detección matemática de proximidad crítica en radar", () => {
  const avion1 = { x: 200, y: 300 };
  const avion2 = { x: 215, y: 320 }; // Distancia = 25px (< 50px umbral)
  const avion3 = { x: 500, y: 600 };

  assert.equal(checkRadarCollision(avion1, avion2), true, "Debe alertar colisión potencial");
  assert.equal(checkRadarCollision(avion1, avion3), false, "Aviones lejanos no deben emitir alerta");
});

test("TC-U03: Integridad y consistencia del algoritmo criptográfico SHA-256", () => {
  const hash1 = hashPassword("Admin123");
  const hash2 = hashPassword("Admin123");
  const hashDistinto = hashPassword("PasswordErroneo");

  assert.equal(hash1, hash2, "El hash debe ser determinista");
  assert.notEqual(hash1, hashDistinto, "Contraseñas distintas deben generar hashes distintos");
  assert.equal(hash1.length, 64, "El digest SHA-256 debe medir exactamente 64 caracteres hexadecimales");
});

test("TC-U04: Sanitización de entradas contra Cross-Site Scripting (XSS)", () => {
  const entradaMaliciosa = '<script>alert("xss")</script>';
  const sanitizado = escapeHtml(entradaMaliciosa);

  assert.equal(sanitizado.includes("<script>"), false, "No deben permitirse tags HTML abiertos");
  assert.equal(sanitizado, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test("TC-U05: Detección lógica de conflicto de asignación de puertas (Safety Gate)", () => {
  const vuelosActivos = [
    { codigo: "LA2045", puerta: "G02", hora: "14:00" },
    { codigo: "AV120", puerta: "G05", hora: "14:30" }
  ];

  const vueloConflictivo = { codigo: "IB6651", puerta: "G02", hora: "14:00" };
  const vueloValido = { codigo: "IB6651", puerta: "G02", hora: "16:00" };

  assert.equal(hasGateConflict(vuelosActivos, vueloConflictivo), true, "Debe detectar colisión de puerta G02 a las 14:00");
  assert.equal(hasGateConflict(vuelosActivos, vueloValido), false, "Diferente horario en misma puerta no es conflicto");
});
