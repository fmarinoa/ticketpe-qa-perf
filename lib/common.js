// Capa común del framework: configuración de entorno, cliente HTTP etiquetado,
// datos de prueba (cuentas) y perfiles de carga. Los scripts de tests/ solo declaran
// el caso (perfil + oráculo); todo lo transversal vive aquí.
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const E = __ENV;
export const BASE = E.BASE_URL || 'https://testathon.testingperu.com';
export const SMOKE = E.PROFILE === 'smoke';
// Identidad del equipo, sin fallback: nunca se usa un token compartido ni los datos de otro equipo.
export const TEAM_TOKEN = E.TEAM_TOKEN; // token de "espacio" del agente: define cuota y límite de tasa
export const TEAM = E.TEAM; // rama del equipo -> prefijo de las cuentas creadas (perf-<rama>-…)

// Criterio de entrada: variables obligatorias del caso definidas.
export function exigirEnv(...nombres) {
  const faltan = nombres.filter((n) => !E[n]);
  if (faltan.length) throw new Error(`Criterio de entrada: definir ${faltan.join(', ')} (.env)`);
}
export const ADMIN = { correo: E.ADMIN_EMAIL || 'admin@ticketpe.demo', password: E.ADMIN_PASS || 'admin123' };

// Perfil A-75: warm-up descartado + ventana de medición. Los umbrales filtran {scenario:steady}.
// PROFILE=smoke => shakedown de 1 VU para validar el script antes de cargar el entorno compartido.
export function loadProfile(exec, vus, duration, warmup = '30s') {
  if (SMOKE) [vus, duration, warmup] = [1, '20s', '5s'];
  return {
    warmup: { executor: 'constant-vus', exec, vus, duration: warmup, gracefulStop: '0s' },
    steady: { executor: 'constant-vus', exec, vus, duration, startTime: warmup },
  };
}

// Criterio de suspensión: >10 % de error sostenido aborta la corrida (entorno compartido, no se castiga a otros equipos).
export const SUSPENSION = { http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '30s' }] };

export function api(method, path, { body, token, name, headers = {}, expected, timeout } = {}) {
  const params = { headers: { 'Content-Type': 'application/json', ...headers }, tags: { name: name || `${method} ${path}` } };
  if (token) params.headers.Authorization = `Bearer ${token}`;
  if (expected) params.responseCallback = http.expectedStatuses(...expected);
  if (timeout) params.timeout = timeout;
  return http.request(method, BASE + path, body ? JSON.stringify(body) : null, params);
}

export function login({ correo, password }) {
  const r = api('POST', '/api/core/auth/login', { body: { correo, password }, name: 'setup login' });
  if (r.status !== 200) throw new Error(`Criterio de entrada: login ${correo} -> ${r.status} ${r.body}`);
  return r.json();
}

export function registro() {
  const correo = `perf-${TEAM}-${Date.now()}-${__VU}-${Math.floor(Math.random() * 1e9)}@ticketpe.test`;
  const r = api('POST', '/api/core/auth/registro', { body: { nombre: 'Perf k6', correo, password: 'perf123456' }, name: 'datos registro' });
  if (r.status !== 201) throw new Error(`registro -> ${r.status} ${r.body}`);
  return r.json().token;
}


export const eventos = () => api('GET', '/api/core/eventos?limite=200', { name: 'setup eventos' }).json().eventos;

// A-77: latencia de red base desde el cliente de carga (1 VU secuencial); la p50 es `med` de red_base_ms en el summary.
const redBase = new Trend('red_base_ms', true);
export function networkBaseline(segundos = 5) {
  for (const fin = Date.now() + segundos * 1000; Date.now() < fin; )
    redBase.add(api('GET', '/api/core/health', { name: 'baseline health' }).timings.duration);
}

export const think = (min = 1, max = 3) => min + Math.random() * (max - min);

// Agente IA. 429 = cupo del espacio ocupado (el token compartido lo usan 22 equipos): no es una muestra de latencia,
// se reintenta respetando Retry-After y se contabiliza aparte para el informe (contaminación del entorno).
const rechazos429 = new Counter('agente_429_reintentados');
export const MENSAJES = ['¿Qué eventos hay en Lima?', '¿Qué conciertos hay en Arequipa?', 'Busca eventos en Trujillo', '¿Qué eventos hay en Cusco?'];

export function agente(path, mensaje, { replay = false, token = TEAM_TOKEN, intentos = 10 } = {}) {
  const headers = { ...(replay && { 'X-Replay-Mode': 'on' }) };
  for (let i = 0; i < intentos; i++) {
    const r = api('POST', path, { token, headers, body: { mensaje }, name: `POST ${path}`, expected: [200, 429], timeout: '60s' });
    if (r.status !== 429) return r;
    rechazos429.add(1);
    sleep(Number(r.headers['Retry-After']) || 5);
  }
  return null;
}

export const traza = (id, token = TEAM_TOKEN) => api('GET', `/api/v1/traces/${id}`, { token, name: 'GET /traces/:id' }).json('traza');
export const cuota = (token = TEAM_TOKEN) => api('GET', '/api/v1/quota', { token, name: 'GET /quota' }).json('tokens_restantes');

// SSE: `data: {"delta"}`... `data: {"final": ChatResponse}` `data: [DONE]`.
export const finalSSE = (body) => {
  const l = String(body).split('\n').find((x) => x.startsWith('data: {"final"'));
  return l && JSON.parse(l.slice(6)).final;
};
