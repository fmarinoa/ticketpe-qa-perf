// TC-PERF-01 · ESC01-CP01 · Las lecturas del núcleo cumplen p95 menor a 500 ms
// Base: R3 Performance.tsv · README L333 · R2 N-01, N-02, N-03 · RSK-22 · P2 / Alto
// Tipo (ISTQB CT-PT): Load test · Condición: 20 VUs, 5 min, 30 s de warm-up descartado
// Precondición: red base = p50 de GET /api/core/health con 1 VU durante 1 min (med de red_base_ms) · cada VU con su asistente.
// Oráculo: p95 de cada endpoint < 500 ms y tasa de error < 1 %.
import { check, group, sleep } from 'k6';
import { api, registro, exigirEnv, eventos, networkBaseline, loadProfile, SUSPENSION, SMOKE, think } from '../lib/common.js';
import { informe, STATS } from '../lib/informe.js';

export const options = {
  tags: { tc: 'TC-PERF-01', escenario: 'ESC01-CP01', prioridad: 'P2', severidad: 'Alto' },
  scenarios: loadProfile('lecturas', 20, '5m'),
  setupTimeout: '2m',
  summaryTrendStats: STATS,
  thresholds: {
    ...SUSPENSION,
    'http_req_failed{scenario:steady}': ['rate<0.01'],
    'http_req_duration{scenario:steady,name:GET /eventos}': ['p(95)<500'],
    'http_req_duration{scenario:steady,name:GET /eventos/:id/disponibilidad}': ['p(95)<500'],
    'http_req_duration{scenario:steady,name:GET /mis-entradas}': ['p(95)<500'],
    'checks{scenario:steady}': ['rate>0.99'],
  },
};

export const handleSummary = (data) => informe(data, options, 'Las lecturas del núcleo cumplen p95 menor a 500 ms');

export function setup() {
  exigirEnv('TEAM');
  networkBaseline(SMOKE ? 5 : 60);
  const ids = eventos().map((e) => e.id);
  if (!ids.length) throw new Error('Criterio de entrada: catálogo vacío (¿reset de semilla?)');
  return { ids };
}

let token; // un asistente propio por VU (estado de VU en k6)

export function lecturas({ ids }) {
  token = token || registro();
  group('catalogo', () => {
    const r = api('GET', '/api/core/eventos', { name: 'GET /eventos' });
    check(r, { 'eventos 200 con lista': (x) => x.status === 200 && Array.isArray(x.json('eventos')) });
    sleep(think());

    const id = ids[Math.floor(Math.random() * ids.length)];
    const d = api('GET', `/api/core/eventos/${id}/disponibilidad`, { name: 'GET /eventos/:id/disponibilidad' });
    check(d, { 'disponibilidad 200 con tipos': (x) => x.status === 200 && Array.isArray(x.json('disponibilidad')) });
    sleep(think());
  });
  group('mis-entradas', () => {
    const m = api('GET', '/api/core/mis-entradas', { token, name: 'GET /mis-entradas' });
    check(m, { 'mis-entradas 200': (x) => x.status === 200 });
    sleep(think());
  });
}
