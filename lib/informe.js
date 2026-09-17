// Análisis automático de resultados (STRATEGY §11) vía handleSummary:
// veredicto por oráculo, validez de la corrida, red vs servidor, ruido de entorno y borrador de hallazgo R4.
// Uso en un caso: `summaryTrendStats: STATS` en options + `export const handleSummary = (d) => informe(d, options, 'título');`
export const STATS = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'count'];
const RUIDO = 1.5; // p95/p50 de red_base_ms por encima => red inestable, corrida contaminada

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ms = (v) => `${Math.round(v)} ms`;

function oraculos(data, redP50) {
  const filas = [];
  for (const [metrica, m] of Object.entries(data.metrics))
    for (const [expr, t] of Object.entries(m.thresholds || {})) {
      const [, agg, lim] = expr.match(/^([\w()]+)\s*[<>=!]+\s*(\S+)$/) || [];
      const v = m.values[agg];
      const tiempo = m.contains === 'time';
      filas.push({
        metrica, expr, ok: t.ok, tiempo,
        medido: v == null ? '—' : tiempo ? ms(v) : agg === 'rate' ? `${(v * 100).toFixed(2)} %` : String(v),
        // Servidor ≈ latencia medida − p50 de la red base (A-77). Solo orientativo: la red no es constante.
        servidor: tiempo && redP50 && v != null ? ms(Math.max(0, v - redP50)) : '—',
        red: tiempo && redP50 ? `${Math.round((redP50 / Number(lim)) * 100)} %` : '—',
        muestras: m.type === 'rate' ? m.values.passes + m.values.fails : m.type === 'trend' ? m.values.count : null,
      });
    }
  return filas;
}

const condicion = (scenarios) =>
  Object.entries(scenarios)
    .map(([n, s]) => `${n}: ${[s.executor, s.vus && `${s.vus} VUs`, s.duration, s.iterations && `${s.iterations} iteraciones`, s.rate && `${s.rate}/${s.timeUnit}`].filter(Boolean).join(' · ')}`)
    .join(' | ');

export function informe(data, options, titulo, perfil = __ENV.PROFILE || 'full') {
  const { tc, escenario, prioridad, severidad } = options.tags;
  const red = (data.metrics.red_base_ms || { values: {} }).values;
  const filas = oraculos(data, red.med);
  const fallidos = filas.filter((f) => !f.ok);
  const vacios = filas.filter((f) => f.muestras === 0);
  const ruido = red.med && red['p(95)'] / red.med > RUIDO;
  const veredicto = fallidos.length ? 'FALLA' : vacios.length || perfil === 'smoke' ? 'NO CONCLUYENTE' : 'PASA';
  const fecha = `${new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} UTC-5`;
  const contexto = JSON.stringify(data.setup_data || {}, (k, v) => (/token/i.test(k) ? undefined : v)); // nunca publicar tokens
  const avisos = [
    perfil === 'smoke' && 'Perfil smoke (1 VU): valida script y datos, no el oráculo de R3.',
    vacios.length && `Sin muestras en: ${vacios.map((f) => f.metrica).join(', ')} → un umbral sin datos "pasa" en vacío.`,
    ruido && `Red inestable: p95/p50 de red base = ${(red['p(95)'] / red.med).toFixed(2)} > ${RUIDO} → repetir en horario valle.`,
  ].filter(Boolean);
  const evidencia = `reports/${tc}-${perfil}.html · reports/${tc}-${perfil}.json`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tc} · ${veredicto} · ${perfil}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:24px 16px;color:#1d1d1f;background:#fafafa}
h1{font-size:20px;margin:0 0 4px}.v{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-weight:600}
.PASA{background:#1a7f37}.FALLA{background:#cf222e}.NO{background:#9a6700}.meta{color:#57606a}
.tabla{overflow-x:auto}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left}
th{background:#f6f8fa}.ok{color:#1a7f37}.ko{color:#cf222e;font-weight:600}.aviso{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px;border-radius:6px}
code{font-size:12px;word-break:break-all}</style></head><body>
<p><a href="index.html">← todas las corridas</a></p>
<h1>${tc} · ${esc(titulo)}</h1>
<p><span class="v ${veredicto.split(' ')[0]}">${veredicto}</span> <span class="meta">${escenario} · ${prioridad} / ${severidad} · perfil ${perfil}</span></p>
<p class="meta">${fecha} · commit ${esc(__ENV.GIT_SHA || '—')} · runner ${esc(__ENV.RUNNER || 'local')} · duración ${Math.round(data.state.testRunDurationMs / 1000)} s<br>
Condición: ${esc(condicion(options.scenarios))}<br>
Red base (A-77): p50 ${red.med ? ms(red.med) : '—'} · p95 ${red['p(95)'] ? ms(red['p(95)']) : '—'}</p>
${avisos.map((a) => `<p class="aviso">${esc(a)}</p>`).join('\n')}
<h2>Oráculos</h2><div class="tabla"><table><tr><th>Métrica</th><th>Umbral</th><th>Medido</th><th>Servidor ≈</th><th>Red / presupuesto</th><th>Muestras</th><th>Resultado</th></tr>
${filas.map((f) => `<tr><td><code>${esc(f.metrica)}</code></td><td>${esc(f.expr)}</td><td>${f.medido}</td><td>${f.servidor}</td><td>${f.red}</td><td>${f.muestras ?? '—'}</td><td class="${f.ok ? 'ok">✓ cumple' : 'ko">✗ incumple'}</td></tr>`).join('\n')}
</table></div>
<h2>Contexto de datos</h2><p><code>${esc(contexto)}</code></p>
<p class="meta">Evidencia: ${evidencia}</p>
${fallidos.length ? `<h2>Borrador de hallazgo R4</h2><pre>### [${severidad}] ${tc}: ${esc(titulo)} no se cumple
- Criterio relacionado: ${tc} (matriz R3 Performance.tsv)
- Dónde: Back — ${fallidos.map((f) => esc(f.metrica)).join(', ')}
- Condición: ${esc(condicion(options.scenarios))} · ${fecha} · red base p50 ${red.med ? ms(red.med) : '—'}
- Resultado esperado: ${fallidos.map((f) => esc(f.expr)).join(' · ')}
- Resultado real: ${fallidos.map((f) => `${esc(f.expr.split(/[<>=!]/)[0])} = ${f.medido}`).join(' · ')}
- Evidencia: ${evidencia}</pre>` : ''}
</body></html>`;

  // Markdown para el Job Summary de GitHub Actions (mismo análisis que el HTML).
  const celda = (s) => String(s).replace(/\|/g, '\\|');
  const resumen = [
    `### ${tc} · ${titulo} · **${veredicto}**`, '',
    `${escenario} · ${prioridad} / ${severidad} · perfil ${perfil} · red base p50 ${red.med ? ms(red.med) : '—'} · p95 ${red['p(95)'] ? ms(red['p(95)']) : '—'}`, '',
    ...avisos.map((a) => `> ⚠️ ${a}`), ...(avisos.length ? [''] : []),
    '| Métrica | Umbral | Medido | Servidor ≈ | Red / presupuesto | Muestras | Resultado |', '|---|---|---|---|---|---|---|',
    ...filas.map((f) => `| \`${celda(f.metrica)}\` | ${celda(f.expr)} | ${f.medido} | ${f.servidor} | ${f.red} | ${f.muestras ?? '—'} | ${f.ok ? '✓' : '✗'} |`), '',
  ].join('\n');

  const stdout = [`\n${tc} · ${veredicto} · ${perfil}`, ...avisos.map((a) => `  ! ${a}`), ...filas.map((f) => `  ${f.ok ? '✓' : '✗'} ${f.metrica} ${f.expr} medido=${f.medido} muestras=${f.muestras ?? '—'}`)].join('\n');
  return { stdout: `${stdout}\n`, [`reports/${tc}-${perfil}-informe.html`]: html, [`reports/${tc}-${perfil}-resumen.md`]: resumen };
}
