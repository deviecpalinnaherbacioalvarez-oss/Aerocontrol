CREATE DATABASE IF NOT EXISTS aerocontrol_ops
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aerocontrol_ops;

CREATE TABLE IF NOT EXISTS vuelos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(12) NOT NULL UNIQUE,
  ruta VARCHAR(120) NOT NULL,
  hora VARCHAR(10) NOT NULL,
  puerta VARCHAR(20) NOT NULL,
  estado ENUM('Programado','Embarcando','En hora','Retrasado','Finalizado') NOT NULL,
  tipo ENUM('Salida','Llegada','Transito') NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS recursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(60) NOT NULL,
  codigo VARCHAR(40) NOT NULL UNIQUE,
  estado VARCHAR(40) NOT NULL,
  detalle VARCHAR(180) NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accion VARCHAR(80) NOT NULL,
  detalle TEXT NOT NULL,
  fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS habilitado TINYINT(1) NOT NULL DEFAULT 1;

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
);

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
);

INSERT INTO usuarios (nombre, apellido, dni, celular, correo, rol, area, password_hash, habilitado)
VALUES
('Admin', 'AeroControl', '12345678', '987654321', 'admin@aerocontrol.local', 'Administrador', 'Sistemas', SHA2('AeroControl1!', 256), 1),
('Carlos', 'Operador', '23456789', '987654322', 'operador@aerocontrol.local', 'Operador', 'Operaciones aeroportuarias', SHA2('AeroControl1!', 256), 1),
('Mariana', 'Supervisora', '34567890', '987654323', 'supervisor@aerocontrol.local', 'Supervisor', 'Supervision de operaciones', SHA2('AeroControl1!', 256), 1),
('Javier', 'Torre', '45678901', '987654324', 'torre@aerocontrol.local', 'Supervisor', 'Torre de control', SHA2('AeroControl1!', 256), 1),
('Rosa', 'CORPAC', '56789012', '987654325', 'gerencia@aerocontrol.local', 'Administrador', 'Gerencia CORPAC', SHA2('AeroControl1!', 256), 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  apellido = VALUES(apellido),
  celular = VALUES(celular),
  correo = VALUES(correo),
  rol = VALUES(rol),
  area = VALUES(area),
  password_hash = VALUES(password_hash),
  habilitado = VALUES(habilitado);

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
  tipo = VALUES(tipo);

INSERT INTO recursos (tipo, codigo, estado, detalle)
VALUES
('Pista', 'Pista 01', 'Disponible', 'Habilitada para llegadas y salidas'),
('Pista', 'Pista 02', 'En observacion', 'Posible restriccion meteorologica'),
('Puerta', 'A-04', 'Embarque', 'Asignada al vuelo AVA240'),
('Puerta', 'B-02', 'Retrasado', 'Asignada al vuelo AAL982'),
('Posicion', 'Posicion A4', 'Ocupada', 'Aeronave en plataforma'),
('Posicion', 'Posicion B2', 'Libre', 'Disponible para asignacion'),
('Soporte', 'Equipo GSE-01', 'Disponible', 'Equipo terrestre disponible para asistencia'),
('Soporte', 'Bus PB-02', 'Mantenimiento', 'Unidad en revision preventiva')
ON DUPLICATE KEY UPDATE
  tipo = VALUES(tipo),
  estado = VALUES(estado),
  detalle = VALUES(detalle);

INSERT INTO incidencias (codigo, tipo, prioridad, descripcion, vuelo_id)
SELECT 'INC-001', 'Operacion', 'Alta', 'Retraso por condiciones meteorologicas', id
FROM vuelos
WHERE codigo = 'AAL982'
ON DUPLICATE KEY UPDATE
  tipo = VALUES(tipo),
  prioridad = VALUES(prioridad),
  descripcion = VALUES(descripcion),
  vuelo_id = VALUES(vuelo_id);

INSERT INTO reportes (tipo, titulo, contenido, fecha_generacion, creado_por)
SELECT tipo, titulo, contenido, CURDATE(), (SELECT id FROM usuarios WHERE dni = '12345678' LIMIT 1)
FROM (
  SELECT 'Operacional' AS tipo, 'Reporte diario de vuelos' AS titulo, 'Vuelos monitoreados por turno, salidas autorizadas, llegadas confirmadas y operaciones con retraso.' AS contenido
  UNION ALL SELECT 'Incidencias operativas', 'Reporte de incidencias abiertas', 'Seguimiento de incidencias por prioridad, responsable operativo y estado de atencion.'
  UNION ALL SELECT 'Recursos aeroportuarios', 'Disponibilidad de pistas y puertas', 'Control de pistas, puertas, posiciones y soporte terrestre disponibles para operacion.'
  UNION ALL SELECT 'Puntualidad', 'Reporte de puntualidad operacional', 'Revision de demoras promedio, vuelos en hora y operaciones que requieren coordinacion con torre.'
  UNION ALL SELECT 'Auditoria del sistema', 'Reporte de acciones auditadas', 'Trazabilidad de cambios realizados por usuarios, roles y eventos registrados en bitacora.'
  UNION ALL SELECT 'Disponibilidad operacional', 'Reporte de disponibilidad del sistema', 'Indicadores de continuidad operativa, terminal, servicios criticos y base de datos.'
) AS semillas
WHERE NOT EXISTS (
  SELECT 1 FROM reportes r
  WHERE r.tipo = semillas.tipo AND r.titulo = semillas.titulo AND r.eliminado = 0
);

INSERT INTO bitacora (accion, detalle)
SELECT 'INICIALIZACION', 'Base de datos MySQL actualizada con usuarios, vuelos, recursos, incidencias, reportes y solicitudes operativas'
WHERE NOT EXISTS (SELECT 1 FROM bitacora);


-- Herramientas diferenciadas por rol: operador, supervisor, torre y gerencia.
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
);

-- Consultas de verificacion para exposicion.
SELECT ar.actor, ar.tipo, ar.detalle, ar.creado_en, u.dni, u.nombre, u.area
FROM acciones_rol ar
LEFT JOIN usuarios u ON u.id = ar.usuario_id
ORDER BY ar.id DESC
LIMIT 20;
