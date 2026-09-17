// Gate de salud del ambiente: si el núcleo no responde sano, no se genera carga (un rojo después sería del ambiente, no del SUT).
// Uso: k6 run framework/salud.js
import { check } from 'k6';
import { api } from '../lib/common.js';

export const options = { iterations: 1, vus: 1, thresholds: { checks: ['rate==1'] } };

export default function () {
  const r = api('GET', '/api/core/health', { name: 'GET /health' });
  check(r, {
    'health 200': (x) => x.status === 200,
    'estado ok': (x) => x.status === 200 && x.json('estado') === 'ok',
    'base de datos conectada': (x) => x.status === 200 && x.json('base_de_datos') === 'conectada',
  });
}
