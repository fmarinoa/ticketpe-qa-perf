#!/usr/bin/env bash
# Runner de la suite. Uso: ./run.sh [smoke|full] [all|p1|p2|TC-PERF-0X]
#   smoke = shakedown 1 VU (gate obligatorio antes de full) · full = condiciones de carga de R3
set -uo pipefail
cd "$(dirname "$0")"
PROFILE=${1:-smoke}
FILTRO=$(echo "${2:-all}" | tr '[:lower:]' '[:upper:]')
set -a; [ -f .env ] && . ./.env; set +a
mkdir -p reports
fallos=()
rm -f reports/TC-PERF-04-veredicto.json

# Orden = nombre de archivo: núcleo (ESC01) -> agente (ESC02) -> saturación (ESC03), para que el 429
# provocado por ESC03 no contamine las mediciones de latencia del agente.
for f in tests/*.js; do
  tc=$(grep -o -m1 'TC-PERF-0[0-9]' "$f")
  prio=$(grep -o -m1 "prioridad: 'P[0-9]'" "$f" | grep -o 'P[0-9]')
  case $FILTRO in ALL) ;; P1|P2) [ "$prio" = "$FILTRO" ] || continue ;; *) [ "$tc" = "$FILTRO" ] || continue ;; esac

  echo "=== $tc ($prio) · $f · perfil $PROFILE"
  K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="reports/$tc-$PROFILE.html" \
    k6 run -e PROFILE="$PROFILE" --summary-export "reports/$tc-$PROFILE.json" "$f" || fallos+=("$tc")
done
grep -l '"FALLA"' reports/TC-PERF-04-veredicto.json >/dev/null 2>&1 && [[ $FILTRO =~ ALL|P1|TC-PERF-04 ]] && fallos+=("TC-PERF-04 (A-78)")

echo; [ ${#fallos[@]} -eq 0 ] && echo "Criterios de salida: todos los umbrales cumplidos" || { echo "Umbrales incumplidos: ${fallos[*]}"; exit 1; }
