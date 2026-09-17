// TC-PERF-07 · ESC01-CP03 · El reporte con ~5200 entradas no hace N+1
// Base: R2 §6 A-75/A-76 · HU-E5.2 · P2 / Alto
// Tipo (ISTQB CT-PT): Load + Scalability test · Condición: 5 VUs, 3 min, 30 s warm-up descartado
// Oráculo: cada respuesta < 2 s (max), error < 1 %, y el tiempo NO crece linealmente con las entradas.
// Oráculo N+1 [SUPUESTO A-85]: comparando el evento con menos vs más entradas vendidas (ratio >= 2x),
// la mediana del servidor (TTFB - red base) crece menos de la mitad que el ratio de entradas.
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { api, login, eventos, networkBaseline, loadProfile, SUSPENSION, ADMIN, think } from '../lib/common.js';

const reporteServidor = new Trend('reporte_servidor_ms', true);
const sinN1 = new Rate('reporte_sin_n_mas_1');

export const options = {
  tags: { tc: 'TC-PERF-07', escenario: 'ESC01-CP03', prioridad: 'P2', severidad: 'Alto' },
  scenarios: loadProfile('reporte', 5, '3m'),
  thresholds: {
    ...SUSPENSION,
    'http_req_failed{scenario:steady}': ['rate<0.01'],
    'http_req_duration{scenario:steady,name:GET /reportes/ventas}': ['max<2000', 'p(95)<2000'],
    reporte_sin_n_mas_1: ['rate==1'],
  },
};

const ventas = (token, id, name = 'GET /reportes/ventas') => api('GET', `/api/core/reportes/ventas?evento_id=${id}`, { token, name });

// Admin: único rol que ve el reporte de cualquier evento (solo lectura) -> permite elegir el de más entradas.
export function setup() {
  networkBaseline();
  const token = login(ADMIN).token;
  const tam = eventos()
    .map((e) => ({ id: e.id, vendido: ventas(token, e.id, 'setup reportes').json('totales.aforo_vendido') }))
    .sort((a, b) => a.vendido - b.vendido);
  const [chico, grande] = [tam[0], tam[tam.length - 1]];
  console.log(`Evento con más entradas: ${grande.id} (${grande.vendido}) · con menos: ${chico.id} (${chico.vendido}) · total semilla ${tam.reduce((s, e) => s + e.vendido, 0)}`);
  return { token, chico, grande };
}

export function reporte({ token, grande }) {
  const r = ventas(token, grande.id);
  check(r, { 'reporte 200 con totales': (x) => x.status === 200 && x.json('totales') !== undefined, 'reporte sin PII (correo)': (x) => !/@/.test(x.body) });
  sleep(think(0.5, 1.5));
}

// Prueba de escalabilidad en frío (sin carga concurrente): mediana de 15 muestras por tamaño.
export function teardown({ token, chico, grande }) {
  const red = median(Array.from({ length: 10 }, () => api('GET', '/api/core/health', { name: 'teardown health' }).timings.waiting));
  const t = (e) => Math.max(1, median(Array.from({ length: 15 }, () => ventas(token, e.id, 'teardown n+1').timings.waiting)) - red);
  const [tChico, tGrande] = [t(chico), t(grande)];
  const ratioEntradas = grande.vendido / Math.max(1, chico.vendido);
  const ratioTiempo = tGrande / tChico;
  reporteServidor.add(tChico, { tam: 'chico' });
  reporteServidor.add(tGrande, { tam: 'grande' });
  console.log(`N+1: entradas x${ratioEntradas.toFixed(2)} -> tiempo servidor x${ratioTiempo.toFixed(2)} (${tChico.toFixed(0)} ms -> ${tGrande.toFixed(0)} ms, red base ${red.toFixed(0)} ms)`);
  if (ratioEntradas < 2) console.warn('Semilla sin contraste >= 2x entre eventos: oráculo N+1 no concluyente');
  sinN1.add(ratioTiempo < 1 + (ratioEntradas - 1) / 2);
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
