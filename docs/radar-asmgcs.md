# Radar de superficie

Simulador academico inspirado en vigilancia, rutas y alertas A-SMGCS.
Referencia: https://www.eurocontrol.int/service/advanced-surface-movement-guidance-and-control-system

## Alcance

- Pista 16/34, calles A y B, punto de espera A1 y cinco posiciones simuladas.
- Reserva exclusiva de pista desde la autorizacion hasta su liberacion.
- Rodaje secuenciado en el cruce compartido de plataforma, barras de parada,
  cola de solicitudes, prioridad, cierre de pista y registro de autorizaciones.
- Operacion automatica en tiempo real con hora de Lima. El usuario no puede pausar,
  reiniciar ni alterar la velocidad o las condiciones del simulador.
- Seleccion de aeronaves, busqueda, ruta resaltada, zoom y desplazamiento del mapa.
- Integrado con los vuelos activos de AeroControl. Actualiza la fuente `/api/vuelos`
  cada 15 segundos y utiliza los mismos estados operacionales del panel. No cambia
  estados en MySQL. Los contadores de pista y posiciones proceden del simulador.
- El reloj del radar sigue avanzando cuando el usuario navega por otras secciones.
  Al volver, recupera el tiempo transcurrido. Requiere mantener la pagina y el
  servidor en ejecucion; no sustituye un servicio de vigilancia disponible 24/7.
- Una lista vacia del sistema no se sustituye por vuelos de demostracion.
  Al abrir el simulador solo, sin la aplicacion contenedora, se usa un escenario demo.

El plano es esquematico, no reproduce la geometria real del aeropuerto. No recibe ADS-B,
no es un A-SMGCS certificado y no sirve para control operativo real. La separacion y
los tiempos son simplificados; el corredor de rodaje compartido admite una autorizacion
a la vez. Las llegadas pendientes permanecen en la lista, fuera del area representada.

## Archivos

- `public/torre_control_simulador.html`: estructura del panel.
- `public/surface-radar.css`: estilos adaptables.
- `public/surface-radar.js`: mapa, movimiento automatico e integracion con la pagina.
- `public/surface-engine.js`: estados XState, reservas y movimientos.
- `public/vendor/`: dependencias locales y licencias; no requiere CDN.

## Ejecucion con una base existente

PowerShell, desde la carpeta del proyecto:

```powershell
$env:SKIP_DATABASE_INIT = "1"
pnpm run start:mysql
```

Esta opcion omite la inicializacion y los datos de demostracion del servidor.
Requiere que la base ya exista. No sustituye las variables de conexion DB_*.
La aplicacion esta en http://127.0.0.1:4173/ y el escenario independiente en
http://127.0.0.1:4173/torre_control_simulador.html.

## Verificacion

```powershell
node --test tests/surface-engine.test.mjs
node tests/surface-browser.mjs
```

La prueba de navegador requiere Playwright y Chrome; opcionalmente puede indicarse
la ruta de `playwright/index.mjs` mediante PLAYWRIGHT_MODULE. Con RADAR_LOGIN_PASSWORD
y RADAR_LOGIN_DNI verifica tambien el iframe, los contadores y la presencia de reportes.
Las capturas se generan en tests/artifacts. No guardar credenciales en los archivos.
