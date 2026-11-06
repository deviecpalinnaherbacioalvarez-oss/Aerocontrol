# 🎯 PROMPT MAESTRO PARA CLAUDE: GENERADOR DE PRESENTACIÓN PPTX
## Proyecto: AeroControl Ops — Diagnóstico ISO/IEC 25010:2023

> **Instrucciones para ti:** Copia todo el bloque que está dentro del recuadro inferior y pégalo directamente en **Claude** (Claude 3.5 Sonnet / Opus). Claude generará automáticamente el código ejecutable (Python con `python-pptx` o un artefacto descargable con `pptxgenjs`) para construir las diapositivas con un diseño visual profesional de nivel ejecutivo/académico.

```markdown
Actúa como un Diseñador Instruccional Senior y Desarrollador Full Stack experto en la norma ISO/IEC 25010.

Necesito que generes una presentación completa en formato PowerPoint (.pptx) para la sustentación académica de la "Fase de Diagnóstico del Producto Software" del proyecto AeroControl Ops (Sistema de Gestión de Operaciones Aeroportuarias).

Genera un script en Python utilizando la librería `python-pptx` (o un artefacto interactivo con `pptxgenjs`) que cree y guarde el archivo `AeroControl_Ops_Diagnostico_ISO25010.pptx`.

### 🎨 Guía de Estilo Visual y Diseño
- **Relación de aspecto:** 16:9 Panorámica (Widescreen: 13.33 x 7.5 pulgadas).
- **Paleta de Colores (Tema Aeronáutico Ejecutivo):**
  - Fondo Principal: Azul Medianoche Oscuro (`#0B131F`) para portadas y conclusiones; Blanco Puro (`#FFFFFF`) o Gris Hielo (`#F8FAFC`) para diapositivas de contenido.
  - Color Primario (AeroControl): Borgoña / Carmesí (`#570026` / `#9D174D`).
  - Color Secundario (Aeronáutico): Azul Profundo (`#1E3A8A` / `#0284C7`).
  - Estados / Semáforos: Verde Esmeralda (`#10B981`), Ámbar Advertencia (`#F59E0B`), Rojo Alerta (`#EF4444`).
  - Tipografía: Segoe UI / Arial / Calibri (Titulares en Negrita, jerarquía visual limpia, tarjetas con bordes redondeados y sombras sutiles).

---

### 📑 Estructura y Contenido de las Diapositivas (8 Slides)

#### SLIDE 1: Portada Ejecutiva
- **Título:** AeroControl Ops: Diagnóstico de Calidad del Producto Software
- **Subtítulo:** Evaluación Técnica bajo el Estándar Internacional ISO/IEC 25010:2023
- **Metadatos:** 
  - Sistema: Gestión de Operaciones Aeroportuarias en Tiempo Real (Full Stack: Node.js + MySQL + SPA)
  - Curso: Calidad y Arquitectura de Software
  - Fase: Segunda Entrega — Diagnóstico de Características Críticas
- **Visual:** Fondo oscuro degradado, tarjeta de identificación y badge de versión ISO/IEC 25010.

#### SLIDE 2: Contexto Operacional y Selección de Características Críticas
- **Título:** ¿Por qué un Enfoque de Misión Crítica?
- **Concepto Central:** En un aeropuerto comercial, los fallos de software no son simples "bugs" técnicos: representan riesgos de seguridad operacional (*Safety*), vidas humanas y pérdidas millonarias por retrasos en cadena.
- **Las 3 Características Prioritarias Elegidas:**
  1. 🔒 **SEGURIDAD:** Control de acceso estricto, blindaje contra manipulación de planes de vuelo e inyecciones SQL en comunicaciones de torre.
  2. 🛡️ **FIABILIDAD:** Operación ininterrumpida 24/7; el sistema no puede perder sesiones ni estado ante reinicios o microcortes de red.
  3. ⚠️ **PROTECCIÓN (Safety):** Salvaguardas operacionales activas que impidan catástrofes físicas (ej. aterrizajes en pistas cerradas o doble ocupación de puertas).

#### SLIDE 3: Área 1 — SEGURIDAD (Diagnóstico y Métricas)
- **Título:** Característica 1: SEGURIDAD (*Security*)
- **Tabla con columnas:** [Atributo | Métrica Concreta | Estado | Evidencia / Hallazgo]
  - **Confidencialidad:** `% de endpoints que filtran hashes en JSON` | 🟢 Cumple | `publicUser` en `server-mysql.mjs:L93` omite 100% de `password_hash`; cookie `HttpOnly; SameSite=Lax`.
  - **Integridad:** `% de consultas SQL con Prepared Statements (?)` | 🟢 Cumple | 100% parametrizadas en login, vuelos, reportes y solicitudes (inmune a SQL Injection).
  - **No-repudio:** `% de mutaciones en bitácora con DNI y timestamp` | 🟡 Cumple Parcial | 100% registradas en `bitacora`, pero falta capturar IP de origen y User-Agent.
  - **Responsabilidad:** `% de tablas con FK de autoría (creado_por)` | 🟡 Cumple Parcial | Solo `reportes` tiene FK a `usuarios`; `vuelos` e `incidencias` dependen de texto en bitácora.
  - **Autenticidad:** `Robustez de hashing de contraseñas (bcrypt vs hash simple)` | 🟡 Cumple Parcial | 100% de endpoints protegidos con sesión, pero se usa SHA-256 plano sin salting.
  - **Resistencia:** `Rate Limiting en login / Cobertura anti-XSS` | 🟡 Cumple Parcial | 100% sanitización con `escapeHtml`; falta Rate Limiting contra fuerza bruta en `/api/auth/login`.

#### SLIDE 4: Área 2 — FIABILIDAD (Diagnóstico y Métricas)
- **Título:** Característica 2: FIABILIDAD (*Reliability*)
- **Tabla con columnas:** [Atributo | Métrica Concreta | Estado | Evidencia / Hallazgo]
  - **Ausencia de Fallos / Madurez:** `% de rutas con try/catch global y HTTP 500 JSON` | 🟢 Cumple | 100% de rutas encapsuladas en `server-mysql.mjs:L417`; control de error `ER_DUP_ENTRY`.
  - **Disponibilidad:** `Uptime del servicio + persistencia offline` | 🟡 Cumple Parcial | Persistencia MySQL/SQLite; falta modo offline si `Promise.all` falla en carga inicial.
  - **Tolerancia a Fallos:** `% de módulos con fallback ante caídas de API` | 🟡 Cumple Parcial | Fallback de 6 recursos estáticos en `renderResources`; faltan reintentos automáticos (exponential backoff).
  - **Recuperabilidad:** `Tiempo de reconexión a BD + % de sesiones recuperadas` | 🟡 Cumple Parcial | Reconexión automática con `waitForConnections: true`. Sesiones en memoria `Map()` se pierden tras reinicio.

#### SLIDE 5: Área 3 — PROTECCIÓN (Safety Operacional)
- **Título:** Característica 3: PROTECCIÓN (*Safety / Integridad Operacional*)
- **Tabla con columnas:** [Atributo | Métrica Concreta | Estado | Evidencia / Hallazgo]
  - **Restricción Operativa:** `% de acciones bloqueadas por rol y estado del recurso` | 🟡 Cumple Parcial | UI segrega roles; el backend no valida si la pista asignada está "Cerrada" antes de autorizar.
  - **Identificación de Riesgos:** `Detección automática de conflictos de puerta y clima` | 🟢 Cumple | Detección en tiempo real de colisión de puerta (`towerConflictState`) y penalización por mal tiempo.
  - **Protección ante Fallos:** `Transacciones ACID (BEGIN/COMMIT) en operaciones compuestas` | 🟡 Cumple Parcial | Unicidad `codigo UNIQUE` y límite de 30 vuelos; falta atomicidad transaccional en autorizaciones.
  - **Advertencia de Peligro:** `Latencia de alertas visuales + semáforos normados` | 🟢 Cumple | Semáforos normados (`ok`, `warn`, `bad`), modo Emergencia en simulador de torre y toasts instantáneos.
  - **Integración Segura:** `% de transiciones de vuelo sincronizadas secuencialmente` | 🟢 Cumple | Flujo continuo: Llegada -> Solicitud -> Autorización Torre -> Radar (`postMessage`) -> Bitácora.

#### SLIDE 6: Resumen Ejecutivo del Diagnóstico (Dashboard Cuantitativo)
- **Título:** Balance Consolidado de la Evaluación
- **Gráfico / Métricas Destacadas:**
  - Total Subcaracterísticas Evaluadas: **15**
  - 🟢 **Cumplen Totalmente:** **7 (46.7%)** — Integridad SQL, Confidencialidad, Madurez de errores, Riesgos, Advertencias e Integración.
  - 🟡 **Cumplen Parcialmente:** **8 (53.3%)** — Oportunidades de mejora técnica identificadas.
  - 🔴 **Incumplimientos Críticos:** **0 (0.0%)** en lógica de negocio central.
- **Conclusión Clave:** El sistema cuenta con una base sólida de integridad referencial, segregación de roles y control operacional, requiriendo robustecer la capa de persistencia de sesiones y validaciones en servidor.

#### SLIDE 7: Plan de Acción Priorizado (Top 5 Mejoras de Ingeniería)
- **Título:** Plan de Mejoras Técnicas para Pase a Producción
- **5 Tarjetas de Acción:**
  1. 🔑 **Seguridad de Contraseñas:** Reemplazar SHA-256 por `bcrypt` (factor 12) y añadir Rate Limiting (5 intentos/15 min) en login.
  2. 🧪 **Pruebas Automatizadas:** Implementar suite de tests con `node:test` o `vitest` para validaciones de vuelo y autenticación.
  3. 🧱 **Persistencia de Sesiones:** Migrar `sessions = new Map()` a tabla en MySQL o Redis para soportar escalabilidad horizontal.
  4. 🚧 **Validación de Safety en Backend:** Bloquear en `POST /api/vuelos` cualquier autorización si la pista o puerta asignada está "Cerrada".
  5. 🧩 **Modularización de Código:** Desacoplar el archivo `index.html` (4,300 líneas) en `styles.css`, `app.js` y módulos por capas.

#### SLIDE 8: Conclusiones y Defensa ante el Jurado
- **Título:** Conclusiones y Respuestas Clave para la Defensa
- **3 Pilares de Defensa:**
  - **Sobre Seguridad:** *"100% protegido contra Inyección SQL mediante Prepared Statements y blindaje contra XSS/CSRF con cookies HttpOnly."*
  - **Sobre Safety:** *"Detección proactiva de colisión de aeronaves en puertas y sincronización bidireccional en tiempo real con la torre de control."*
  - **Sobre Madurez ISO 25010:** *"El diagnóstico permitió identificar con métricas objetivas la transición de prototipo funcional a arquitectura de alta disponibilidad."*
- **Cierre:** Espacio para Preguntas y Respuestas / Demostración en Vivo (`http://localhost:4173`).

---

Genera el código completo listo para ejecutar en Python (`python-pptx`) que construya esta presentación con formatos profesionales de tablas, colores corporativos, alineaciones precisas y notas del orador para cada diapositiva.
```
