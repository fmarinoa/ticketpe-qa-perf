// TC-PERF-07 · ESC03-CP07 · Pasado el límite de tasa el agente responde 429 y no se cuelga
// Base: R3 Performance.tsv · README L339 · R2 N-05 · RSK-20 · P2 / Alto
// Tipo (ISTQB CT-PT): Stress test sobre el límite
// Condición: 8 peticiones concurrentes durante 90 s con X-Replay-Mode: on (supera 60/min y 4 concurrentes sin gastar tokens).
//   Si en réplica no aplica el límite (falla `respuestas_429 count>0`), repetir con REPLAY=off: 70 mensajes cortos en 1 min con IA real.
// Oráculo: toda respuesta es 200 o 429 · cada 429 trae cuerpo Error ({error} requerido, Swagger) ·
//   ninguna petición abierta > 30 s · 60 s después de detener la carga, una petición responde 200.
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { api, networkBaseline, exigirEnv, TEAM_TOKEN, SMOKE } from '../lib/common.js';

const REAL = __ENV.REPLAY === 'off';
const limitadas = new Counter('respuestas_429');
const fueraContrato = new Rate('respuesta_fuera_de_contrato'); // 5xx, timeout, cualquier código distinto de 200/429
const cuerpoError = new Rate('cuerpo_429_error_ok');
const recuperado = new Rate('recupera_200_tras_60s');

export const options = {
  tags: { tc: 'TC-PERF-07', escenario: 'ESC03-CP07', prioridad: 'P2', severidad: 'Alto' },
  scenarios: {
    exceso: REAL
      ? { executor: 'constant-arrival-rate', rate: 70, timeUnit: '1m', duration: '1m', preAllocatedVUs: 8, maxVUs: 8 }
      : { executor: 'constant-vus', vus: 8, duration: SMOKE ? '20s' : '90s' },
  },
  teardownTimeout: '2m',
  thresholds: {
    respuesta_fuera_de_contrato: ['rate==0'],
    cuerpo_429_error_ok: ['rate==1'],
    respuestas_429: ['count>0'],
    'http_req_duration{name:POST /api/v1/chat}': ['max<30000'],
    recupera_200_tras_60s: ['rate==1'],
  },
};

const chat = (mensaje, name = 'POST /api/v1/chat') =>
  api('POST', '/api/v1/chat', { token: TEAM_TOKEN, name, body: { mensaje }, headers: REAL ? {} : { 'X-Replay-Mode': 'on' }, expected: [200, 429], timeout: '31s' });

export function setup() {
  exigirEnv('TEAM_TOKEN');
  networkBaseline();
}

export default function () {
  const r = chat(REAL ? 'Hola' : '¿Qué eventos hay en Lima?');
  fueraContrato.add(![200, 429].includes(r.status), { status: String(r.status) });
  if (r.status !== 429) return;
  limitadas.add(1);
  cuerpoError.add(check(r, { '429 con cuerpo Error {error}': (x) => typeof x.json('error') === 'string' }), { error: String(r.json('error')) });
}

export function teardown() {
  sleep(60);
  const r = chat('¿Qué eventos hay en Lima?', 'teardown recuperacion');
  recuperado.add(r.status === 200, { status: String(r.status) });
}
