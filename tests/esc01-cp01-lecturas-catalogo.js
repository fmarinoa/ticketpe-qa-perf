// TC-PERF-01 · ESC01-CP01 · Lecturas de catálogo y disponibilidad bajo carga
// Base: R2 §6 A-75/A-76/A-77 · HU-E2.1, HU-E2.2, HU-E4.1 · P1 / Alto
// Tipo (ISTQB CT-PT): Load test · Condición: 20 VUs, 5 min, 30 s warm-up descartado, semilla ~5200 entradas
// Oráculo: p95 < 500 ms y error < 1 % por endpoint, medido desde el cliente.
import { check, group, sleep } from 'k6';
import { api, login, eventos, networkBaseline, loadProfile, SUSPENSION, ASISTENTE, think } from '../lib/common.js';

export const options = {
  tags: { tc: 'TC-PERF-01', escenario: 'ESC01-CP01', prioridad: 'P1', severidad: 'Alto' },
  scenarios: loadProfile('lecturas', 20, '5m'),
  thresholds: {
    ...SUSPENSION,
    'http_req_failed{scenario:steady}': ['rate<0.01'],
    'http_req_duration{scenario:steady,name:GET /eventos}': ['p(95)<500'],
    'http_req_duration{scenario:steady,name:GET /eventos/:id/disponibilidad}': ['p(95)<500'],
    'http_req_duration{scenario:steady,name:GET /mis-entradas}': ['p(95)<500'],
    'checks{scenario:steady}': ['rate>0.99'],
  },
};

export function setup() {
  networkBaseline();
  const ids = eventos().map((e) => e.id);
  if (!ids.length) throw new Error('Criterio de entrada: catálogo vacío (¿reset de semilla?)');
  return { token: login(ASISTENTE).token, ids };
}

// Perfil operacional del comprador: busca -> mira disponibilidad -> revisa sus entradas.
export function lecturas({ token, ids }) {
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
