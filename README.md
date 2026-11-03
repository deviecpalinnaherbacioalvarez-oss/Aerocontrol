# AeroControl Ops Full Stack

Proyecto académico de Calidad y Software.

Prototipo funcional con frontend, API REST y base de datos. Incluye dos modos:

- `server.mjs`: versiÃ³n anterior con SQLite.
- `server-mysql.mjs`: versiÃ³n conectada a MySQL Workbench.

## Ejecutar con SQLite

```powershell
& "C:\Users\USUARIO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
```

Abrir `http://127.0.0.1:4173`.

## Ejecutar con MySQL Workbench

1. Abrir MySQL Workbench.
2. Ejecutar el script:

```text
database/aerocontrol_mysql.sql
```

3. En Visual Studio Code, abrir esta carpeta:

```text
C:\Users\USUARIO\OneDrive\Documentos\DISEÃ‘O Y ARQUITECTURA\aerocontrol_ops_fullstack
```

4. Instalar dependencias:

```powershell
npm install
```

5. Configurar variables de conexiÃ³n. Puedes usar PowerShell:

```powershell
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="tu_clave_mysql"
$env:DB_NAME="aerocontrol_ops"
npm run start:mysql
```

6. Abrir:

```text
http://127.0.0.1:4173
```

## Evidencias para el informe

- Frontend: tablero, vuelos, radar, recursos y reportes.
- Backend SQLite: `server.mjs`, especialmente rutas `/api/vuelos`, `/api/incidencias` y `/api/metricas`.
- Backend MySQL: `server-mysql.mjs`, especialmente la conexiÃ³n `mysql2/promise` y los endpoints REST.
- Base de datos MySQL: `database/aerocontrol_mysql.sql`, tablas `vuelos`, `incidencias`, `recursos` y `bitacora`.
## Integración actual con MySQL

La versión `server-mysql.mjs` trabaja como backend REST conectado a MySQL Workbench mediante `mysql2/promise`. Al iniciar, verifica y crea las tablas principales si no existen.

Tablas operativas integradas:

- `usuarios`: credenciales, roles, áreas y perfiles del sistema.
- `vuelos`: programación, llegadas, salidas, estado operacional y puerta asignada.
- `incidencias`: registro de eventos operativos con prioridad y vínculo opcional a vuelo.
- `recursos`: pistas, puertas, posiciones y soporte aeroportuario.
- `reportes`: reportes creados, editados y eliminados desde la interfaz. Ya no dependen solo del navegador.
- `solicitudes_operativas`: solicitudes pendientes de llegada o salida para autorización de torre/administrador.
- `bitacora`: trazabilidad de acciones importantes del sistema.

## Endpoints principales para evidencias

- `GET /api/vuelos`: lista vuelos activos desde MySQL.
- `POST /api/vuelos`: registra o autoriza un vuelo nuevo.
- `PATCH /api/vuelos/:id`: cambia estado operacional del vuelo.
- `GET /api/recursos`: lista recursos aeroportuarios.
- `PATCH /api/recursos/:id`: actualiza estado de pista, puerta o posición.
- `GET /api/reportes`: obtiene reportes guardados en MySQL.
- `POST /api/reportes`: genera un reporte desde el panel.
- `PATCH /api/reportes/:id`: edita tipo, título, fecha y contenido del reporte.
- `DELETE /api/reportes/:id`: elimina lógicamente un reporte.
- `GET /api/solicitudes`: obtiene solicitudes operativas pendientes.
- `POST /api/solicitudes`: guarda solicitud de llegada/salida pendiente.
- `PATCH /api/solicitudes/:id` y `DELETE /api/solicitudes/:id`: cierra o rechaza una solicitud.
- `GET /api/bitacora`: muestra evidencia de auditoría.

## Pruebas recomendadas para exposición

1. Iniciar sesión con DNI `12345678` y contraseña `AeroControl1!`.
2. Crear un reporte desde `Reportes`, editar tipo/título/fecha/contenido y recargar la página para demostrar persistencia.
3. Eliminar un reporte y verificar que desaparece porque queda marcado en MySQL.
4. Confirmar una llegada en `Vuelos en tiempo real`; el sistema agenda una solicitud de salida posterior.
5. Autorizar una solicitud desde el panel de vuelos y verificar que aparece como vuelo en tiempo real.
6. Cambiar el estado de un recurso operativo y confirmar que queda registrado.
7. Abrir MySQL Workbench y ejecutar consultas sobre `reportes`, `solicitudes_operativas`, `vuelos`, `recursos` y `bitacora`.
