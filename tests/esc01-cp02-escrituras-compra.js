// TC-PERF-02 · ESC01-CP02 · Escrituras de reserva, pago y check-in bajo concurrencia
// Base: R2 §6 A-75/A-76 · HU-E3.2, HU-E3.3, HU-E5.1 · P1 / Alto
// Tipo (ISTQB CT-PT): Load + Concurrency test · Condición: 20 VUs, 5 min, 30 s warm-up descartado
// Oráculo: p95 < 1 s y error < 1 % por endpoint, y 0 sobreventas (cupo_vendido <= cupo_total al cierre).
// Datos: evento del organizador del equipo (TEAM) -> no se contamina el evento de otro equipo.
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { api, registro, organizadorEquipo, eventos, detalleEvento, networkBaseline, loadProfile, SUSPENSION, think } from '../lib/common.js';

const sobreventas = new Counter('sobreventas');
const sinCupo = new Counter('reservas_409_sin_cupo');
const emitidas = new Counter('entradas_emitidas');

export const options = {
  tags: { tc: 'TC-PERF-02', escenario: 'ESC01-CP02', prioridad: 'P1', severidad: 'Alto' },
  scenarios: loadProfile('compra', 20, '5m'),
  thresholds: {
    ...SUSPENSION,
    'http_req_failed{scenario:steady}': ['rate<0.01'],
    'http_req_duration{scenario:steady,name:POST /reservas}': ['p(95)<1000'],
    'http_req_duration{scenario:steady,name:POST /reservas/:id/pago}': ['p(95)<1000'],
    'http_req_duration{scenario:steady,name:POST /checkin}': ['p(95)<1000'],
    sobreventas: ['count==0'],
  },
};

const conCupo = (d) => d.tipos_entrada.filter((t) => t.cupo_total > t.cupo_vendido);

export function setup() {
  networkBaseline();
  const org = organizadorEquipo();
  const propio = eventos()
    .map((e) => detalleEvento(e.id))
    .find((d) => d.evento.organizador_id === org.usuario.id && new Date(d.evento.fecha_inicio) > new Date() && conCupo(d).length);
  if (!propio) throw new Error(`Criterio de entrada: el organizador de ${org.usuario.correo} no tiene evento futuro con cupo`);
  console.log(`Evento bajo prueba: ${propio.evento.id} ${propio.evento.nombre} · cupo libre inicial ${conCupo(propio).map((t) => `${t.nombre}=${t.cupo_total - t.cupo_vendido}`)}`);
  return { orgToken: org.token, eventoId: propio.evento.id, tipos: conCupo(propio).map((t) => t.nombre) };
}

export function compra({ orgToken, eventoId, tipos }) {
  // Un comprador nuevo por iteración: aísla la medición del tope de 4 entradas por persona (HU-E3.2).
  const token = registro();
  const tipo = tipos[Math.floor(Math.random() * tipos.length)];
  const key = `perf-${__VU}-${__ITER}-${Date.now()}`;

  // 409 = sin cupo: respuesta de negocio correcta al agotar el evento, no un error de la corrida.
  const r = api('POST', '/api/core/reservas', { token, name: 'POST /reservas', body: { evento_id: eventoId, tipo, cantidad: 1 }, headers: { 'Idempotency-Key': key }, expected: [{ min: 200, max: 299 }, 409] });
  if (r.status === 409) return sinCupo.add(1), sleep(think());
  if (!check(r, { 'reserva 201': (x) => x.status === 201 })) return sleep(think());
  sleep(think());

  const p = api('POST', `/api/core/reservas/${r.json('reserva.id')}/pago`, { token, name: 'POST /reservas/:id/pago', body: { tarjeta_prueba: '4242424242424242' }, headers: { 'Idempotency-Key': `${key}-pago` } });
  if (!check(p, { 'pago 201': (x) => x.status === 201 })) return sleep(think());
  const n = p.json('entradas').length;
  emitidas.add(n);
  // Emitir más entradas que las reservadas/cobradas es sobreventa: consume cupo que nadie pagó.
  if (!check(n, { 'pago emite exactamente 1 entrada por 1 reservada': (x) => x === 1 })) sobreventas.add(n - 1, { motivo: 'entradas_extra' });
  sleep(think());

  const c = api('POST', '/api/core/checkin', { token: orgToken, name: 'POST /checkin', body: { codigo_qr: p.json('entradas.0.codigo_qr') } });
  check(c, { 'checkin 200': (x) => x.status === 200 });
  sleep(think());
}

// Oráculo de integridad al cierre: ningún tipo de entrada vendió más que su cupo.
export function teardown({ eventoId }) {
  const d = detalleEvento(eventoId);
  const disp = api('GET', `/api/core/eventos/${eventoId}/disponibilidad`, { name: 'teardown disponibilidad' }).json('disponibilidad');
  for (const t of d.tipos_entrada) if (t.cupo_vendido > t.cupo_total) sobreventas.add(1, { tipo: t.nombre });
  for (const t of disp) if (t.disponible < 0) sobreventas.add(1, { tipo: t.nombre });
  console.log(`Cierre evento ${eventoId}: ${d.tipos_entrada.map((t) => `${t.nombre} ${t.cupo_vendido}/${t.cupo_total}`).join(' · ')}`);
}
