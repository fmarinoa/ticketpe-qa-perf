// TC-PERF-04 · ESC02-CP04 · El primer token del chat con inferencia real llega en menos de 3 s
// Base: R3 Performance.tsv · README L336 · RSK-22 · P2 / Medio
// Tipo (ISTQB CT-PT): Performance test · Condición: 1 turno a la vez, 10 turnos, sin X-Replay-Mode
// Oráculo (sin percentil, se exige en cada turno): primer "delta" < 3 s desde el envío y usage.ttft_ms del "final" < 3000.
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { agente, finalSSE, networkBaseline, exigirEnv, MENSAJES, SMOKE } from '../lib/common.js';

// ponytail: k6 core no lee SSE incremental y xk6-sse no está en el registro de extensiones de k6 2.x.
// El primer "delta" se aproxima con el TTFB (timings.waiting), que es su cota inferior: si el servidor envía
// las cabeceras antes del primer delta, el TTFB subestima. Se contrasta turno a turno con usage.ttft_ms.
// Upgrade: binario xk6 con xk6-sse si el TTFB y ttft_ms divergen.
const ttftCliente = new Trend('ttft_cliente_ms', true);
const ttftServidor = new Trend('ttft_servidor_ms', true);
const medidos = new Counter('turnos_medidos');
const TURNOS = SMOKE ? 2 : 10;

export const options = {
  tags: { tc: 'TC-PERF-04', escenario: 'ESC02-CP04', prioridad: 'P2', severidad: 'Medio' },
  scenarios: { turnos: { executor: 'per-vu-iterations', vus: 1, iterations: TURNOS, maxDuration: '15m' } },
  thresholds: {
    ttft_cliente_ms: ['max<3000'],
    ttft_servidor_ms: ['max<3000'],
    turnos_medidos: [`count>=${TURNOS}`], // un turno sin evento final no deja muestra: sin esto el max "pasa" en vacío
  },
};

export function setup() {
  exigirEnv('TEAM_TOKEN');
  networkBaseline();
}

export default function () {
  const r = agente('/api/v1/chat/stream', MENSAJES[__ITER % MENSAJES.length]);
  const fin = r && r.status === 200 && finalSSE(r.body);
  if (!check(fin, { 'stream 200 con evento final y usage.ttft_ms': (f) => !!(f && f.usage && f.usage.ttft_ms != null) })) return;
  medidos.add(1);
  ttftCliente.add(r.timings.waiting, { trace_id: fin.trace_id });
  ttftServidor.add(fin.usage.ttft_ms, { trace_id: fin.trace_id });
}
