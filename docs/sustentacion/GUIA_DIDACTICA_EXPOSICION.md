# 🎙️ Guion y Guía Didáctica de Exposición: AeroControl Ops
## Presentación de la Fase de Diagnóstico (ISO/IEC 25010:2023)

> **Consejo para el expositor:** Habla con calma, mira a tu audiencia o profesor y usa un tono seguro. Esta guía está redactada exactamente como deberías decirlo, usando analogías sencillas para que todos en el aula entiendan la importancia de cada punto técnico.

---

### 🛬 SLIDE 1: Portada (Tiempo sugerido: 45 segundos)
* **Qué estás mostrando:** La carátula con el título del proyecto y el estándar ISO/IEC 25010:2023.
* **Lo que debes decir (Guion):**
  > *"Buenas tardes profesor y compañeros. Hoy les presentamos la Fase de Diagnóstico de Calidad de Software para nuestro proyecto **AeroControl Ops**, que es una plataforma de gestión de operaciones aeroportuarias en tiempo real.*
  >
  > *Para evaluar este sistema no nos basamos en opiniones subjetivas de 'si se ve bonito o no', sino que aplicamos rigurosamente el estándar internacional **ISO/IEC 25010 (versión 2023)**, identificando con métricas cuantitativas la salud técnica de nuestro código."*

---

### ⚠️ SLIDE 2: Contexto Operacional y Justificación (Tiempo sugerido: 1 minuto)
* **Qué estás mostrando:** Las 3 características elegidas: **Seguridad**, **Fiabilidad** y **Protección (Safety)**.
* **Analogía didáctica para explicarlo:**
  > *"¿Por qué elegimos estas 3 y no otras? Imaginemos la diferencia entre una tienda de ropa online y un aeropuerto. Si una tienda online falla 5 minutos, alguien compra una camiseta más tarde. Pero si el software de un aeropuerto falla 5 minutos, dos aviones pueden intentar aterrizar en la misma pista al mismo tiempo.*
  >
  > *Por eso, priorizamos tres pilares de misión crítica:*
  > 1. *🔒 **Seguridad:** Porque nadie ajeno a la torre debe poder alterar un plan de vuelo.*
  > 2. *🛡️ **Fiabilidad:** Porque el aeropuerto no duerme: opera 24/7 y el sistema no puede perder datos si hay un corte de energía.*
  > 3. *⚠️ **Protección (Safety):** Porque el software debe prevenir activamente accidentes físicos y catástrofes operacionales."*

---

### 🔒 SLIDE 3: Área 1 — Seguridad (Tiempo sugerido: 1.5 minutos)
* **Qué estás mostrando:** La tabla con las 6 subcaracterísticas de seguridad.
* **Cómo explicarlo de forma didáctica:**
  > *"En Seguridad evaluamos cómo blindamos el sistema contra ataques:*
  >
  > *🟢 **Lo que tenemos impecable:**
  > * **Integridad Total:** Tenemos **100% de protección contra Inyección SQL**. Usamos 'Prepared Statements' con signos de interrogación en todas las consultas. Ningún atacante puede hackear la base de datos escribiendo código malicioso en el login.*
  > * **Confidencialidad:** Las cookies de sesión tienen candado `HttpOnly`, lo que impide que virus en JavaScript roben las credenciales.*
  >
  > *🟡 **La oportunidad de mejora (Diagnóstico honesto):**
  > * Descubrimos que las contraseñas se guardan con `SHA-256` plano. Para un sistema aeroportuario moderno, esto es como tener una cerradura estándar: funciona, pero con computadoras potentes se puede forzar. Nuestra mejora prioritaria es migrar a `bcrypt` con salting aleatorio y limitar los intentos de login a 5 para evitar ataques de fuerza bruta."*

---

### 🛡️ SLIDE 4: Área 2 — Fiabilidad (Tiempo sugerido: 1.5 minutos)
* **Qué estás mostrando:** La tabla de Fiabilidad (Madurez, Disponibilidad, Tolerancia y Recuperabilidad).
* **Cómo explicarlo de forma didáctica:**
  > *"En Fiabilidad evaluamos qué tan resistente es el software cuando ocurren imprevistos:*
  >
  > *🟢 **Lo que tenemos impecable:**
  > * **Madurez en manejo de errores:** El 100% de las rutas en el backend están envueltas en bloques `try/catch`. Si una consulta falla, el servidor **no se apaga ni colapsa**, sino que responde un mensaje de error estructurado.*
  > * **Tolerancia:** Si la base de datos tarda en responder, la interfaz usa datos de contingencia para que el operador no vea la pantalla en blanco.*
  >
  > *🟡 **La oportunidad de mejora:**
  > * **El riesgo de la memoria RAM:** Actualmente las sesiones de los usuarios activos se guardan en la memoria RAM del servidor. Si reiniciamos el servidor para una actualización, todos los controladores aéreos tendrían que volver a escribir su contraseña. La solución que planteamos es guardar las sesiones en MySQL o Redis para que sobrevivan a cualquier reinicio."*

---

### ⚠️ SLIDE 5: Área 3 — Protección / Safety (Tiempo sugerido: 1.5 minutos)
* **Qué estás mostrando:** La tabla de Safety (Conflictos de puerta, meteorología, semáforos y advertencias).
* **Cómo explicarlo de forma didáctica:**
  > *"Esta es la característica más fascinante de nuestro proyecto, porque evalúa cómo el software ayuda a los humanos a evitar accidentes:*
  >
  > *🟢 **Lo que tenemos impecable:**
  > * **Detector de conflictos en tiempo real:** Desarrollamos un algoritmo inteligente (`towerConflictState`) que vigila si a dos vuelos se les asigna la misma puerta de embarque a la misma hora, disparando una alarma roja de inmediato.*
  > * **Advertencia meteorológica:** El radar penaliza automáticamente la velocidad de aproximación si hay lluvia o niebla densa.*
  >
  > *🟡 **La oportunidad de mejora:**
  > * **Blindaje en el servidor:** Si una pista se marca como 'Cerrada por mantenimiento', la pantalla oculta los botones, pero descubrimos que en el backend no existía la regla que bloquee la petición si alguien la envía directo por API. Debemos colocar esa regla en el servidor antes de ir a producción."*

---

### 📊 SLIDE 6: Balance Consolidado (Tiempo sugerido: 1 minuto)
* **Qué estás mostrando:** El gráfico con los porcentajes (46.7% Cumple, 53.3% Parcial, 0% Crítico).
* **Cómo explicarlo de forma didáctica:**
  > *"Este es el resumen cuantitativo de nuestra auditoría sobre 15 atributos de calidad:*
  >
  > * *🟢 **46.7% (7 atributos) cumplen totalmente:** El núcleo de seguridad, detección de riesgos en radar e integridad de datos están 100% operativos.*
  > * *🟡 **53.3% (8 atributos) cumplen parcialmente:** Tenemos identificadas con precisión matemática las líneas de código exactas a optimizar.*
  > * *🔴 **0% de fallas críticas:** No existe ningún error que invalide la lógica central del negocio.*
  >
  > *Esto demuestra que un buen diagnóstico no busca decir 'todo está perfecto', sino encontrar con exactitud dónde invertir el tiempo de desarrollo."*

---

### 🚀 SLIDE 7: Top 5 Mejoras de Ingeniería (Tiempo sugerido: 1.5 minutos)
* **Qué estás mostrando:** Las 5 tarjetas de acción priorizadas.
* **Cómo explicarlo de forma didáctica:**
  > *"Si tuviéramos que pasar este software a un entorno de producción real, este es nuestro plan de ingeniería en 5 pasos:*
  > 1. *🔑 **Seguridad:** Migrar contraseñas a `bcrypt` y agregar límite de 5 intentos en login.*
  > 2. *🧪 **Calidad:** Crear una batería de pruebas unitarias automáticas con `npm test`.*
  > 3. *🧱 **Escalabilidad:** Persistir las sesiones en base de datos para soportar múltiples servidores.*
  > 4. *🚧 **Safety:** Validar en el backend que nadie pueda autorizar vuelos hacia pistas cerradas.*
  > 5. *🧩 **Arquitectura Limpia:** Modularizar el archivo HTML principal de 4,300 líneas separándolo en componentes limpios de CSS y JavaScript."*

---

### 🎓 SLIDE 8: Conclusiones y Cierre (Tiempo sugerido: 45 segundos)
* **Qué estás mostrando:** Los 3 pilares de defensa y la invitación a la demo en vivo.
* **Cómo explicarlo de forma didáctica:**
  > *"En conclusión:*
  > * *Nuestro sistema garantiza la confidencialidad e integridad de las operaciones aeroportuarias.*
  > * *La norma ISO/IEC 25010 nos permitió medir con objetividad la madurez del software.*
  > * *Tenemos un sistema funcional, seguro y listo para ser demostrado en vivo en nuestro servidor local.*
  >
  > *Muchas gracias. Quedamos atentos a sus preguntas y los invitamos a ver la demostración en vivo de AeroControl Ops."*

---

## 💡 3 Respuestas de Oro ante Preguntas del Profesor

1. **Si el profesor pregunta:** *"¿Por qué tienen tantos semáforos amarillos (Cumple parcialmente)?"*
   * **Tu respuesta ganadora:** *"Porque realizamos una auditoría de estándar industrial y no una autoevaluación complaciente. En software de misión crítica como la aviación, que una función opere en la pantalla no basta: debe estar blindada con pruebas automáticas, persistencia tolerante a fallos y validación estricta en el servidor."*

2. **Si el profesor pregunta:** *"¿Cuál es la diferencia entre Seguridad y Protección (Safety)?"*
   * **Tu respuesta ganadora:** *"La Seguridad protege al sistema contra personas maliciosas (hackers, inyecciones SQL, robo de sesiones). La Protección (Safety) protege a las personas contra errores operacionales y fallos físicos del entorno (evitar colisiones de aviones en puertas o aterrizajes en pistas clausuradas)."*

3. **Si el profesor pregunta:** *"¿Cómo probaron la tolerancia a fallos?"*
   * **Tu respuesta ganadora:** *"Verificamos que si la base de datos se desconecta, el pool de mysql2/promise intenta reconectarse automáticamente gracias al parámetro waitForConnections, y en el cliente la interfaz recurre a datos estáticos de contingencia sin congelar el navegador."*
