// TC-PERF-05 · ESC02-CP04 · Tiempo al primer token del chat con IA real
// Base: R2 §6 A-75 [SUPUESTO A-84: 20 turnos por medición] · HU-E7.4 · P1 / Medio
// Tipo (ISTQB CT-PT): Load test (concurrencia = tope del espacio) · Condición: 4 VUs, 20 turnos, sin X-Replay-Mode
// Oráculo: TTFT p95 < 3 s, error < 1 %, 4 VUs, 20 turnos.
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { agente, finalSSE, networkBaseline, MENSAJES, SMOKE } from '../lib/common.js';

// ponytail: k6 core no lee SSE incremental; TTFB (timings.waiting) es el primer byte del stream visto por el cliente.
// Si el servidor retiene cabeceras hasta el primer delta, TTFB == TTFT; se contrasta con usage.ttft_ms del servidor.
// Upgrade: xk6-sse si TTFB y ttft_ms divergen de forma sistemática.
const ttftCliente = new Trend('ttft_cliente_ms', true);
const ttftServidor = new Trend('ttft_servidor_ms', true);
const turnoFallido = new Rate('turno_fallido');
const medidos = new Counter('turnos_medidos');
const TURNOS = SMOKE ? 2 : 20;

export const options = {
  tags: { tc: 'TC-PERF-05', escenario: 'ESC02-CP04', prioridad: 'P1', severidad: 'Medio' },
  scenarios: { turnos: { executor: 'shared-iterations', vus: SMOKE ? 1 : 4, iterations: TURNOS, maxDuration: '15m' } },
  thresholds: {
    ttft_cliente_ms: ['p(95)<3000'],
    ttft_servidor_ms: ['p(95)<3000'],
    turno_fallido: ['rate<0.01'],
    turnos_medidos: [`count>=${TURNOS}`], // sin muestras un p95 "pasa" en vacío
  },
};

export const setup = () => networkBaseline();

export default function () {
  const r = agente('/api/v1/chat/stream', MENSAJES[__ITER % MENSAJES.length]);
  const fin = r && r.status === 200 && finalSSE(r.body);
  turnoFallido.add(!fin);
  if (!check(fin, { 'stream 200 con evento final y trace_id': (f) => !!(f && f.trace_id) })) return;
  medidos.add(1);
  ttftCliente.add(r.timings.waiting, { trace_id: fin.trace_id });
  if (fin.usage && fin.usage.ttft_ms != null) ttftServidor.add(fin.usage.ttft_ms);
}
