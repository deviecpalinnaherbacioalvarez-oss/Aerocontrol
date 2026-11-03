import { SurfaceSimulation, GEOMETRY, PHASES, RUNWAY_PHASES, DEMO_FLIGHTS } from './surface-engine.js';

if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
let latestFlights = embedded ? [] : DEMO_FLIGHTS;
let sim = new SurfaceSimulation(window.XState, latestFlights);
let selectedCode = '';
let activeTab = 'traffic';
let noticeTimer;
const canvas = $('surfaceMap');
const ctx = canvas.getContext('2d');
let width = 1, height = 1, dpr = 1, base = 1;
let zoom = 1, pan = { x: 0, y: 0 };
let hitTargets = [];
const listSignatures = new Map();
window.lucide.createIcons();

const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const color = ac => ac.priority ? '#f18181' : ac.kind === 'Llegada' ? '#55cce6' : '#f0c569';
const selected = () => sim.aircraft.find(ac => ac.code === selectedCode);
const phase = ac => ac.stopped ? 'Manteniendo posición' : PHASES[ac.phase];
function notice(message) {
  $('notice').textContent = message;
  $('notice').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').classList.remove('visible'), 4000);
}
function setText(id, text) { if ($(id).textContent !== String(text)) $(id).textContent = text; }
function changeList(id, html) {
  if (listSignatures.get(id) === html) return;
  const focused = document.activeElement?.closest('[data-flight]');
  const code = focused?.dataset.flight;
  const hadFocus = focused && $(id).contains(focused);
  $(id).innerHTML = html;
  listSignatures.set(id, html);
  if (hadFocus) [...$(id).querySelectorAll('[data-flight]')].find(el => el.dataset.flight === code)?.focus({ preventScroll: true });
}
function selectFlight(code) { selectedCode = code; updateUI(); }

function clearanceText(ac) {
  if (!ac) return 'Sin autorización activa.';
  if (ac.withdrawn) return 'Retirado del sistema. Finalizando la maniobra autorizada.';
  if (ac.stopped) return 'Mantener posición. La reserva de rodaje sigue protegida.';
  return {
    queued: ac.kind === 'Llegada' ? 'En cola de aproximación. Sin autorización de ingreso al área representada.' : 'Esperando una posición libre en plataforma.',
    stand: sim.runwayClosed ? 'Pista cerrada. Mantener en posición.' : 'Esperar autorización de retroceso y rodaje.',
    pushback: 'Retroceso autorizado; corredor de plataforma reservado.',
    taxiOut: 'Rodar por A y detenerse antes de la barra de parada A1.',
    hold: sim.runwayClosed ? 'Pista cerrada. Mantener en A1.' : 'Mantener en A1 hasta que la pista quede libre y se cumpla la separación.',
    lineUp: 'Alinear RWY 16. Pista reservada exclusivamente para este vuelo.',
    takeoff: 'Despegue autorizado RWY 16. Sin otros movimientos en pista.',
    airborne: 'En ascenso. Pista liberada; separación entre movimientos activa.',
    approach: 'Aterrizaje autorizado RWY 16. Pista y salida B reservadas.',
    landing: 'Aterrizaje en curso. Continuar hasta salida B.',
    vacating: 'Liberar completamente la pista por B. Reserva de pista activa.',
    taxiIn: `Pista liberada. Rodar por B a la posición ${ac.gate?.id}.`,
    arrived: `Estacionado en ${ac.gate?.id}. Atención en tierra simulada.`,
    completed: 'Movimiento completado en esta sesión de simulación.',
  }[ac.phase];
}

function row(ac, index) {
  return `<button class="traffic-row${ac.code === selectedCode ? ' selected' : ''}" data-flight="${esc(ac.code)}" aria-pressed="${ac.code === selectedCode}">${index === undefined ? `<span class="dot" style="background:${color(ac)}"></span>` : `<span class="queue-index">${String(index + 1).padStart(2, '0')}</span>`}<span class="row-content"><strong>${esc(ac.code)}</strong><small>${esc(phase(ac))}</small></span><span class="row-end">${ac.priority ? 'PRIORIDAD' : ac.kind === 'Llegada' ? 'ARR' : 'DEP'}<br>${esc(ac.gate?.id || 'En cola')}</span></button>`;
}
function updateUI() {
  const stats = sim.stats;
  const active = sim.aircraft.filter(ac => ac.phase !== 'completed');
  if (!selected() || selected().phase === 'completed') selectedCode = (active.find(ac => ac.pos && !['stand', 'arrived'].includes(ac.phase)) || active[0])?.code || '';
  const ac = selected();
  setText('sourceStatus', embedded ? (sim.source === 'system' ? 'Vuelos de AeroControl · posiciones simuladas' : 'Esperando vuelos de AeroControl') : 'Escenario de demostración');
  setText('motionStatus', 'Operación automática · tiempo real');
  setText('simClock', new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date()));
  setText('activeCount', stats.active);
  setText('completedCount', stats.completed);
  setText('trafficCount', stats.active);
  const owner = sim.aircraft.find(a => a.code === sim.runwayOwner);
  const separating = Math.max(0, Math.ceil(sim.cooldownUntil - sim.time));
  setText('runwayState', sim.runwayClosed ? 'CERRADA' : owner ? (owner.phase === 'approach' ? 'RESERVADA' : 'OCUPADA') : separating ? 'SEPARACIÓN' : 'LIBRE');
  $('runwayState').style.color = sim.runwayClosed ? '#ff9b94' : owner ? '#f0d087' : '#8be5b4';
  setText('runwayDetail', owner ? `${owner.code} · ${PHASES[owner.phase]}` : separating ? `Próxima autorización en ${separating} s simulados` : 'Sin autorización activa');
  $('mapEmpty').hidden = active.length > 0;
  setText('mapEmpty', sim.source === 'system' ? 'No hay vuelos activos pendientes en esta sesión.' : 'Escenario completado. Reinicia para repetirlo.');
  setText('groundStatus', sim.groundOwner ? `Rodaje reservado · ${sim.groundOwner}` : 'Rodaje disponible');
  setText('selectedCode', ac?.code || 'Sin selección');
  setText('selectedKind', ac?.kind || '');
  setText('selectedRoute', ac?.route || 'Sin ruta disponible');
  setText('selectedPhase', ac ? phase(ac) : 'Sin objetivo');
  setText('selectedStand', ac?.gate?.id || 'En cola');
  setText('selectedGate', ac?.gateLabel || 'Sin asignar');
  setText('selectedSpeed', ac?.pos ? `${Math.round(ac.speed / 0.5144)} kt` : '—');
  setText('selectedHeading', ac?.pos ? `${String(Math.round((ac.heading * 180 / Math.PI + 520) % 360)).padStart(3, '0')}°` : '—');
  setText('clearance', clearanceText(ac));
  $('holdFlight').disabled = !ac || !['stand', 'pushback', 'taxiOut', 'hold', 'taxiIn'].includes(ac.phase);
  $('holdFlight').setAttribute('aria-pressed', String(Boolean(ac?.stopped)));
  $('holdFlight').querySelector('span').textContent = ac?.stopped ? 'Continuar' : 'Mantener';
  $('priorityFlight').disabled = !ac || !['queued', 'stand', 'pushback', 'taxiOut', 'hold'].includes(ac.phase);
  $('priorityFlight').setAttribute('aria-pressed', String(Boolean(ac?.priority)));
  const query = $('searchFlight').value.trim().toLocaleLowerCase('es');
  const matches = active.filter(a => `${a.code} ${a.route}`.toLocaleLowerCase('es').includes(query));
  if (activeTab === 'traffic') changeList('trafficList', matches.map(a => row(a)).join('') || '<p class="list-empty">No se encontraron vuelos.</p>');
  setText('queueCount', sim.queue.length);
  if (activeTab === 'sequence') changeList('sequenceList', sim.queue.map((a, i) => row(a, i)).join('') || '<p class="list-empty">No hay solicitudes pendientes.</p>');
  if (activeTab === 'events') changeList('eventList', sim.events.map(e => `<div class="event-row ${e.level}"><time>T+${formatTime(e.time)}</time><strong>${esc(e.code || 'TORRE')}</strong><p>${esc(e.message)}</p></div>`).join('') || '<p class="list-empty">Aún no hay autorizaciones.</p>');
  if (embedded) window.parent.postMessage({ type: 'AEROCONTROL_SURFACE_STATUS', stats, source: sim.source }, location.origin);
}

$('runwayClosed').addEventListener('change', event => { sim.setClosed(event.target.checked); updateUI(); notice(event.target.checked ? 'Nuevas autorizaciones bloqueadas. La maniobra ya autorizada terminará.' : 'Pista abierta. Se reanuda la secuencia.'); });
$('holdFlight').addEventListener('click', () => { sim.hold(selectedCode); updateUI(); });
$('priorityFlight').addEventListener('click', () => { sim.prioritize(selectedCode); updateUI(); });
$('searchFlight').addEventListener('input', updateUI);
document.querySelectorAll('.scroll-list').forEach(list => list.addEventListener('click', event => {
  const button = event.target.closest('[data-flight]');
  if (button) selectFlight(button.dataset.flight);
}));
function activateTab(name) {
  activeTab = name;
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`${button.dataset.tab}-panel`).hidden = !active;
  });
  updateUI();
}
document.querySelectorAll('[data-tab]').forEach((button, index) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...document.querySelectorAll('[data-tab]')];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    activateTab(buttons[next].dataset.tab);
    buttons[next].focus();
  });
});
window.addEventListener('message', event => {
  if (!embedded || event.source !== window.parent || event.origin !== location.origin) return;
  if (event.data?.type === 'AEROCONTROL_FLIGHTS' && Array.isArray(event.data.flights)) {
    latestFlights = event.data.flights;
    sim.sync(latestFlights, 'system');
    updateUI();
  }
});

function resize() {
  const rect = $('mapViewport').getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  width = rect.width; height = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  base = Math.min(width / GEOMETRY.width, height / GEOMETRY.height);
  clampPan();
}
let resizeFrame = 0;
const mapObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(resize);
});
mapObserver.observe($('mapViewport'));
let heightFrame = 0;
const appObserver = new ResizeObserver(() => {
  cancelAnimationFrame(heightFrame);
  heightFrame = requestAnimationFrame(() => {
    if (embedded) window.parent.postMessage({ type: 'AEROCONTROL_SURFACE_HEIGHT',
      height: window.innerWidth <= 740 ? Math.ceil(document.querySelector('.surface-app').getBoundingClientRect().height) : 820 }, location.origin);
  });
});
appObserver.observe(document.querySelector('.surface-app'));
function clampPan() {
  pan.x = Math.max(-width * (zoom - 1) / 2, Math.min(width * (zoom - 1) / 2, pan.x));
  pan.y = Math.max(-height * (zoom - 1) / 2, Math.min(height * (zoom - 1) / 2, pan.y));
}
function setZoom(value) {
  zoom = Math.max(1, Math.min(3, value)); clampPan();
  $('zoomOut').disabled = zoom === 1; $('zoomIn').disabled = zoom === 3;
}
$('zoomIn').addEventListener('click', () => setZoom(zoom + 0.4));
$('zoomOut').addEventListener('click', () => setZoom(zoom - 0.4));
$('fitMap').addEventListener('click', () => { pan = { x: 0, y: 0 }; setZoom(1); });
canvas.addEventListener('wheel', event => { event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15)); }, { passive: false });
let drag = null;
canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, moved: false }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (drag.moved) { pan = { x: drag.px + dx, y: drag.py + dy }; clampPan(); }
});
canvas.addEventListener('pointerup', event => {
  if (drag && !drag.moved) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const target = [...hitTargets].reverse().find(t => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
    if (target) selectFlight(target.code);
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; });

function line(points, stroke, lineWidth, dash = []) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
}
function label(text, x, y, size = 13, fill = '#94b19f', align = 'left') {
  ctx.font = `500 ${size}px "Segoe UI", Arial`; ctx.fillStyle = fill; ctx.textAlign = align; ctx.fillText(text, x, y);
}
function pavement(points, size = 36) {
  line(points, '#51635b', size + 3); line(points, '#35443e', size); line(points, '#a79758', 1.5);
}
function drawAirport() {
  ctx.fillStyle = '#1c3026'; ctx.fillRect(230, 195, 1070, 110);
  ctx.strokeStyle = '#345142'; ctx.lineWidth = 1;
  ctx.strokeRect(205, 175, 1110, 535);
  line([[210, 180], [1310, 180], [1310, 705], [210, 705]], '#526453', 1, [5, 7]);
  ctx.fillStyle = '#293e32'; ctx.fillRect(433, 496, 705, 142);
  pavement([[315, 250], [315, 375], [1090, 375]], 32);
  pavement([[1100, 250], [1180, 330], [1180, 460], [450, 460]], 35);
  for (const gate of GEOMETRY.gates) {
    pavement([[gate.x, 375], [gate.x, 600]], 28);
    ctx.strokeStyle = '#607159'; ctx.lineWidth = 1; ctx.strokeRect(gate.x - 46, 550, 92, 78);
    const occupied = sim.reservations.has(gate.id);
    label(gate.id, gate.x, 638, 14, occupied ? '#edc887' : '#8ba491', 'center');
    ctx.fillStyle = '#435a4b'; ctx.fillRect(gate.x + 12, 615, 12, 37);
    line([[gate.x + 18, 620], [gate.x + 4, 613]], '#708879', 7);
  }
  ctx.fillStyle = '#3b4c43'; ctx.fillRect(440, 655, 690, 45);
  ctx.strokeStyle = '#6a7f70'; ctx.strokeRect(440, 655, 690, 45);
  for (let x = 450; x < 1120; x += 22) { ctx.fillStyle = '#6d8375'; ctx.fillRect(x, 660, 13, 6); }
  label('TERMINAL / PLATAFORMA', 785, 686, 14, '#b0c0b2', 'center');
  ctx.fillStyle = '#304238'; ctx.fillRect(225, 510, 155, 88);
  ctx.strokeStyle = '#506c58'; ctx.strokeRect(225, 510, 155, 88);
  for (let x = 238; x < 370; x += 17) line([[x, 520], [x, 587]], '#4f6353', 1);
  label('SOPORTE', 302, 620, 12, '#829b89', 'center');
  const owner = sim.aircraft.find(ac => ac.code === sim.runwayOwner);
  ctx.fillStyle = '#39443e'; ctx.fillRect(265, 215, 990, 70);
  ctx.strokeStyle = sim.runwayClosed ? '#ee8181' : owner ? '#b5c791' : '#81968a';
  ctx.lineWidth = 2; ctx.strokeRect(265, 215, 990, 70);
  line([[360, 250], [1150, 250]], '#d0d8d0', 2.5, [24, 24]);
  for (let y = 224; y <= 276; y += 7) {
    ctx.fillStyle = '#c4cfc6'; ctx.fillRect(275, y, 22, 3); ctx.fillRect(1223, y, 22, 3);
  }
  label('16', 326, 258, 25, '#e2e9e3', 'center'); label('34', 1189, 258, 25, '#e2e9e3', 'center');
  for (let x = 405; x < 1100; x += 100) { ctx.fillStyle = '#a6b5a4'; ctx.fillRect(x, 222, 3, 3); ctx.fillRect(x, 278, 3, 3); }
  if (sim.runwayClosed) {
    [[385, 250], [1130, 250]].forEach(([x, y]) => { line([[x - 12, y - 13], [x + 12, y + 13]], '#e8c370', 5); line([[x + 12, y - 13], [x - 12, y + 13]], '#e8c370', 5); });
  }
  line([[35, 250], [258, 250]], '#729b87', 1.5, [8, 9]);
  label('FINAL 16', 80, 220, 12, '#83a595');
  line([[1256, 250], [1380, 190]], '#6e927e', 1.5, [8, 9]);
  const stopOpen = owner?.phase === 'lineUp';
  for (let x = 300; x <= 330; x += 6) { ctx.fillStyle = stopOpen ? '#8ee2b4' : '#f08080'; ctx.fillRect(x, 296, 3, 5); }
  line([[295, 305], [335, 305]], '#ccb973', 2);
  label('A1', 270, 326, 15, '#e7c675');
  label('A  →  PUNTO DE ESPERA', 590, 350, 12, '#b2b98d');
  label('B  →  PLATAFORMA', 720, 442, 12, '#9dbaae');
  label('SALIDA B', 1210, 365, 12, '#a3b6a9');
  label('RWY 16 / 34', 765, 198, 12, '#a6bdad', 'center');
  const arrivals = sim.queue.filter(ac => ac.kind === 'Llegada');
  label(`SECUENCIA DE LLEGADA  ${arrivals.length.toString().padStart(2, '0')}`, 270, 100, 13, '#b4cbbd');
  label(arrivals.slice(0, 4).map(ac => ac.code).join('   /   ') || 'Sin aproximaciones pendientes', 270, 125, 13, '#7da38f');
}

function transformPoint(p) {
  const scale = base * zoom;
  return { x: (width - GEOMETRY.width * scale) / 2 + pan.x + p.x * scale,
    y: (height - GEOMETRY.height * scale) / 2 + pan.y + p.y * scale };
}
function drawAircraft(ac) {
  const p = transformPoint(ac.pos);
  const size = Math.max(6, Math.min(11, base * zoom * 17));
  const chosen = ac.code === selectedCode;
  ctx.save(); ctx.translate(p.x, p.y);
  if (chosen) {
    ctx.strokeStyle = '#ecf8ef'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(0, 0, size + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.rotate(ac.heading); ctx.scale(size / 12, size / 12);
  ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(7, -2); ctx.lineTo(-4, -13); ctx.lineTo(-8, -13);
  ctx.lineTo(-3, -2); ctx.lineTo(-12, -2); ctx.lineTo(-16, -6); ctx.lineTo(-18, -6);
  ctx.lineTo(-16, 0); ctx.lineTo(-18, 6); ctx.lineTo(-16, 6); ctx.lineTo(-12, 2);
  ctx.lineTo(-3, 2); ctx.lineTo(-8, 13); ctx.lineTo(-4, 13); ctx.lineTo(7, 2); ctx.closePath();
  ctx.fillStyle = color(ac); ctx.strokeStyle = '#12241b'; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke(); ctx.restore();
  hitTargets.push({ x: p.x - 18, y: p.y - 18, w: 36, h: 36, code: ac.code });
  return p;
}
const overlaps = (a, b) => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
function drawLabels(targets) {
  const occupied = targets.map(({ p }) => ({ x: p.x - 18, y: p.y - 18, w: 36, h: 36 }));
  occupied.push({ x: 0, y: 0, w: 230, h: 60 }, { x: width - 50, y: 0, w: 50, h: 130 });
  for (const { ac, p } of [...targets].sort((a, b) => Number(b.ac.code === selectedCode) - Number(a.ac.code === selectedCode))) {
    if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) continue;
    ctx.font = '600 10px "Segoe UI", Arial';
    const w = Math.max(78, ctx.measureText(ac.code).width + 14), h = 33;
    const candidates = [[20, -40], [20, 10], [-w - 20, -40], [-w - 20, 10], [-w / 2, -64], [-w / 2, 31], [25, -88], [-w - 25, -88], [-w / 2, 74]];
    let box = candidates.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy, w, h }))
      .find(b => b.x >= 4 && b.y >= 5 && b.x + w < width - 4 && b.y + h < height - 4 && !occupied.some(o => overlaps(b, o)));
    if (!box) {
      if (ac.code !== selectedCode) continue;
      box = { x: Math.max(5, Math.min(width - w - 5, p.x + 20)), y: Math.max(65, Math.min(height - h - 5, p.y - 40)), w, h };
    }
    occupied.push(box); hitTargets.push({ ...box, code: ac.code });
    line([[p.x, p.y], [box.x + w / 2, box.y + h / 2]], '#6f8f7b', 0.8);
    ctx.fillStyle = '#182b22f5'; ctx.fillRect(box.x, box.y, w, h);
    ctx.strokeStyle = ac.code === selectedCode ? '#e1eee4' : color(ac); ctx.lineWidth = 0.7; ctx.strokeRect(box.x, box.y, w, h);
    label(ac.code, box.x + 7, box.y + 13, 10, '#eff6ef');
    const hint = ac.stopped ? 'HOLD' : ac.priority ? 'PRIORIDAD' : `${ac.kind === 'Llegada' ? 'ARR' : 'DEP'} · ${ac.phase === 'hold' ? 'A1' : ac.gate?.id || 'RWY 16'}`;
    label(hint, box.x + 7, box.y + 26, 9, color(ac));
  }
}
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#172923'; ctx.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 40) line([[x, 0], [x, height]], '#21372b', 0.5);
  for (let y = 0; y < height; y += 40) line([[0, y], [width, y]], '#21372b', 0.5);
  const scale = base * zoom;
  ctx.save(); ctx.translate((width - GEOMETRY.width * scale) / 2 + pan.x, (height - GEOMETRY.height * scale) / 2 + pan.y); ctx.scale(scale, scale);
  drawAirport();
  const ac = selected();
  if (ac?.path.length && ac.pos && $('showRoutes').checked) {
    line([[ac.pos.x, ac.pos.y], ...ac.path.slice(ac.segment + 1).map(p => [p.x, p.y])], color(ac), 3 / scale, [6 / scale, 5 / scale]);
  }
  ctx.restore(); hitTargets = [];
  const targets = sim.aircraft.filter(a => a.pos && a.phase !== 'completed').map(a => ({ ac: a, p: drawAircraft(a) }));
  drawLabels(targets);
  // DOM-backed diagnostics keep canvas motion and occupancy observable in browser tests.
  canvas.dataset.targets = String(targets.length);
  canvas.dataset.positions = targets.map(t => `${t.ac.code}:${t.p.x.toFixed(1)},${t.p.y.toFixed(1)}`).join('|');
  canvas.dataset.runwayOccupants = String(sim.stats.runway);
}

let previous = performance.now(), uiElapsed = 0, simulationWallTime = performance.now();
function advanceSimulation(now = performance.now()) {
  const elapsed = Math.max(0, Math.min((now - simulationWallTime) / 1000, 3600));
  simulationWallTime = now;
  if (sim.paused || elapsed <= 0) return;
  let pending = elapsed;
  while (pending > 0.0001) {
    const chunk = Math.min(60, pending);
    sim.step(chunk);
    pending -= chunk;
  }
}
setInterval(() => advanceSimulation(), 250);
document.addEventListener('visibilitychange', () => advanceSimulation());
function frame(now) {
  const elapsed = Math.min((now - previous) / 1000, 0.15);
  previous = now;
  draw(); uiElapsed += elapsed;
  if (uiElapsed >= 0.3) { updateUI(); uiElapsed = 0; }
  requestAnimationFrame(frame);
}
resize(); setZoom(1); updateUI();
if (embedded) window.parent.postMessage({ type: 'AEROCONTROL_SURFACE_READY' }, location.origin);
requestAnimationFrame(frame);
