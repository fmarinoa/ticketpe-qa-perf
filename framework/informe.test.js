// Verificación del TAS (sin red): el análisis automático no debe disfrazar un fallo ni inventar un PASA.
// Si informe.js clasificara mal, el veredicto publicado culparía (o absolvería) al SUT. Uso: k6 run framework/informe.test.js
import { check } from 'k6';
import { informe } from '../lib/informe.js';

export const options = { iterations: 1, vus: 1, thresholds: { checks: ['rate==1'] } };

const opts = { tags: { tc: 'TC-PERF-99', escenario: 'ESC99-CP99', prioridad: 'P2', severidad: 'Alto' }, scenarios: { s: { executor: 'constant-vus', vus: 20, duration: '5m' } } };
const trend = (p95, count, ok) => ({ type: 'trend', contains: 'time', values: { med: p95 / 2, 'p(95)': p95, count }, thresholds: { 'p(95)<500': { ok } } });
const datos = (metricas, extra = {}) => ({
  state: { testRunDurationMs: 1000 },
  setup_data: { eventoId: 13, adminToken: 'secreto-no-publicar' },
  metrics: { red_base_ms: { type: 'trend', contains: 'time', values: { med: 100, 'p(95)': 110 } }, ...metricas },
  ...extra,
});
const archivo = (r, sufijo) => r[Object.keys(r).find((k) => k.endsWith(sufijo))];
const html = (r) => archivo(r, '-informe.html');
const titulo = (r) => html(r).match(/<title>([^<]*)/)[1];

export default function () {
  const pasa = informe(datos({ lat: trend(300, 50, true) }), opts, 't', 'full');
  const falla = informe(datos({ lat: trend(900, 50, false) }), opts, 't', 'full');
  const vacio = informe(datos({ lat: trend(0, 0, true) }), opts, 't', 'full');
  const smoke = informe(datos({ lat: trend(300, 5, true) }), opts, 't', 'smoke');
  const ruido = informe(datos({ lat: trend(300, 50, true), red_base_ms: { type: 'trend', contains: 'time', values: { med: 100, 'p(95)': 200 } } }), opts, 't', 'full');

  check(null, {
    'umbrales cumplidos con muestras => PASA': () => titulo(pasa).includes('· PASA ·'),
    'umbral incumplido => FALLA': () => titulo(falla).includes('· FALLA ·'),
    'umbral sin muestras => NO CONCLUYENTE (no pasa en vacío)': () => titulo(vacio).includes('NO CONCLUYENTE'),
    'perfil smoke => NO CONCLUYENTE': () => titulo(smoke).includes('NO CONCLUYENTE'),
    'servidor ≈ medido − p50 red base': () => html(pasa).includes('<td>300 ms</td><td>200 ms</td><td>20 %</td>'),
    'red inestable (p95/p50 > 1.5) => aviso': () => html(ruido).includes('Red inestable'),
    'FALLA => borrador de hallazgo R4': () => html(falla).includes('Borrador de hallazgo R4') && !html(pasa).includes('Borrador'),
    'nunca publica tokens de setup_data': () => ![html(pasa), archivo(pasa, '-resumen.md')].some((s) => s.includes('secreto-no-publicar')),
    'resumen markdown con veredicto': () => archivo(falla, '-resumen.md').includes('**FALLA**'),
  });
}
