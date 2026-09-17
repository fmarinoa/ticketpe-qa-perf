// TC-PERF-05 · ESC02-CP05 · Un turno con una llamada a herramienta cumple p95 menor a 8 s
// Base: R3 Performance.tsv · README L337 · RSK-22 · P2 / Medio
// Tipo (ISTQB CT-PT): Performance test · Condición: 1 VU, 20 turnos, sin X-Replay-Mode
// Oráculo: p95 del tiempo medido en el cliente, contando solo los turnos con totals.tool_calls = 1 en su trace, < 8 s.
// Se registra (sin umbral) cuántos turnos tuvieron una cantidad de tool_calls distinta de 1: `turno_fuera_de_clase`.
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { agente, traza, networkBaseline, exigirEnv, SMOKE } from '../lib/common.js';

const MENSAJE = '¿Qué eventos hay en Cusco?';
const turno1Tool = new Trend('turno_1_herramienta_ms', true);
const fueraDeClase = new Counter('turno_fuera_de_clase');
const enClase = new Counter('turnos_en_clase');

export const options = {
  tags: { tc: 'TC-PERF-05', escenario: 'ESC02-CP05', prioridad: 'P2', severidad: 'Medio' },
  scenarios: { turnos: { executor: 'per-vu-iterations', vus: 1, iterations: SMOKE ? 2 : 20, maxDuration: '15m' } },
  thresholds: {
    turno_1_herramienta_ms: ['p(95)<8000'],
    turnos_en_clase: ['count>0'], // sin turnos en clase el p95 "pasa" en vacío
  },
};

export function setup() {
  exigirEnv('TEAM_TOKEN');
  networkBaseline();
}

export default function () {
  const r = agente('/api/v1/chat', MENSAJE);
  if (!check(r, { 'chat 200 con trace_id': (x) => !!(x && x.status === 200 && x.json('trace_id')) })) return;
  const id = r.json('trace_id');
  const t = traza(id);
  const tools = t && t.totals ? t.totals.tool_calls : 'sin_traza';
  if (tools !== 1) return fueraDeClase.add(1, { tool_calls: String(tools), trace_id: id });
  enClase.add(1);
  turno1Tool.add(r.timings.duration, { trace_id: id });
}
