#!/usr/bin/env bash
# Análisis asistido por IA (Copilot CLI) de TODA corrida de performance, pase o falle:
# un PASA puede ser frágil (poco margen, red inestable) y un NO CONCLUYENTE necesita un porqué.
# Uso: scripts/analizar-corrida.sh [dir-reportes]   (default: reports) · CI: GITHUB_TOKEN + permiso copilot-requests: write
# Salida: stdout y $DIR/analisis-ia.md (lo publican el Job Summary y el índice de Pages).
set -euo pipefail

DIR=${1:-reports}
ls "$DIR"/*-resumen.md > /dev/null 2>&1 || { echo "Sin resúmenes en $DIR (la corrida no llegó a ejecutar)"; exit 0; }

EVIDENCIA=$({
  echo "# Evidencia de la corrida de performance"
  echo "- commit: $(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
  [ -n "${GITHUB_RUN_ID:-}" ] && echo "- run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  echo "- runner: $([ -n "${GITHUB_ACTIONS:-}" ] && echo github-actions || echo local) (el punto de medición cambia la red base)"
  echo
  cat "$DIR"/*-resumen.md
})

PROMPT="Eres QA performance lead (ISTQB CT-PT). Analiza esta corrida k6 contra TicketPe (entorno compartido por 22 equipos).
Puedes leer tests/*.js, lib/*.js y STRATEGY.md del repo para entender cada caso y su oráculo (matriz R3).
Columnas: 'Servidor ≈' = latencia − p50 de red base; 'Red / presupuesto' = cuánto del umbral consume la red.
Responde en español, markdown, máximo 400 palabras, directo con el análisis (sin preámbulo ni frases sobre lo que vas a hacer). Por cada caso:
- PASA: ¿es confiable? (muestras suficientes, margen contra el umbral, estabilidad de la red)
- NO CONCLUYENTE: por qué y qué falta para concluir
- FALLA: causa raíz probable (métrica, valor, umbral) y clasificación SUT_LENTO | RED | DATOS | AMBIENTE | TAS | RUIDO_COMPARTIDO
Cierra con un veredicto de una línea: ¿hay un hallazgo de rendimiento reportable en R4, hay que repetir la corrida, o la evidencia es suficiente?

$EVIDENCIA"

if ! command -v copilot > /dev/null; then
  echo "copilot CLI no instalado (npm i -g @github/copilot). Evidencia cruda:" >&2
  echo "$EVIDENCIA"
  exit 0
fi

copilot -p "$PROMPT" -s --allow-tool='shell(cat:*)' --allow-tool='shell(ls:*)' --allow-tool='shell(grep:*)' > "$DIR/analisis-ia.md" \
  || echo "Análisis IA no disponible en esta corrida." > "$DIR/analisis-ia.md"
cat "$DIR/analisis-ia.md"
