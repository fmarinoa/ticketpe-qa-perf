// TC-PERF-06 · ESC02-CP06 · El modo réplica responde en menos de 200 ms sin gastar cuota
// Base: R3 Performance.tsv · README L338 · RSK-22 · P2 / Bajo
// Tipo (ISTQB CT-PT): Performance test · Condición: 1 VU, 20 turnos con X-Replay-Mode: on
// Precondición: mensaje cuyo trace en réplica tiene runtime.replay_miss false · tokens_restantes leído de GET /api/v1/quota.
// Oráculo: cada respuesta < 200 ms · cada trace con runtime.replay_mode true · tokens_restantes sin cambios.
// Requiere TEAM_TOKEN propio: la cuota del token compartido la mueven los otros equipos y el oráculo no sería falsable.
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { agente, traza, cuota, networkBaseline, exigirEnv, MENSAJES, SMOKE } from '../lib/common.js';

const replica = new Trend('replica_ms', true);
const medidas = new Counter('replicas_medidas');
const replayMode = new Rate('trace_replay_mode_true');
const cuotaIntacta = new Rate('cuota_sin_cambios');

export const options = {
  tags: { tc: 'TC-PERF-06', escenario: 'ESC02-CP06', prioridad: 'P2', severidad: 'Bajo' },
  scenarios: { turnos: { executor: 'per-vu-iterations', vus: 1, iterations: SMOKE ? 2 : 20, maxDuration: '5m' } },
  thresholds: {
    replica_ms: ['max<200'],
    replicas_medidas: ['count>0'], // sin muestras el max "pasa" en vacío
    trace_replay_mode_true: ['rate==1'],
    cuota_sin_cambios: ['rate==1'],
    checks: ['rate==1'], // una réplica que no responde 200 incumple "cada respuesta llega"
  },
};

export function setup() {
  exigirEnv('TEAM_TOKEN');
  networkBaseline();
  const mensaje = MENSAJES.find((m) => {
    const r = agente('/api/v1/chat', m, { replay: true });
    const t = r && r.status === 200 && traza(r.json('trace_id'));
    return t && t.runtime.replay_miss === false;
  });
  if (!mensaje) throw new Error('Criterio de entrada: ningún mensaje de MENSAJES tiene hit en el corpus de réplica (replay_miss false)');
  const tokens = cuota();
  console.log(`Mensaje en corpus: "${mensaje}" · tokens_restantes inicial ${tokens}`);
  return { mensaje, tokens };
}

export default function ({ mensaje }) {
  const r = agente('/api/v1/chat', mensaje, { replay: true });
  if (!check(r, { 'réplica 200 con trace_id': (x) => !!(x && x.status === 200 && x.json('trace_id')) })) return;
  medidas.add(1);
  replica.add(r.timings.duration, { trace_id: r.json('trace_id') });
  const t = traza(r.json('trace_id'));
  replayMode.add(!!(t && t.runtime.replay_mode === true), { trace_id: r.json('trace_id') });
}

export function teardown({ tokens }) {
  const final = cuota();
  console.log(`tokens_restantes: ${tokens} -> ${final}`);
  cuotaIntacta.add(final === tokens);
}
