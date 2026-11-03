import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SurfaceSimulation, RUNWAY_PHASES, DEMO_FLIGHTS } from '../public/surface-engine.js';

const context = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(readFileSync(new URL('../public/vendor/xstate.umd.min.js', import.meta.url), 'utf8'), context);
const create = (flights = DEMO_FLIGHTS) => new SurfaceSimulation(context.XState, flights);
const advance = (sim, seconds, verify = () => {}) => {
  for (let i = 0; i < seconds * 10; i++) { sim.step(0.1); verify(sim); }
};
function invariant(sim) {
  const runway = sim.aircraft.filter(a => RUNWAY_PHASES.has(a.phase));
  assert.ok(runway.length <= 1, 'Exclusive runway reservation');
  assert.equal(runway[0]?.code || null, sim.runwayOwner);
  const movingGround = sim.aircraft.filter(a => ['pushback', 'taxiOut', 'vacating', 'taxiIn'].includes(a.phase));
  assert.ok(movingGround.length <= 1, 'One clearance through the shared apron crossing');
  if (movingGround.length) assert.equal(movingGround[0].code, sim.groundOwner);
  const visible = sim.aircraft.filter(a => a.pos);
  for (let i = 0; i < visible.length; i++) {
    assert.ok(Number.isFinite(visible[i].pos.x) && Number.isFinite(visible[i].pos.y));
    for (let j = i + 1; j < visible.length; j++) {
      assert.ok(Math.hypot(visible[i].pos.x - visible[j].pos.x, visible[i].pos.y - visible[j].pos.y) > 36,
        `Separation: ${visible[i].code}/${visible[j].code}`);
    }
  }
}

for (const weather of ['normal', 'wet', 'low']) {
  test(`Full mixed traffic cycle: ${weather}, no overlap or deadlock`, () => {
    const sim = create(); sim.setWeather(weather);
    advance(sim, 1800, invariant);
    assert.equal(sim.stats.completed, DEMO_FLIGHTS.length);
    assert.equal(sim.reservations.size, 0);
    assert.equal(sim.runwayOwner, null);
    assert.equal(sim.groundOwner, null);
    sim.dispose();
  });
}
test('Large system snapshot finishes without ghost/demo flights', () => {
  const sim = create();
  const rows = Array.from({ length: 40 }, (_, i) => ({ codigo: `TST${i}`, tipo: i % 2 ? 'Salida' : 'Llegada' }));
  sim.sync(rows, 'system');
  assert.equal(sim.aircraft.length, 40);
  advance(sim, 6000, invariant);
  assert.equal(sim.stats.completed, 40);
  sim.sync(rows, 'system');
  assert.equal(sim.stats.active, 40, 'Active system rows start a new rotation after completing the simulation');
});
test('Pause freezes time, positions and scheduling', () => {
  const sim = create(); advance(sim, 8);
  sim.paused = true;
  const before = JSON.stringify(sim.aircraft.map(a => [a.phase, a.pos]));
  const time = sim.time;
  advance(sim, 100);
  assert.equal(sim.time, time);
  assert.equal(JSON.stringify(sim.aircraft.map(a => [a.phase, a.pos])), before);
  sim.paused = false; advance(sim, 10); assert.ok(sim.time > time);
});
test('Closed runway blocks new clearances, lets current owner clear safely', () => {
  const sim = create(); advance(sim, 1);
  assert.ok(sim.runwayOwner);
  const owner = sim.runwayOwner;
  sim.setClosed(true); advance(sim, 200, invariant);
  assert.equal(sim.runwayOwner, null);
  assert.ok(sim.aircraft.every(a => !RUNWAY_PHASES.has(a.phase)));
  assert.ok(sim.events.some(e => e.code === owner && e.message.includes('liberada')));
  sim.setClosed(false); advance(sim, 1800, invariant);
  assert.equal(sim.stats.completed, DEMO_FLIGHTS.length);
});
test('Holding ground traffic preserves its position and clearance', () => {
  const sim = create([{ codigo: 'DEP01', tipo: 'Salida' }]);
  advance(sim, 8);
  const ac = sim.aircraft[0];
  assert.equal(ac.phase, 'pushback');
  assert.equal(sim.hold(ac.code), true);
  const pos = { ...ac.pos }; advance(sim, 60);
  assert.deepEqual(ac.pos, pos);
  assert.equal(sim.groundOwner, ac.code);
  sim.hold(ac.code); advance(sim, 300, invariant);
  assert.equal(ac.phase, 'completed');
});
test('Priority never interrupts a runway clearance', () => {
  const sim = create(); advance(sim, 1);
  const owner = sim.runwayOwner;
  sim.prioritize('IBE3421'); advance(sim, 4, invariant);
  assert.equal(sim.runwayOwner, owner);
  assert.equal(sim.hold(owner), false);
  advance(sim, 1800, invariant);
  assert.equal(sim.stats.completed, DEMO_FLIGHTS.length);
});
test('Sync deduplicates and withdraws safely, including an empty snapshot', () => {
  const sim = create();
  sim.sync([{ codigo: 'ONE', tipo: 'Llegada' }, { codigo: 'ONE', tipo: 'Llegada' }], 'system');
  assert.equal(sim.aircraft.length, 1);
  advance(sim, 5);
  sim.sync([], 'system');
  assert.equal(sim.runwayOwner, 'ONE');
  advance(sim, 200, invariant);
  assert.equal(sim.stats.active, 0);
  assert.equal(sim.reservations.size, 0);
});
test('Removing a held or parked departure releases its resources', () => {
  const sim = create([{ codigo: 'DEP', tipo: 'Salida' }]);
  sim.sync([{ codigo: 'DEP', tipo: 'Salida' }], 'system');
  advance(sim, 8, invariant);
  sim.hold('DEP');
  sim.setClosed(true);
  sim.sync([], 'system');
  advance(sim, 180, invariant);
  assert.equal(sim.stats.active, 0);
  assert.equal(sim.reservations.size, 0);
  assert.equal(sim.groundOwner, null);
});
test('An empty initial system snapshot does not invent traffic', () => {
  const sim = create();
  sim.sync([], 'system');
  advance(sim, 300, invariant);
  assert.equal(sim.aircraft.length, 0);
  assert.equal(sim.stats.active, 0);
});
test('Departure-only and arrival-only queues complete', () => {
  for (const tipo of ['Salida', 'Llegada']) {
    const sim = create(Array.from({ length: 12 }, (_, i) => ({ codigo: `${tipo}${i}`, tipo })));
    advance(sim, 3000, invariant);
    assert.equal(sim.stats.completed, 12);
  }
});
