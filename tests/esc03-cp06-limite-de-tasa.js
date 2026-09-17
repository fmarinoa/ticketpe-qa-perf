// TC-PERF-03 · ESC03-CP06 · Pasado el límite de tasa responde 429 y no se cuelga
// Base: R2 §6 A-79 · límite del espacio: 60 rpm / 4 concurrentes · P1 / Alto
// Tipo (ISTQB CT-PT): Stress test sobre el límite · Condición: 8 VUs concurrentes sin think time, 2 min
// Pacing 1 s por VU (~8 rps = 480 rpm): supera ambos topes sin martillar el entorno compartido.
// Oráculo: exceso => 429 con cuerpo de error + Retry-After; 0 respuestas 5xx; 0 conexiones abiertas > 30 s;
// y aceptadas (200) <= 60 rpm (si pasan más, el exceso NO recibió 429).
// Contrato real (Swagger /api/docs, schema Error): {error, mensaje}. A-79 dice {codigo, mensaje} -> se valida Swagger
// y se reporta la divergencia del AC.
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { api, networkBaseline, exigirTokenPropio, TEAM_TOKEN, SMOKE } from '../lib/common.js';

const aceptadas = new Counter('respuestas_200');
const limitadas = new Counter('respuestas_429');
const fueraContrato = new Rate('respuesta_fuera_de_contrato'); // 5xx, timeout, cualquier otro código
const contrato429 = new Rate('contrato_429_ok');

export const options = {
  tags: { tc: 'TC-PERF-03', escenario: 'ESC03-CP06', prioridad: 'P1', severidad: 'Alto' },
  scenarios: { exceso: { executor: 'constant-vus', vus: 8, duration: SMOKE ? '20s' : '2m' } },
  thresholds: {
    respuesta_fuera_de_contrato: ['rate==0'],
    contrato_429_ok: ['rate==1'],
    respuestas_429: ['count>0'],
    respuestas_200: ['rate<=1'], // 60 rpm = 1 rps sostenido en la ventana
    'http_req_duration{name:POST /api/v1/chat}': ['max<30000'],
  },
};

export function setup() {
  exigirTokenPropio();
  networkBaseline();
}

// Modo réplica por defecto: el límite aplica igual y no se quema cuota de inferencia real (REPLAY=off para IA real).
export default function () {
  const r = api('POST', '/api/v1/chat', {
    token: TEAM_TOKEN,
    name: 'POST /api/v1/chat',
    body: { mensaje: '¿Qué eventos hay en Lima?' },
    headers: __ENV.REPLAY === 'off' ? {} : { 'X-Replay-Mode': 'on' },
    expected: [200, 429],
    timeout: '31s',
  });
  sleep(1);
  fueraContrato.add(![200, 429].includes(r.status), { status: String(r.status) });
  if (r.status === 200) aceptadas.add(1);
  if (r.status !== 429) return;
  limitadas.add(1);
  const ok = check(r, {
    '429 con Retry-After': (x) => Number(x.headers['Retry-After']) > 0,
    '429 con {error, mensaje} (Swagger)': (x) => !!(x.json('error') && x.json('mensaje')),
  });
  check(r, { '429 con {codigo, mensaje} (A-79, informativo)': (x) => !!(x.json('codigo') && x.json('mensaje')) });
  contrato429.add(ok, { error: String(r.json('error')) });
}
