// TC-PERF-04 · ESC03-CP07 · La carga de un equipo no degrada a los demás
// Base: R2 §6 A-78 · RSK-21 · P1 / Alto
// Tipo (ISTQB CT-PT): Isolation test (línea base vs bajo carga, mismo perfil de medición)
// Condición: fase 1 línea base 5 VUs GET /eventos 5 min; fase 2 equipo A (TEAM_TOKEN) satura su espacio 5 min
//            mientras 5 VUs de "otro equipo" repiten la medición. Opcional OTRO_TEAM_TOKEN: mide además el agente del equipo B.
// Oráculo: p95(bajo carga) <= 1.2 x p95(línea base) y error < 1 % en ambas fases.
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { api, networkBaseline, exigirTokenPropio, TEAM_TOKEN, SMOKE, think } from '../lib/common.js';

const FASE = SMOKE ? '30s' : '5m';
const OTRO = __ENV.OTRO_TEAM_TOKEN;
const medir = (startTime) => ({ executor: 'constant-vus', exec: 'medicion', vus: SMOKE ? 1 : 5, duration: FASE, startTime });

export const options = {
  tags: { tc: 'TC-PERF-04', escenario: 'ESC03-CP07', prioridad: 'P1', severidad: 'Alto' },
  scenarios: {
    linea_base: medir('0s'),
    bajo_carga: medir(FASE),
    saturacion_equipo_a: { executor: 'constant-vus', exec: 'saturar', vus: SMOKE ? 2 : 8, duration: FASE, startTime: FASE },
    ...(OTRO && { agente_equipo_b: { executor: 'constant-vus', exec: 'agenteOtroEquipo', vus: 1, duration: FASE, startTime: FASE } }),
  },
  thresholds: {
    'http_req_failed{scenario:linea_base}': ['rate<0.01'],
    'http_req_failed{scenario:bajo_carga}': ['rate<0.01'],
    'http_req_duration{scenario:linea_base}': ['p(95)<500'],
    'http_req_duration{scenario:bajo_carga}': ['p(95)<500'],
    ...(OTRO && { 'checks{scenario:agente_equipo_b}': ['rate==1'] }),
  },
};

export function setup() {
  exigirTokenPropio();
  networkBaseline();
}

export function medicion() {
  const r = api('GET', '/api/core/eventos', { name: 'GET /eventos' });
  check(r, { 'eventos 200': (x) => x.status === 200 });
  sleep(think(0.5, 1.5));
}

// Equipo A: 8 concurrentes sin pausa sobre su espacio (duplica el tope de 4 y supera 60 rpm). 429 es lo esperado.
export function saturar() {
  api('POST', '/api/v1/chat', { token: TEAM_TOKEN, name: 'saturacion chat', body: { mensaje: '¿Qué eventos hay en Lima?' }, headers: { 'X-Replay-Mode': 'on' }, expected: [200, 429] });
  sleep(0.2);
}

// Equipo B (opcional): dentro de su propio cupo nunca debe recibir 429 por culpa de A.
export function agenteOtroEquipo() {
  const r = api('POST', '/api/v1/chat', { token: OTRO, name: 'agente equipo B', body: { mensaje: '¿Qué eventos hay en Lima?' }, headers: { 'X-Replay-Mode': 'on' } });
  check(r, { 'equipo B no recibe 429 por la carga de A': (x) => x.status === 200 });
  sleep(3); // 20 rpm, 1 concurrente: muy por debajo de su límite
}

// k6 no compara umbrales entre escenarios: la degradación relativa (A-78) se calcula al cierre.
export function handleSummary(data) {
  const p95 = (s) => (data.metrics[`http_req_duration{scenario:${s}}`] || { values: {} }).values['p(95)'];
  const [base, carga] = [p95('linea_base'), p95('bajo_carga')];
  const degradacion = carga / base - 1;
  const veredicto = {
    tc: 'TC-PERF-04', p95_linea_base_ms: base, p95_bajo_carga_ms: carga, degradacion_pct: +(degradacion * 100).toFixed(1),
    umbral_pct: 20, resultado: base && carga && degradacion <= 0.2 ? 'PASA' : 'FALLA',
  };
  return {
    stdout: `${textSummary(data, { indent: ' ', enableColors: true })}\n\nA-78 aislamiento: ${JSON.stringify(veredicto)}\n`,
    'reports/TC-PERF-04-veredicto.json': JSON.stringify(veredicto, null, 2),
  };
}
