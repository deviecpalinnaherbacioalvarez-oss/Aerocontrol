export const GEOMETRY = Object.freeze({
  width: 1400, height: 760, runwayY: 250,
  gates: [500, 640, 780, 920, 1060].map((x, index) => ({ id: `P${index + 1}`, x, y: 600 })),
});

export const PHASES = Object.freeze({
  queued: 'En secuencia', stand: 'En posición', pushback: 'Retroceso',
  taxiOut: 'Rodaje A', hold: 'Punto de espera A1', lineUp: 'Alineación',
  takeoff: 'Carrera de despegue', airborne: 'Ascenso', approach: 'Aproximación final',
  landing: 'Carrera de aterrizaje', vacating: 'Liberando por B', taxiIn: 'Rodaje B',
  arrived: 'En posición · llegada', completed: 'Operación completada',
});

export const RUNWAY_PHASES = new Set(['approach', 'landing', 'vacating', 'lineUp', 'takeoff']);
const GROUND_PHASES = new Set(['pushback', 'taxiOut', 'taxiIn', 'vacating']);
const SPEEDS = { pushback: 7, taxiOut: 13, lineUp: 10, takeoff: 44, airborne: 70,
  approach: 30, landing: 35, vacating: 14, taxiIn: 12 };
const machineConfig = {
  id: 'surface-movement', initial: 'queued', states: {
    queued: { on: { PARK: 'stand', ARRIVAL: 'approach' } },
    stand: { on: { RELEASE: 'pushback' } }, pushback: { on: { NEXT: 'taxiOut' } },
    taxiOut: { on: { NEXT: 'hold' } }, hold: { on: { CLEAR: 'lineUp' } },
    lineUp: { on: { NEXT: 'takeoff' } }, takeoff: { on: { NEXT: 'airborne' } },
    airborne: { on: { NEXT: 'completed' } }, approach: { on: { NEXT: 'landing' } },
    landing: { on: { NEXT: 'vacating' } }, vacating: { on: { NEXT: 'taxiIn' } },
    taxiIn: { on: { NEXT: 'arrived' } }, arrived: { on: { NEXT: 'completed' } },
    completed: { type: 'final' },
  },
};

export const DEMO_FLIGHTS = [
  { codigo: 'LAT317', tipo: 'Salida', ruta: 'Cusco (CUZ)', puerta: 'A-04' },
  { codigo: 'LPE412', tipo: 'Llegada', ruta: 'Santiago (SCL)', puerta: 'B-02' },
  { codigo: 'AVA240', tipo: 'Salida', ruta: 'Bogotá (BOG)', puerta: 'A-06' },
  { codigo: 'IBE3421', tipo: 'Llegada', ruta: 'Madrid (MAD)', puerta: 'C-12' },
  { codigo: 'SKY211', tipo: 'Salida', ruta: 'Arequipa (AQP)', puerta: 'A-08' },
  { codigo: 'CMP131', tipo: 'Llegada', ruta: 'Panamá (PTY)', puerta: 'B-04' },
  { codigo: 'AAL982', tipo: 'Salida', ruta: 'Miami (MIA)', puerta: 'B-06' },
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (x, y) => ({ x, y });
const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);

export class SurfaceSimulation {
  constructor(fsm, flights = []) {
    this.fsm = fsm;
    this.machine = fsm.createMachine(machineConfig);
    this.time = 0;
    this.aircraft = [];
    this.events = [];
    this.source = 'demo';
    this.runwayOwner = null;
    this.groundOwner = null;
    this.runwayClosed = false;
    this.cooldownUntil = 0;
    this.paused = false;
    this.weather = 'normal';
    this.sequence = 0;
    this.lastOperation = 'Salida';
    this.reservations = new Map();
    this.sync(flights);
  }

  log(message, level = 'info', code = '') {
    this.events.unshift({ id: ++this.sequence, time: this.time, message, level, code });
    this.events.length = Math.min(this.events.length, 80);
  }

  sync(rows, source = this.source) {
    if (!Array.isArray(rows)) return;
    if (source !== this.source) {
      this.dispose();
      this.aircraft = [];
      this.reservations.clear();
      this.runwayOwner = this.groundOwner = null;
      this.cooldownUntil = this.time;
      this.source = source;
      this.log('Lista de vuelos sincronizada con AeroControl. Posiciones simuladas.');
    }
    const incoming = new Map();
    rows.forEach(row => {
      const code = clean(row?.codigo, 18);
      if (code && row.estado !== 'Finalizado' && !incoming.has(code)) incoming.set(code, row);
    });
    for (const ac of this.aircraft) {
      const row = incoming.get(ac.code);
      if (row) {
        if (ac.phase === 'completed' && source === 'system') {
          ac.actor = this.fsm.createActor(this.machine).start();
          ac.phase = 'queued';
          ac.gate = null;
          ac.pos = null;
          ac.heading = 0;
          ac.path = [];
          ac.segment = 0;
          ac.speed = 0;
          ac.stopped = false;
          ac.priority = false;
          ac.withdrawn = false;
          ac.entered = this.time;
          ac.kind = row.tipo === 'Llegada' ? 'Llegada' : 'Salida';
          this.log('Nueva rotación iniciada porque el vuelo continúa activo en AeroControl.', 'info', ac.code);
        }
        ac.route = clean(row.ruta);
        ac.gateLabel = clean(row.puerta, 30);
        ac.externalStatus = clean(row.estado, 30);
        ac.withdrawn = false;
        incoming.delete(ac.code);
      } else if (ac.phase !== 'completed') {
        // A withdrawn moving target finishes its clearance before releasing resources.
        ac.withdrawn = true;
        ac.stopped = false;
        if (['queued', 'stand', 'hold', 'arrived'].includes(ac.phase)) this.retire(ac);
      }
    }
    for (const [code, row] of incoming) {
      const actor = this.fsm.createActor(this.machine).start();
      const ac = { code, actor, phase: 'queued', route: clean(row.ruta), gateLabel: clean(row.puerta, 30),
        externalStatus: clean(row.estado, 30), kind: row.tipo === 'Llegada' ? 'Llegada' : 'Salida',
        gate: null, pos: null, heading: 0, path: [], segment: 0, speed: 0, stopped: false,
        priority: false, withdrawn: false, entered: this.time, order: this.aircraft.length, trail: [] };
      this.aircraft.push(ac);
    }
    this.populateStands();
  }

  dispose() { this.aircraft.forEach(ac => ac.actor.stop()); }

  freeGate() {
    return GEOMETRY.gates.find(gate => !this.reservations.has(gate.id));
  }

  reserveGate(ac) {
    const gate = this.freeGate();
    if (!gate) return false;
    this.reservations.set(gate.id, ac.code);
    ac.gate = gate;
    return true;
  }

  populateStands() {
    // Keep one stand free for arrivals instead of filling the apron with departure seeds.
    for (const ac of this.aircraft) {
      if (ac.phase !== 'queued' || ac.kind !== 'Salida' || ac.withdrawn) continue;
      if (this.reservations.size >= GEOMETRY.gates.length - 1) break;
      if (this.reserveGate(ac)) {
        ac.pos = point(ac.gate.x, ac.gate.y);
        ac.heading = Math.PI / 2;
        this.transition(ac, 'PARK');
      }
    }
  }

  transition(ac, event) {
    ac.actor.send({ type: event });
    ac.phase = ac.actor.getSnapshot().value;
    ac.entered = this.time;
    ac.segment = 0;
    ac.speed = 0;
    const g = ac.gate;
    const start = ac.pos ? { ...ac.pos } : point(50, 250);
    const routes = {
      pushback: [start, point(g?.x, 510)],
      taxiOut: [start, point(g?.x, 375), point(315, 375), point(315, 315)],
      lineUp: [start, point(315, 250), point(365, 250)],
      takeoff: [start, point(1240, 250)],
      airborne: [start, point(1380, 190)],
      approach: [point(50, 250), point(270, 250)],
      landing: [start, point(1100, 250)],
      vacating: [start, point(1180, 330), point(1180, 460)],
      taxiIn: [start, point(g?.x, 460), point(g?.x, 600)],
    };
    ac.path = routes[ac.phase] || [];
    if (ac.path.length) ac.pos = { ...ac.path[0] };
    if (ac.phase === 'hold') {
      if (this.groundOwner === ac.code) this.groundOwner = null;
      if (this.reservations.get(g.id) === ac.code) this.reservations.delete(g.id);
      this.log('Punto A1: mantener fuera de pista.', 'info', ac.code);
    }
    if (ac.phase === 'airborne' || ac.phase === 'taxiIn') this.releaseRunway(ac);
    if (ac.phase === 'arrived') {
      this.groundOwner = null;
      ac.priority = false;
      this.log(`Llegada a posición ${g.id}.`, 'success', ac.code);
    }
    if (ac.phase === 'completed') this.retire(ac);
  }

  releaseRunway(ac) {
    if (this.runwayOwner !== ac.code) return;
    this.runwayOwner = null;
    this.cooldownUntil = this.time + (this.weather === 'low' ? 25 : 12);
    this.log('Pista liberada. Separación entre movimientos activa.', 'success', ac.code);
  }

  retire(ac) {
    this.releaseRunway(ac);
    if (this.groundOwner === ac.code) this.groundOwner = null;
    if (ac.gate && this.reservations.get(ac.gate.id) === ac.code) this.reservations.delete(ac.gate.id);
    ac.actor.stop();
    ac.phase = 'completed';
    ac.path = [];
    ac.pos = null;
    ac.speed = 0;
    this.log(ac.withdrawn ? 'Retirado por actualización del sistema.' : 'Operación completada.', 'success', ac.code);
  }

  setClosed(value) {
    this.runwayClosed = Boolean(value);
    this.log(value ? 'Pista cerrada a nuevas autorizaciones; el movimiento autorizado continúa.' : 'Pista reabierta a nuevas autorizaciones.', value ? 'warning' : 'success');
  }

  setWeather(value) {
    if (!['normal', 'wet', 'low'].includes(value)) return;
    this.weather = value;
    if (!this.runwayOwner && value === 'low') this.cooldownUntil = Math.max(this.cooldownUntil, this.time + 25);
    this.log(value === 'low' ? 'Baja visibilidad: rodaje reducido y separación ampliada.' : value === 'wet' ? 'Pavimento mojado: velocidad de rodaje reducida.' : 'Condiciones normales de superficie.');
  }

  hold(code) {
    const ac = this.aircraft.find(a => a.code === code);
    if (!ac || !['stand', 'pushback', 'taxiOut', 'hold', 'taxiIn'].includes(ac.phase)) return false;
    ac.stopped = !ac.stopped;
    if (ac.stopped) ac.speed = 0;
    this.log(ac.stopped ? 'Mantener posición por orden de torre.' : 'Continuar autorización de rodaje.', 'warning', code);
    return true;
  }

  prioritize(code) {
    const ac = this.aircraft.find(a => a.code === code);
    if (!ac || ac.phase === 'completed' || RUNWAY_PHASES.has(ac.phase) || ['airborne', 'taxiIn', 'arrived'].includes(ac.phase)) return false;
    ac.priority = !ac.priority;
    this.log(ac.priority ? 'Prioridad solicitada. Se mantienen los bloqueos de pista y rodaje.' : 'Prioridad cancelada.', 'warning', code);
    return true;
  }

  ordered(candidates) {
    return [...candidates].sort((a, b) => Number(b.priority) - Number(a.priority) || a.order - b.order);
  }

  schedule() {
    this.populateStands();
    const hold = this.aircraft.find(ac => ac.phase === 'hold');
    if (!this.runwayOwner && !this.runwayClosed && this.time >= this.cooldownUntil) {
      const departure = hold && !hold.stopped && !hold.withdrawn ? hold : null;
      const arrival = !this.groundOwner && this.freeGate()
        ? this.ordered(this.aircraft.filter(ac => ac.kind === 'Llegada' && ac.phase === 'queued' && !ac.withdrawn))[0] : null;
      const next = departure && arrival
        ? (arrival.priority !== departure.priority ? (arrival.priority ? arrival : departure) : (this.lastOperation === 'Salida' ? arrival : departure))
        : departure || arrival;
      if (next) {
        this.runwayOwner = next.code;
        this.lastOperation = next.kind;
        if (next.kind === 'Llegada') {
          this.reserveGate(next);
          this.groundOwner = next.code;
          this.transition(next, 'ARRIVAL');
        } else this.transition(next, 'CLEAR');
        this.log(next.kind === 'Llegada' ? 'Autorizado aterrizaje RWY 16. Salida por B.' : 'Autorizado alinear y despegar RWY 16.', 'success', next.code);
      }
    }
    // Single surface clearance across the apron crossing avoids opposed ground movements.
    if (!this.groundOwner && !hold && !this.runwayClosed) {
      const next = this.ordered(this.aircraft.filter(ac => ac.phase === 'stand' && !ac.stopped && !ac.withdrawn && this.time - ac.entered >= 5))[0];
      if (next) {
        this.groundOwner = next.code;
        this.transition(next, 'RELEASE');
        this.log('Retroceso autorizado. Rodar por A hasta punto de espera A1.', 'info', next.code);
      }
    }
  }

  move(ac, dt) {
    if (ac.stopped || !ac.path.length) { ac.speed = 0; return; }
    const factor = GROUND_PHASES.has(ac.phase) || ac.phase === 'lineUp'
      ? ({ normal: 1, wet: 0.75, low: 0.5 })[this.weather] : 1;
    ac.speed = SPEEDS[ac.phase] * factor;
    let remaining = ac.speed * dt;
    while (remaining > 0 && ac.segment < ac.path.length - 1) {
      const target = ac.path[ac.segment + 1];
      const d = distance(ac.pos, target);
      if (d > 0) {
        ac.heading = Math.atan2(target.y - ac.pos.y, target.x - ac.pos.x) + (ac.phase === 'pushback' ? Math.PI : 0);
        const step = Math.min(d, remaining);
        ac.pos.x += (target.x - ac.pos.x) * step / d;
        ac.pos.y += (target.y - ac.pos.y) * step / d;
        remaining -= step;
      }
      if (distance(ac.pos, target) < 0.000001) ac.segment++;
      else break;
    }
    if (ac.segment >= ac.path.length - 1) this.transition(ac, 'NEXT');
  }

  step(seconds) {
    if (this.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, 60);
    while (remaining > 0.000001) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      this.time += dt;
      this.schedule();
      for (const ac of this.aircraft) {
        this.move(ac, dt);
        if (ac.withdrawn && ['hold', 'arrived'].includes(ac.phase)) this.retire(ac);
        else if (ac.phase === 'arrived' && this.time - ac.entered > 90) this.transition(ac, 'NEXT');
      }
    }
  }

  get stats() {
    return {
      active: this.aircraft.filter(ac => ac.phase !== 'completed').length,
      runway: this.aircraft.filter(ac => ['lineUp', 'takeoff', 'landing', 'vacating'].includes(ac.phase)).length,
      stands: this.aircraft.filter(ac => ['stand', 'arrived'].includes(ac.phase)).length,
      taxi: this.aircraft.filter(ac => GROUND_PHASES.has(ac.phase)).length,
      completed: this.aircraft.filter(ac => ac.phase === 'completed').length,
    };
  }

  get queue() {
    return this.ordered(this.aircraft.filter(ac => ['queued', 'stand', 'pushback', 'taxiOut', 'hold'].includes(ac.phase)));
  }
}
