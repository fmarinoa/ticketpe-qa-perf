#!/usr/bin/env bash
# Runner de la suite. Uso: ./run.sh [smoke|full] [all|p1|p2|esc0X|TC-PERF-0X] · ./run.sh index
#   smoke = shakedown 1 VU (gate obligatorio antes de full) · full = condiciones de carga de R3
set -uo pipefail
cd "$(dirname "$0")"
PROFILE=${1:-smoke}
FILTRO=$(echo "${2:-all}" | tr '[:lower:]' '[:upper:]')
set -a; [ -f .env ] && . ./.env; set +a
mkdir -p reports
export GIT_SHA=${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null)} RUNNER=${GITHUB_ACTIONS:+github-actions}

# Índice de informes (local y Pages): veredicto tomado del <title> de cada informe.
index() {
  { echo '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ticketpe-qa-perf · resultados</title>'
    echo '<style>body{font:14px/1.6 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:24px 16px;background:#fafafa}li{margin:4px 0}</style>'
    echo "<h1>ticketpe-qa-perf · resultados</h1><p>Generado $(TZ=America/Lima date '+%F %R') UTC-5 · commit ${GIT_SHA:-—}</p><ul>"
    for f in reports/*-informe.html; do
      [ -f "$f" ] || continue
      d=${f%-informe.html}.html
      echo "<li><a href=\"${f#reports/}\">$(grep -o -m1 '<title>[^<]*' "$f" | cut -c8-)</a>$([ -f "$d" ] && echo " · <a href=\"${d#reports/}\">dashboard k6</a>")</li>"
    done
    echo '</ul>'
    [ -s reports/analisis-ia.md ] && echo '<h2>Análisis IA de la corrida</h2><pre style="white-space:pre-wrap;background:#fff;border:1px solid #d0d7de;padding:12px">' \
      && sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g' reports/analisis-ia.md && echo '</pre>'
    echo '</html>'
  } > reports/index.html

  # Veredicto agregado (Job Summary y badge de shields.io, servido desde Pages porque el repo es privado).
  total=0 pasa=0 falla=0
  for f in reports/*-informe.html; do
    [ -f "$f" ] || continue
    t=$(grep -o -m1 '<title>[^<]*' "$f"); total=$((total + 1))
    case $t in *'· PASA ·'*) pasa=$((pasa + 1)) ;; *'· FALLA ·'*) falla=$((falla + 1)) ;; esac
  done
  if [ "$total" -eq 0 ]; then estado="SIN DATOS" msg="sin datos" color=lightgrey
  elif [ "$falla" -gt 0 ]; then estado=ROJO msg="$falla FALLA" color=red
  elif [ "$pasa" -eq "$total" ]; then estado=VERDE msg="$pasa/$total PASA" color=brightgreen
  else estado="NO CONCLUYENTE" msg="$pasa/$total PASA" color=yellow; fi
  printf '{"schemaVersion":1,"label":"Performance","message":"%s","color":"%s"}\n' "$msg" "$color" > reports/badge.json
  { echo "## Resultado"; echo
    echo "**$estado** · $total casos · $pasa PASA · $falla FALLA · $((total - pasa - falla)) NO CONCLUYENTE · commit ${GIT_SHA:-—}"; echo
    cat reports/*-resumen.md 2>/dev/null
    [ -s reports/analisis-ia.md ] && { echo "## Análisis IA de la corrida"; echo; cat reports/analisis-ia.md; }
  } > reports/resumen.md
}
[ "$PROFILE" = index ] && { index; exit 0; }
fallos=()

# Orden = nombre de archivo: núcleo (ESC01) -> agente (ESC02) -> saturación (ESC03), para que el 429
# provocado por ESC03 (TC-PERF-07) no contamine las mediciones de latencia del agente.
for f in tests/*.js; do
  tc=$(grep -o -m1 'TC-PERF-0[0-9]' "$f")
  prio=$(grep -o -m1 "prioridad: 'P[0-9]'" "$f" | grep -o 'P[0-9]')
  case $FILTRO in ALL) ;; P1|P2) [ "$prio" = "$FILTRO" ] || continue ;; ESC*) grep -q "escenario: '$FILTRO" "$f" || continue ;; *) [ "$tc" = "$FILTRO" ] || continue ;; esac

  echo "=== $tc ($prio) · $f · perfil $PROFILE"
  K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="reports/$tc-$PROFILE.html" \
    k6 run -e PROFILE="$PROFILE" --summary-export "reports/$tc-$PROFILE.json" "$f" || fallos+=("$tc")
done
index

echo; [ ${#fallos[@]} -eq 0 ] && echo "Criterios de salida: todos los umbrales cumplidos" || { echo "Umbrales incumplidos: ${fallos[*]}"; exit 1; }
