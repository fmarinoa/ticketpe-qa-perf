#!/usr/bin/env bash
# Triage asistido por IA (Copilot CLI) de una corrida de performance con umbrales incumplidos.
# Uso: scripts/analizar-fallo.sh [dir-reportes]   (default: reports) · CI: GITHUB_TOKEN + permiso copilot-requests: write
set -euo pipefail

DIR=${1:-reports}
FALLAS=$(grep -l '\*\*FALLA\*\*' "$DIR"/*-resumen.md 2>/dev/null || true)
[ -n "$FALLAS" ] || { echo "Sin casos en FALLA en $DIR"; exit 0; }

EVIDENCIA=$({
  echo "# Evidencia de fallo de performance"
  echo "- commit: $(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
  [ -n "${GITHUB_RUN_ID:-}" ] && echo "- run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  echo "- runner: $([ -n "${GITHUB_ACTIONS:-}" ] && echo github-actions || echo local) (el punto de medición cambia la red base)"
  echo
  for f in $FALLAS; do cat "$f"; echo; done
})

PROMPT="Eres QA performance lead (ISTQB CT-PT). Analiza esta evidencia de una corrida k6 contra TicketPe (entorno compartido por 22 equipos).
Puedes leer tests/*.js, lib/*.js y STRATEGY.md del repo para entender cada caso y su oráculo (matriz R3).
Columnas: 'Servidor ≈' = latencia − p50 de red base; 'Red / presupuesto' = cuánto del umbral consume la red.
Responde en español, markdown, máximo 400 palabras, por cada caso en FALLA:
1) causa raíz probable (cita la métrica, el valor medido y el umbral)
2) clasificación: SUT_LENTO | RED | DATOS | AMBIENTE | TAS | RUIDO_COMPARTIDO
3) acción concreta (repetir en horario valle, reportar en R4, corregir script con archivo/línea, etc.)
Cierra con un veredicto de una línea: ¿es un hallazgo de rendimiento reportable en R4 o hay que repetir la corrida?

$EVIDENCIA"

if ! command -v copilot >/dev/null; then
  echo "copilot CLI no instalado (npm i -g @github/copilot). Evidencia cruda:" >&2
  echo "$EVIDENCIA"
  exit 0
fi

INFORME=$(copilot -p "$PROMPT" -s --allow-tool='shell(cat:*)' --allow-tool='shell(ls:*)' --allow-tool='shell(grep:*)' || echo "Análisis IA no disponible en esta corrida.")
echo "$INFORME"
echo "$INFORME" > "$DIR/analisis-ia.md"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && { echo "## Análisis IA del fallo"; echo "$INFORME"; } >> "$GITHUB_STEP_SUMMARY"
exit 0
