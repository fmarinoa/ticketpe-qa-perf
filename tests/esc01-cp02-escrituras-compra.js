// TC-PERF-02 · ESC01-CP02 · Las escrituras del núcleo cumplen p95 menor a 1 s
// Base: R3 Performance.tsv · README L334 · R2 N-01, N-02 · RSK-22 · P2 / Alto
// Tipo (ISTQB CT-PT): Load test · Condición: 3 VUs, 2 min, 1 iteración cada 5 s por VU (~70 compras con cupo real)
// Precondición: tipo de entrada con disponible >= 300 · cada iteración registra un asistente nuevo (no se mide).
// Oráculo: p95 de reserva, pago y check-in < 1 s · tasa de error < 1 % · ninguna respuesta 5xx.
// Datos: el setup() recorre el catálogo y elige el evento futuro con venta abierta cuyo tipo tenga más disponible (>= 300).
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { api, login, exigirEnv, registro, eventos, networkBaseline, SUSPENSION, SMOKE, ADMIN } from '../lib/common.js';
import { informe, STATS } from '../lib/informe.js';

const errorNucleo = new Rate('error_escrituras'); // solo reserva/pago/check-in: el registro no se mide
const respuesta5xx = new Rate('respuesta_5xx');

export const options = {
  tags: { tc: 'TC-PERF-02', escenario: 'ESC01-CP02', prioridad: 'P2', severidad: 'Alto' },
  scenarios: {
    compra: { executor: 'constant-arrival-rate', exec: 'compra', rate: SMOKE ? 1 : 3, timeUnit: '5s', duration: SMOKE ? '20s' : '2m', preAllocatedVUs: SMOKE ? 1 : 3, maxVUs: SMOKE ? 1 : 3 },
  },
  summaryTrendStats: STATS,
  thresholds: {
    ...SUSPENSION,
    error_escrituras: ['rate<0.01'],
    respuesta_5xx: ['rate==0'],
    'http_req_duration{name:POST /reservas}': ['p(95)<1000'],
    'http_req_duration{name:POST /reservas/:id/pago}': ['p(95)<1000'],
    'http_req_duration{name:POST /checkin}': ['p(95)<1000'],
  },
};

export const handleSummary = (data) => informe(data, options, 'Las escrituras del núcleo cumplen p95 menor a 1 s');

export function setup() {
  exigirEnv('TEAM');
  networkBaseline();
  // Mayor margen de cupo: los reset de semilla y las compras de otros equipos cambian la disponibilidad entre corridas.
  const [mejor] = eventos()
    .filter((e) => new Date(e.fecha_inicio) > new Date())
    .flatMap((e) => api('GET', `/api/core/eventos/${e.id}/disponibilidad`, { name: 'setup disponibilidad' }).json('disponibilidad').map((t) => ({ eventoId: e.id, evento: e.nombre, ...t })))
    .filter((t) => t.venta_abierta && t.disponible >= 300)
    .sort((a, b) => b.disponible - a.disponible);
  if (!mejor) throw new Error('Criterio de entrada: ningún evento futuro con venta abierta tiene un tipo de entrada con disponible >= 300');
  console.log(`Evento bajo prueba: ${mejor.eventoId} ${mejor.evento} · tipo ${mejor.nombre} · disponible ${mejor.disponible}`);
  return { adminToken: login(ADMIN).token, eventoId: mejor.eventoId, evento: mejor.evento, tipo: mejor.nombre, disponible_inicial: mejor.disponible };
}

const medir = (r) => (errorNucleo.add(r.status >= 400), respuesta5xx.add(r.status >= 500), r);

export function compra({ adminToken, eventoId, tipo }) {
  const token = registro();
  const key = `perf-${__VU}-${__ITER}-${Date.now()}`;

  const r = medir(api('POST', '/api/core/reservas', { token, name: 'POST /reservas', body: { evento_id: eventoId, tipo, cantidad: 1 }, headers: { 'Idempotency-Key': key } }));
  if (!check(r, { 'reserva 201': (x) => x.status === 201 })) return;

  const p = medir(api('POST', `/api/core/reservas/${r.json('reserva.id')}/pago`, { token, name: 'POST /reservas/:id/pago', body: { tarjeta_prueba: '4242424242424242' }, headers: { 'Idempotency-Key': `${key}-pago` } }));
  if (!check(p, { 'pago 201': (x) => x.status === 201 })) return;

  const c = medir(api('POST', '/api/core/checkin', { token: adminToken, name: 'POST /checkin', body: { codigo_qr: p.json('entradas.0.codigo_qr') } }));
  check(c, { 'checkin 200': (x) => x.status === 200 });
}
