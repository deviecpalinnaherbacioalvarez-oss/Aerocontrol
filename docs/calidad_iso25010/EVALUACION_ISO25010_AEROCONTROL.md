# ✈️ Evaluación de Calidad de Software: AeroControl Ops
## Modelo de Calidad del Producto de Software ISO/IEC 25010 (Edición 2023)

---

## 📌 1. Información General del Proyecto

* **Nombre del Sistema:** AeroControl Ops — Plataforma de Gestión de Operaciones Aeroportuarias
* **Arquitectura:** Full Stack (Frontend SPA en HTML5/CSS3/Vanilla JS + Backend REST en Node.js nativo + Base de Datos Relacional MySQL y SQLite)
* **Objetivo de la Evaluación:** Diagnóstico técnico integral del estado actual del software bajo el estándar internacional **ISO/IEC 25010:2023** para preparación de entrega y sustentación académica.

---

## 📊 2. Matriz General de Calidad ISO/IEC 25010

| # | Característica | Subcaracterística | Semáforo | Dictamen | Nivel de Riesgo |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | **Adecuación Funcional** | 1.1 Completitud funcional | 🟢 | **Se cumple** | Bajo |
| | | 1.2 Corrección funcional | 🟡 | **Se cumple parcialmente** | Medio |
| | | 1.3 Pertinencia funcional | 🟢 | **Se cumple** | Bajo |
| **2** | **Eficiencia de Desempeño** | 2.1 Comportamiento temporal | 🟡 | **Se cumple parcialmente** | Medio |
| | | 2.2 Utilización de recursos | 🟡 | **Se cumple parcialmente** | Bajo |
| | | 2.3 Capacidad | 🟡 | **Se cumple parcialmente** | Alto |
| **3** | **Compatibilidad** | 3.1 Coexistencia | 🟢 | **Se cumple** | Bajo |
| | | 3.2 Interoperabilidad | 🟡 | **Se cumple parcialmente** | Medio |
| **4** | **Capacidad de Interacción** | 4.1 Reconocibilidad de adecuación | 🟢 | **Se cumple** | Bajo |
| | | 4.2 Aprendizabilidad | 🟢 | **Se cumple** | Bajo |
| | | 4.3 Operabilidad | 🟢 | **Se cumple** | Bajo |
| | | 4.4 Protección contra errores de usuario | 🟡 | **Se cumple parcialmente** | Medio |
| | | 4.5 Involucración del usuario | 🟢 | **Se cumple** | Bajo |
| | | 4.6 Inclusividad / Accesibilidad | 🟡 | **Se cumple parcialmente** | Medio |
| | | 4.7 Asistencia al usuario | 🟢 | **Se cumple** | Bajo |
| | | 4.8 Auto-descriptividad | 🟢 | **Se cumple** | Bajo |
| **5** | **Fiabilidad** | 5.1 Ausencia de fallos / Madurez | 🟢 | **Se cumple** | Bajo |
| | | 5.2 Disponibilidad | 🟡 | **Se cumple parcialmente** | Medio |
| | | 5.3 Tolerancia a fallos | 🟡 | **Se cumple parcialmente** | Medio |
| | | 5.4 Recuperabilidad | 🟡 | **Se cumple parcialmente** | Alto |
| **6** | **Seguridad** | 6.1 Confidencialidad | 🟢 | **Se cumple** | Bajo |
| | | 6.2 Integridad | 🟢 | **Se cumple** | Bajo |
| | | 6.3 No-repudio | 🟡 | **Se cumple parcialmente** | Medio |
| | | 6.4 Responsabilidad (*Accountability*) | 🟡 | **Se cumple parcialmente** | Medio |
| | | 6.5 Autenticidad | 🟡 | **Se cumple parcialmente** | Alto |
| | | 6.6 Resistencia ante ataques | 🟡 | **Se cumple parcialmente** | Alto |
| **7** | **Mantenibilidad** | 7.1 Modularidad | 🟡 | **Se cumple parcialmente** | Alto |
| | | 7.2 Reusabilidad | 🟡 | **Se cumple parcialmente** | Medio |
| | | 7.3 Analizabilidad | 🟡 | **Se cumple parcialmente** | Medio |
| | | 7.4 Modificabilidad | 🟡 | **Se cumple parcialmente** | Medio |
| | | 7.5 Testabilidad / Capacidad de prueba | 🔴 | **No se cumple** | Crítico |
| **8** | **Flexibilidad** | 8.1 Adaptabilidad | 🟢 | **Se cumple** | Bajo |
| | | 8.2 Escalabilidad | 🔴 | **No se cumple** | Alto |
| | | 8.3 Instalabilidad | 🟢 | **Se cumple** | Bajo |
| | | 8.4 Reemplazabilidad | 🟡 | **Se cumple parcialmente** | Medio |
| **9** | **Protección (*Safety*)** | 9.1 Restricción operativa | 🟡 | **Se cumple parcialmente** | Alto |
| | | 9.2 Identificación de riesgos | 🟢 | **Se cumple** | Bajo |
| | | 9.3 Protección ante fallos operacionales | 🟡 | **Se cumple parcialmente** | Medio |
| | | 9.4 Advertencia de peligro | 🟢 | **Se cumple** | Bajo |
| | | 9.5 Integración segura | 🟢 | **Se cumple** | Bajo |

---

## 🔍 3. Explicación Didáctica y Evaluación Técnica por Característica

---

### 1. ADECUACIÓN FUNCIONAL (*Functional Suitability*)
> **¿Qué evalúa?** Que el sistema haga todo lo que un centro de operaciones aeroportuarias necesita y lo haga sin errores de cálculo ni contradicciones lógicas.

* **1.1 Completitud funcional (🟢 Se cumple):**
  * *Lo que está bien:* El sistema implementa la totalidad de los módulos requeridos: gestión de vuelos (llegadas/salidas/tránsitos), asignación de puertas, incidencias por prioridad, radar de tráfico, reportes CRUD en MySQL y flujo de solicitudes entre torre y rampa. Cubre 5 perfiles con permisos independientes (`Operador`, `Supervisor`, `Administrador`, `Torre de control`, `Gerencia CORPAC`).
  * *Evidencia en código:* `public/index.html` (L2290-2310, L2767-2785), `server-mysql.mjs` (L584-635, L637-667), `database/aerocontrol_mysql.sql` (tablas `vuelos`, `incidencias`, `recursos`, `reportes`, `solicitudes_operativas`).
* **1.2 Corrección funcional (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Validaciones en servidor para formatos de DNI, teléfono y código de vuelo; cálculo temporal dinámico en `flightTimes`.
  * *Problema / Debilidad:* **Inconsistencia de estados en BD:** En la interfaz web (`index.html:L4160`), un vuelo puede transicionar a `'En vuelo'`. Sin embargo, en MySQL (`aerocontrol_mysql.sql:L13`) la columna solo admite `ENUM('Programado','Embarcando','En hora','Retrasado','Finalizado')`. Esto arrojará error de truncamiento si MySQL opera en modo estricto. La hora se guarda como `VARCHAR(10)` en lugar de tipo `TIME`/`DATETIME`.
* **1.3 Pertinencia funcional (🟢 Se cumple):**
  * *Lo que está bien:* Las herramientas corresponden fielmente a los procedimientos aeroportuarios reales (slots de puerta, contingencia meteorológica, checklist de rampa y fraseología OACI).

---

### 2. EFICIENCIA DE DESEMPEÑO (*Performance Efficiency*)
> **¿Qué evalúa?** Que el sistema responda en milisegundos y no consuma memoria excesiva a medida que la cantidad de vuelos crece.

* **2.1 Comportamiento temporal (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Servidor en Node.js nativo sin capas pesadas ni ORM lento, logrando respuestas sub-milisegundo. Temporizador `liveOpsTimer` con intervalo dinámico de 5 a 20 min y protección de solapamiento `liveOpsBusy`.
  * *Problema / Debilidad:* Toda la sincronización se basa en consultas HTTP en bloque (`loadData()` dispara 7 peticiones `fetch` en paralelo vía `Promise.all` en `index.html:L3996-4004`). La interfaz reconstruye grandes bloques de texto HTML en `innerHTML`, provocando recálculos completos de diseño (*reflows*) en el navegador.
* **2.2 Utilización de recursos (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Pool de conexiones MySQL reutilizable con límite de 10 conexiones simultáneas (`connectionLimit: 10`).
  * *Problema / Debilidad:* Los archivos estáticos se leen de disco en cada solicitud sin compresión (`gzip`/`brotli`) ni cabeceras de caché (`Cache-Control: max-age` / `ETag`).
* **2.3 Capacidad (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Protección contra sobrecarga de memoria limitando las peticiones JSON entrantes a un máximo de 1 MB (`readJson` en `server-mysql.mjs:L107-114`).
  * *Problema / Debilidad:* **Falta de paginación en consultas:** Rutas como `GET /api/vuelos`, `GET /api/incidencias` y `GET /api/reportes` ejecutan `SELECT *` sin cláusulas `LIMIT / OFFSET`. Con miles de registros históricos, saturará la memoria del servidor y del navegador.

---

### 3. COMPATIBILIDAD (*Compatibility*)
> **¿Qué evalúa?** Que el sistema pueda ejecutarse en cualquier entorno sin colisionar con otros servicios y sea capaz de intercambiar datos fácilmente.

* **3.1 Coexistencia (🟢 Se cumple):**
  * *Lo que está bien:* Puerto y credenciales de base de datos totalmente parametrizables por variables de entorno (`.env` / `process.env`). Escucha en `127.0.0.1` de forma aislada con una sola dependencia de producción (`mysql2`).
* **3.2 Interoperabilidad (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* API REST basada en JSON estándar con cabecera explícita `Content-Type: application/json; charset=utf-8`; sincronización entre el panel y el radar mediante el protocolo estándar `window.postMessage`.
  * *Problema / Debilidad:* El servidor no incluye cabeceras **CORS** (`Access-Control-Allow-Origin`), impidiendo que otras aplicaciones consuman la API. No genera descargas físicas en formato `.csv`, `.xlsx` o `.pdf`.

---

### 4. CAPACIDAD DE INTERACCIÓN / USABILIDAD (*Usability*)
> **¿Qué evalúa?** Que la pantalla sea clara, intuitiva, rápida de aprender y prevenga equivocaciones del operador.

* **4.1 Reconocibilidad de adecuación (🟢 Se cumple):** Títulos, subtítulos contextuales automáticos, tarjetas KPI con iconos descriptivos y semáforos de color (`ok`, `warn`, `bad`, `neutral`).
* **4.2 Aprendizabilidad (🟢 Se cumple):** Credenciales demo explicadas en el login (`index.html:L2164`) y formulario asistido de vuelos que sugiere códigos y puertas desocupadas automáticamente.
* **4.3 Operabilidad (🟢 Se cumple):** Buscador reactivo instantáneo en la tabla de vuelos y en el radar (`radarSearch`), atajos entre vistas y controles de velocidad/clima en el simulador.
* **4.4 Protección contra errores de usuario (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Validación estricta en formularios (DNI 8 dígitos, teléfono 9 dígitos, campos readonly) y sanitización `escapeHtml`.
  * *Problema / Debilidad:* Botones destructivos como "Eliminar reporte" (`deleteReport`) o "Rechazar solicitud" (`rejectIncomingFlight`) ejecutan la eliminación **sin solicitar confirmación previa** mediante diálogo modal.
* **4.5 Involucración del usuario (🟢 Se cumple):** Radar animado sobre Canvas 2D, barrido visual de antena, vehículos terrestres y modal de telemetría estilo FlightRadar.
* **4.6 Inclusividad / Accesibilidad (🟡 Se cumple parcialmente):** Diseño responsive mediante Media Queries, pero los aviones del Canvas no son navegables por teclado (`Tab`/flechas) y falta selector de alto contraste.
* **4.7 Asistencia al usuario (🟢 Se cumple):** Notificaciones flotantes Toast ante cada acción, plantillas de comunicaciones torre-piloto y botón de plan de contingencia meteorológica.
* **4.8 Auto-descriptividad (🟢 Se cumple):** Reloj 24h local/UTC en vivo, estado del sistema visible (`Sistema activo`), chips de pista activa y leyenda de colores.

---

### 5. FIABILIDAD (*Reliability*)
> **¿Qué evalúa?** Que el sistema no sufra caídas inesperadas, maneje errores de forma elegante y se recupere tras fallas.

* **5.1 Ausencia de fallos / Madurez (🟢 Se cumple):** Bloque `try/catch` global en el despachador de peticiones del servidor (`server-mysql.mjs:L417-924`); captura de errores de clave duplicada (`ER_DUP_ENTRY`); integridad referencial con claves foráneas.
* **5.2 Disponibilidad (🟡 Se cumple parcialmente):** Persistencia en MySQL y opción alternativa en SQLite embebido (`server.mjs`). No obstante, si un endpoint falla durante la carga inicial, `Promise.all` detiene la carga completa sin ofrecer modo offline.
* **5.3 Tolerancia a fallos (🟡 Se cumple parcialmente):** Degradación elegante con datos estáticos de contingencia en recursos (`renderResources`); falta implementar reintentos automáticos (*exponential backoff*) ante microcortes de red.
* **5.4 Recuperabilidad (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Reconexión automática a MySQL gracias a `waitForConnections: true` y restauración de sesión al recargar la página con `GET /api/auth/me`.
  * *Problema / Debilidad:* **Sesiones volátiles en memoria:** `sessions = new Map()` (`server-mysql.mjs:L11`). Si el proceso Node.js se reinicia, **todas las sesiones activas se pierden de inmediato**, obligando a reingresar credenciales a todos los operadores.

---

### 6. SEGURIDAD (*Security*)
> **¿Qué evalúa?** Que las contraseñas no puedan ser descifradas, los datos no sean manipulados y exista registro de quién hizo qué.

* **6.1 Confidencialidad (🟢 Se cumple):** Cookies de sesión configuradas con directivas `HttpOnly; SameSite=Lax`; exclusión estricta de los hashes de contraseñas en todas las respuestas JSON mediante `publicUser`.
* **6.2 Integridad (🟢 Se cumple):** **100% protegido contra Inyección SQL:** Todas las consultas parametrizadas con Prepared Statements (`?`) en login, vuelos, reportes, usuarios e incidencias.
* **6.3 No-repudio (🟡 Se cumple parcialmente):** Cada creación o cambio de estado registra un asiento en la tabla `bitacora` con el DNI del usuario autenticado y marca de tiempo. Sin embargo, no se guarda la IP de origen ni el `User-Agent`.
* **6.4 Responsabilidad / Accountability (🟡 Se cumple parcialmente):** La tabla `reportes` tiene la columna `creado_por` con clave foránea a `usuarios(id)`, pero las tablas `vuelos` e `incidencias` no tienen campos `creado_por_id` ni `modificado_por_id`.
* **6.5 Autenticidad (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* Verificación de credenciales en login y validación de sesión (`sessionUser`) con retorno de `401 Unauthorized` / `403 Forbidden` en rutas protegidas.
  * *Problema / Debilidad:* **Hashing inseguro de contraseñas:** Se utiliza `SHA-256` plano sin salting (`createHash("sha256")`). Es vulnerable a ataques de fuerza bruta y tablas arcoíris (*rainbow tables*). Debe migrarse a `bcrypt` o `argon2`.
* **6.6 Resistencia ante ataques (🟡 Se cumple parcialmente):** Sanitización contra XSS con `escapeHtml`. Sin embargo, no existe límite de tasa (*Rate Limiting*) en `/api/auth/login` contra ataques de fuerza bruta automatizados.

---

### 7. MANTENIBILIDAD (*Maintainability*)
> **¿Qué evalúa?** Que el código esté ordenado, modularizado, sea fácil de entender y cuente con pruebas automáticas.

* **7.1 Modularidad (🟡 Se cumple parcialmente):**
  * `public/index.html` es un monolito de **4,392 líneas** con CSS, HTML y JavaScript incrustados.
  * `server-mysql.mjs` es un archivo de **943 líneas** que mezcla conexión, DDL, semillas, rutas, autenticación y servidor de estáticos sin separación en capas (`controllers/`, `routes/`, `services/`, `models/`).
* **7.2 Reusabilidad (🟡 Se cumple parcialmente):** Funciones de validación centralizadas y generadores de filas compartidos, pero con duplicación de código utilitario entre `server.mjs` y `server-mysql.mjs`.
* **7.3 Analizabilidad (🟡 Se cumple parcialmente):** Nombres descriptivos y bitácora estructurada, pero con caracteres con codificación mixta (`"CÃ³digo"`, `"contraseÃ±a"`) y ausencia de logging estructurado con niveles (Pino/Winston).
* **7.4 Modificabilidad (🟡 Se cumple parcialmente):** Matriz de permisos centralizada en `actorPermissions`, pero añadir endpoints requiere modificar una larga cadena de `if/else` condicionales en el servidor.
* **7.5 Testabilidad / Capacidad de prueba (🔴 No se cumple):**
  * **No existe ningún script de pruebas** en `package.json` (`"test"`), ni frameworks de test instalados (Jest, Vitest, Mocha, Supertest). No hay tests unitarios ni de integración.

---

### 8. FLEXIBILIDAD (*Flexibility*)
> **¿Qué evalúa?** Que el sistema se pueda instalar rápidamente en otros entornos y soporte el crecimiento del aeropuerto.

* **8.1 Adaptabilidad (🟢 Se cumple):** Configurable por completo mediante variables de entorno en `.env`.
* **8.2 Escalabilidad (🔴 No se cumple):** Almacenar las sesiones en `new Map()` en memoria RAM impide el escalado horizontal (desplegar múltiples instancias del backend tras un balanceador de carga).
* **8.3 Instalabilidad (🟢 Se cumple):** La función `ensureDatabase()` crea la base de datos, tablas, columnas e inserta datos de prueba de forma totalmente autónoma en el primer arranque.
* **8.4 Reemplazabilidad (🟡 Se cumple parcialmente):** Existen dos servidores funcionales (MySQL y SQLite), pero las consultas SQL están escritas en SQL crudo sin capa de abstracción (ORM/Query Builder).

---

### 9. PROTECCIÓN (*Safety / Integridad Operacional*)
> **¿Qué evalúa?** Que el sistema prevenga accidentes operacionales y situaciones de riesgo en el aeropuerto.

* **9.1 Restricción operativa (🟡 Se cumple parcialmente):**
  * *Lo que está bien:* La interfaz oculta botones de autorización a operadores no cualificados.
  * *Problema / Debilidad:* El backend no valida si una pista o puerta está en estado "Cerrada" antes de permitir registrar o autorizar un vuelo. Además, `POST/PATCH /api/vuelos` no restringe roles en el servidor.
* **9.2 Identificación de riesgos (🟢 Se cumple):** Detección automática de conflictos de puerta en tiempo real (`towerConflictState`) y penalización operativa por clima adverso.
* **9.3 Protección ante fallos operacionales (🟡 Se cumple parcialmente):** Códigos únicos de vuelo, algoritmo de asignación de puertas libres y límite de capacidad (`LIVE_FLIGHT_LIMIT = 30`). Faltan transacciones ACID (`BEGIN / COMMIT`) en operaciones compuestas.
* **9.4 Advertencia de peligro (🟢 Se cumple):** Semáforos visuales de color, campana con contador de incidencias, botón de escenario de emergencia en torre y avisos Toast.
* **9.5 Integración segura (🟢 Se cumple):** Flujo ordenado y coherente: Llegada $\rightarrow$ Solicitud diferida $\rightarrow$ Autorización de Torre $\rightarrow$ Vuelo activo en radar $\rightarrow$ Bitácora auditada.

---

## 🏆 4. Top 5 Mejoras Prioritarias para la Sustentación Académica

| # | Área / Característica | Problema Técnico Detectado | Solución Recomendada para Sustentación |
| :---: | :--- | :--- | :--- |
| **1** | **Seguridad (Autenticidad)** | Contraseñas con `SHA-256` plano sin salting y sin límite de intentos en login. | Migrar a `bcrypt` (factor de costo 10-12) y agregar bloqueo tras 5 intentos fallidos en `/api/auth/login`. |
| **2** | **Mantenibilidad (Testabilidad)** | Cero pruebas automatizadas en el repositorio (`package.json` sin comando `test`). | Crear una suite básica con `node:test` o `vitest` testeando `validateFlight`, `validateUser` y el login. |
| **3** | **Mantenibilidad (Modularidad)** | Archivos monolíticos (`index.html` de 4,392 líneas y `server-mysql.mjs` de 943 líneas). | Separar estilos en `public/css/styles.css` y lógica en `public/js/app.js`; estructurar backend en `routes/` y `controllers/`. |
| **4** | **Adecuación Funcional (Integridad)** | Inconsistencia en ENUM de MySQL: `'En vuelo'` existe en frontend pero no en BD. | Actualizar el ENUM en `database/aerocontrol_mysql.sql` y `server-mysql.mjs` para incluir `'En vuelo'`. |
| **5** | **Protección (Safety Operacional)** | El servidor permite autorizar vuelos incluso si la pista asignada está "Cerrada". | Agregar validación en `POST /api/vuelos` verificando que la pista y puerta no estén en estado "Cerrada" o "Mantenimiento". |

---

## 🎓 5. Guía Rápida para Defender el Proyecto ante el Jurado

### Pregunta 1: *"¿Cómo garantiza su sistema la integridad y seguridad de los datos?"*
> **Respuesta sugerida:** *"El sistema implementa protección contra Inyección SQL mediante Prepared Statements en el 100% de las consultas a MySQL, sesiones blindadas con cookies HttpOnly y SameSite=Lax para prevenir robo por XSS y CSRF, y una bitácora de auditoría que registra cada cambio de estado con el DNI del usuario y marca de tiempo del servidor."*

### Pregunta 2: *"¿Qué modelo de calidad utilizaron y cuál fue el principal hallazgo en la evaluación?"*
> **Respuesta sugerida:** *"Evaluamos el sistema bajo el estándar ISO/IEC 25010 (edición 2023). El software destaca con cumplimiento total en Adecuación Funcional, Usabilidad, Coexistencia y Protección Operacional con detección automática de conflictos de pista/puerta. Como oportunidad de mejora para una fase de producción, identificamos la necesidad de incorporar pruebas automatizadas (Testabilidad) y migrar el hash de contraseñas a bcrypt con salting adaptativo."*

### Pregunta 3: *"¿Cómo maneja el sistema la concurrencia y la escalabilidad?"*
> **Respuesta sugerida:** *"En el estado actual, el backend utiliza un pool de conexiones con mysql2/promise dimensionado a 10 conexiones simultáneas no bloqueantes. Para escalar horizontalmente a nivel de microservicios, el siguiente paso de arquitectura es desacoplar las sesiones en memoria hacia un almacén distribuido como Redis y habilitar paginación con LIMIT/OFFSET en los endpoints de consulta histórica."*
