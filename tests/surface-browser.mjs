import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => errors.push(error.message));
await mkdir(new URL('./artifacts/', import.meta.url), { recursive: true });
const shot = name => fileURLToPath(new URL(`./artifacts/${name}.png`, import.meta.url));
const readCanvas = () => page.locator('#surfaceMap').evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set();
  for (let i = 0; i < data.length; i += 800) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return { colors: colors.size, targets: Number(canvas.dataset.targets), positions: canvas.dataset.positions };
});
try {
  await page.goto(`${baseURL}/torre_control_simulador.html`);
  await page.waitForFunction(() => Number(document.querySelector('#surfaceMap')?.dataset.targets) > 0);
  const first = await readCanvas();
  assert.ok(first.colors > 12, 'Map must not be blank');
  assert.equal(await page.locator('#weather, #speed, #pause, #restart').count(), 0,
    'Time, weather, pause and restart controls must not exist');
  assert.match(await page.locator('#motionStatus').innerText(), /tiempo real/i);
  assert.match(await page.locator('#simClock').innerText(), /^\d{2}:\d{2}:\d{2}$/);
  await page.waitForTimeout(1700);
  assert.notEqual((await readCanvas()).positions, first.positions, 'Aircraft must move');
  await page.screenshot({ path: shot('radar-desktop'), fullPage: true });
  const beforeZoom = (await readCanvas()).positions;
  await page.getByRole('button', { name: 'Acercar mapa' }).click();
  assert.notEqual((await readCanvas()).positions, beforeZoom);
  await page.getByRole('button', { name: 'Ajustar mapa' }).click();
  await page.getByRole('tab', { name: 'Eventos' }).click();
  assert.ok((await page.locator('#eventList').innerText()).trim().length > 0);
  await page.getByRole('tab', { name: 'Secuencia' }).click();
  assert.ok(await page.locator('#sequenceList button').count() > 0);
  await page.getByRole('switch', { name: 'Cerrar pista' }).check();
  assert.equal(await page.locator('#runwayState').innerText(), 'CERRADA');
  await page.getByRole('switch', { name: 'Cerrar pista' }).uncheck();
  await page.reload();
  await page.waitForFunction(() => Number(document.querySelector('#surfaceMap')?.dataset.targets) > 0);
  await page.getByRole('tab', { name: /^Tráfico/ }).click();
  await page.locator('#trafficList [data-flight="LAT317"]').click();
  await page.getByRole('button', { name: 'Mantener', exact: true }).click();
  assert.match(await page.locator('#selectedPhase').innerText(), /Manteniendo/);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Prioridad', exact: true }).click();
  assert.equal(await page.locator('#priorityFlight').getAttribute('aria-pressed'), 'true');
  await page.getByRole('searchbox').fill('NOT-A-FLIGHT');
  assert.match(await page.locator('#trafficList').innerText(), /No se encontraron/);
  await page.getByRole('searchbox').fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
  assert.ok((await readCanvas()).colors > 12);
  await page.screenshot({ path: shot('radar-mobile'), fullPage: true });
  const liveTimeBounds = await page.locator('.live-time').evaluate(item => {
    const r = item.getBoundingClientRect(); return { x: r.x, right: r.right };
  });
  assert.ok(liveTimeBounds.x >= 0 && liveTimeBounds.right <= 390);

  if (process.env.RADAR_LOGIN_PASSWORD) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(baseURL);
    await page.locator('#loginDni').fill(process.env.RADAR_LOGIN_DNI || '12345678');
    await page.locator('#loginPassword').fill(process.env.RADAR_LOGIN_PASSWORD);
    await page.locator('#loginSubmitButton').click();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#globalSearch').fill('SKY');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    assert.equal(await page.locator('#vuelos').isVisible(), true);
    assert.ok(await page.locator('#flightRowsFull tr').count() > 0);
    await page.locator('#globalSearch').fill('');
    await page.locator('button[data-view="reportes"]').click();
    const reports = await page.locator('#reportes').innerText();
    assert.match(reports, /Reporte diario de vuelos/);
    await page.locator('button[data-view="trafico"]').click();
    const radar = page.frameLocator('#towerSimulatorFrame');
    await radar.locator('#sourceStatus').filter({ hasText: 'Vuelos de AeroControl' }).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#runwayStat').innerText(), await radar.locator('#surfaceMap').getAttribute('data-runway-occupants'));
    assert.equal(await radar.locator('#weather, #speed, #pause, #restart').count(), 0);
    await page.screenshot({ path: shot('radar-integrated'), fullPage: true });
    await page.locator('button[data-view="reportes"]').click();
    assert.match(await page.locator('#reportes').innerText(), /Reporte diario de vuelos/);
    for (const view of ['dashboard', 'vuelos', 'reportes', 'trafico', 'dashboard', 'trafico']) {
      await page.locator(`button[data-view="${view}"]`).click();
      await page.waitForTimeout(100);
    }
    await radar.locator('#surfaceMap').waitFor({ state: 'visible' });
    const beforeHidden = await radar.locator('#surfaceMap').getAttribute('data-positions');
    await page.locator('button[data-view="dashboard"]').click();
    await page.waitForTimeout(1200);
    await page.locator('button[data-view="trafico"]').click();
    await radar.locator('#surfaceMap').waitFor({ state: 'visible' });
    assert.notEqual(await radar.locator('#surfaceMap').getAttribute('data-positions'), beforeHidden,
      'Radar must keep advancing while another dashboard section is open');
    const radarCodes = await radar.locator('#trafficList [data-flight]').evaluateAll(rows => rows.map(row => row.dataset.flight).sort());
    await page.locator('button[data-view="vuelos"]').click();
    const systemCodes = await page.locator('#flightRowsFull tr[data-flight-detail] td:first-child strong')
      .evaluateAll(cells => cells.map(cell => cell.textContent.trim()).sort());
    assert.deepEqual(radarCodes, systemCodes, 'Radar traffic must come from the registered system flights');
    await page.locator('button[data-view="trafico"]').click();
    assert.equal(await radar.locator('#notice').isVisible(), false, 'No false radar startup warning after view changes');
    assert.ok((await radar.locator('#surfaceMap').evaluate(canvas => Number(canvas.dataset.targets))) > 0);
  }
  assert.deepEqual(errors, [], 'No JavaScript runtime errors');
  console.log('PASS: desktop/mobile canvas, automatic real-time motion, fixed controls, zoom, tabs, closure, hold, priority, search, integration and reports.');
} catch (error) {
  await page.screenshot({ path: shot('radar-failure'), fullPage: true });
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
