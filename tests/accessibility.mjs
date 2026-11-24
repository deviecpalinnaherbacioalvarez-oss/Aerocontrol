import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const DNI = process.env.A11Y_DNI || '12345678';
const PASSWORD = process.env.A11Y_PASSWORD || 'AeroControl1!';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VIEWS = ['dashboard', 'vuelos', 'programacion', 'trafico', 'recursos', 'reportes', 'perfil'];

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch {
  browser = await chromium.launch();
}
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const results = [];

async function audit(name, include) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  results.push({
    pantalla: name,
    url: page.url(),
    violaciones: violations.map(v => ({
      regla: v.id,
      impacto: v.impact,
      descripcion: v.help,
      ayuda: v.helpUrl,
      elementos: v.nodes.length,
      ejemplos: v.nodes.slice(0, 5).map(n => n.target.join(' '))
    }))
  });
}

try {
  await page.goto(baseURL, { waitUntil: 'load' });
  await audit('Login');

  await page.fill('#loginDni', DNI);
  await page.fill('#loginPassword', PASSWORD);
  await page.click('#loginSubmitButton');
  await page.waitForSelector('#appShell:not(.hidden)');

  for (const view of VIEWS) {
    await page.click(`nav button[data-view="${view}"]`);
    await page.waitForSelector(`#${view}:not(.hidden)`);
    await audit(`Vista: ${view}`);
  }

  await page.click('nav button[data-view="vuelos"]');
  await page.click('#openFlightModal');
  await page.waitForTimeout(400);
  await audit('Modal: registrar vuelo', '#flightModal');

  await page.goto(`${baseURL}/torre_control_simulador.html`, { waitUntil: 'load' });
  await audit('Radar de superficie');
} finally {
  await browser.close();
}

await mkdir('tests/artifacts', { recursive: true });
await writeFile('tests/artifacts/a11y-report.json', JSON.stringify(results, null, 2));

console.table(results.map(r => ({ pantalla: r.pantalla, violaciones: r.violaciones.length })));
const bloqueantes = results.flatMap(r => r.violaciones)
  .filter(v => v.impacto === 'critical' || v.impacto === 'serious');
if (bloqueantes.length) {
  console.error(`✗ ${bloqueantes.length} violaciones critical/serious. Ver tests/artifacts/a11y-report.json`);
  process.exit(1);
}
console.log('✓ Sin violaciones critical/serious');

