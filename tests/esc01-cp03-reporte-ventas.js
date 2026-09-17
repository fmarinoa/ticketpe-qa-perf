// TC-PERF-03 · ESC01-CP03 · El reporte de ventas del evento con más ventas responde en menos de 2 s
// Base: R3 Performance.tsv · README L335 · RSK-22 · P2 / Medio
// Tipo (ISTQB CT-PT): Performance test · Condición: 1 VU, 20 peticiones secuenciales
// Precondición: evento con mayor totales.aforo_vendido en GET /api/core/reportes/ventas.
// Oráculo: cada respuesta < 2 s. "Una sola consulta, sin N+1" no es observable desde caja negra: se registra, no se evalúa.
import { check } from 'k6';
import { api, login, eventos, networkBaseline, SMOKE, ADMIN } from '../lib/common.js';
import { informe, STATS } from '../lib/informe.js';

export const options = {
  tags: { tc: 'TC-PERF-03', escenario: 'ESC01-CP03', prioridad: 'P2', severidad: 'Medio' },
  scenarios: { reporte: { executor: 'per-vu-iterations', exec: 'reporte', vus: 1, iterations: SMOKE ? 2 : 20, maxDuration: '5m' } },
  summaryTrendStats: STATS,
  thresholds: {
    'http_req_duration{name:GET /reportes/ventas}': ['max<2000'],
    'checks{scenario:reporte}': ['rate==1'], // una respuesta rápida pero fallida no es una muestra válida
  },
};

const ventas = (token, id, name = 'GET /reportes/ventas') => api('GET', `/api/core/reportes/ventas?evento_id=${id}`, { token, name });

export const handleSummary = (data) => informe(data, options, 'El reporte de ventas del evento con más ventas responde en menos de 2 s');

// Admin: único rol que ve el reporte de cualquier evento (solo lectura) -> permite elegir el de más ventas.
export function setup() {
  networkBaseline();
  const token = login(ADMIN).token;
  const grande = eventos()
    .map((e) => ({ id: e.id, vendido: ventas(token, e.id, 'setup reportes').json('totales.aforo_vendido') }))
    .reduce((a, b) => (b.vendido > a.vendido ? b : a));
  console.log(`Evento con más ventas: ${grande.id} (aforo_vendido ${grande.vendido})`);
  return { token, id: grande.id };
}

export function reporte({ token, id }) {
  check(ventas(token, id), { 'reporte 200 con totales': (x) => x.status === 200 && x.json('totales') !== undefined });
}
