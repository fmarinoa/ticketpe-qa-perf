// TC-PERF-06 · ESC02-CP05 · Turno completo con exactamente 1 llamada a herramienta
// Base: R2 §6 A-75 [SUPUESTO A-84: 20 turnos por medición] · HU-E7.1 · P2 / Medio
// Tipo (ISTQB CT-PT): Load test · Condición: 4 VUs, 20 turnos, IA real, turnos con 1 tool_call
// Oráculo: p95 < 8 s, error < 1 %, 4 VUs, 20 turnos.
// Clase de equivalencia: solo cuenta la muestra si tool_calls.length === 1 (la IA no es determinista). Cada iteración
// reintenta hasta 3 turnos para obtener uno dentro de clase; los descartados se reportan en `turno_fuera_de_clase`.
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { agente, networkBaseline, MENSAJES, SMOKE } from '../lib/common.js';

const turno1Tool = new Trend('turno_1_herramienta_ms', true);
const pasos = new Trend('turno_tokens_completion');
const turnoFallido = new Rate('turno_fallido');
const fueraDeClase = new Counter('turno_fuera_de_clase');
const medidos = new Counter('turnos_medidos');
const TURNOS = SMOKE ? 2 : 20;

export const options = {
  tags: { tc: 'TC-PERF-06', escenario: 'ESC02-CP05', prioridad: 'P2', severidad: 'Medio' },
  scenarios: { turnos: { executor: 'shared-iterations', vus: SMOKE ? 1 : 4, iterations: TURNOS, maxDuration: '15m' } },
  thresholds: {
    turno_1_herramienta_ms: ['p(95)<8000'],
    turno_fallido: ['rate<0.01'],
    turnos_medidos: [`count>=${TURNOS}`], // sin muestras un p95 "pasa" en vacío
  },
};

export const setup = () => networkBaseline();

export default function () {
  for (let intento = 0; intento < 3; intento++) {
    const r = agente('/api/v1/chat', MENSAJES[(__ITER + intento) % MENSAJES.length]);
    const ok = r && r.status === 200;
    turnoFallido.add(!ok);
    if (!check(r, { 'chat 200 con trace_id': () => ok && !!r.json('trace_id') })) return;
    const d = r.json();
    if (d.tool_calls.length !== 1) {
      fueraDeClase.add(1, { tools: String(d.tool_calls.length) });
      continue;
    }
    medidos.add(1);
    turno1Tool.add(r.timings.duration, { trace_id: d.trace_id, tool: d.tool_calls[0].name });
    if (d.usage) pasos.add(d.usage.completion_tokens);
    return;
  }
}
