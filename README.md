# ticketpe-qa-perf — Framework de rendimiento k6 (R6)

Suite de pruebas de rendimiento de TicketPe para la Testathon 2026 (equipo TesTitans), trazable a la matriz R3 `R3-diseno-pruebas/tsv/Performance.tsv`.

## Documentación

| Documento | Contenido |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Capas, anatomía de un caso, `lib/common.js`, decisiones técnicas |
| [`STRATEGY.md`](STRATEGY.md) | Estrategia, riesgos, oráculos, criterios de entrada/salida, hallazgos |

## Uso

```bash
brew install k6                      # k6 >= 2.x
cp .env.example .env                 # TEAM y TEAM_TOKEN obligatorios, sin fallback
./run.sh smoke                       # gate: shakedown 1 VU de toda la suite
./run.sh full p2                     # casos P2 (hoy, toda la suite) con condición de R3
./run.sh full TC-PERF-02             # un caso
./run.sh smoke esc01                 # un escenario (ESC01 = API del núcleo)
./run.sh index                       # regenera reports/index.html
k6 run -e PROFILE=smoke tests/esc01-cp01-lecturas-catalogo.js   # directo
k6 run -e REPLAY=off tests/esc03-cp07-limite-de-tasa.js         # TC-PERF-07 con IA real si la réplica no limita
```

Variables: ver `.env.example`. Obligatorias sin fallback: `TEAM` (TC-PERF-01/02) y `TEAM_TOKEN` (TC-PERF-04…07). Opcionales: `BASE_URL`, `REPLAY`, cuentas `*_EMAIL/*_PASS`.
Evidencias en `reports/`: `TC-PERF-0X-<perfil>.json` (summary), `.html` (dashboard k6), `-informe.html` (análisis automático) e `index.html`.

## CI y Pages

Workflow manual [`perf-esc01`](.github/workflows/perf-esc01.yml) (`gh workflow run perf-esc01 -f perfil=full`): TC-PERF-01…03 en fila y publicación de `reports/` en GitHub Pages, también cuando un umbral falla. Requiere la variable de repo `TEAM` y Pages con origen *GitHub Actions*. Duración: `full` ≈ 11–13 min · `smoke` ≈ 3–4 min.

## Casos

| Archivo | TC | Prioridad / Severidad | Condición full |
|---|---|---|---|
| `esc01-cp01-lecturas-catalogo.js` | TC-PERF-01 | P2 / Alto | 20 VUs · 5 min · 30 s warm-up · red base 1 min |
| `esc01-cp02-escrituras-compra.js` | TC-PERF-02 | P2 / Alto | 3 VUs · 2 min · 1 compra cada 5 s por VU |
| `esc01-cp03-reporte-ventas.js` | TC-PERF-03 | P2 / Medio | 1 VU · 20 peticiones secuenciales |
| `esc02-cp04-ttft-chat.js` | TC-PERF-04 | P2 / Medio | 1 VU · 10 turnos IA real (stream) |
| `esc02-cp05-turno-con-herramienta.js` | TC-PERF-05 | P2 / Medio | 1 VU · 20 turnos IA real |
| `esc02-cp06-modo-replica.js` | TC-PERF-06 | P2 / Bajo | 1 VU · 20 turnos réplica |
| `esc03-cp07-limite-de-tasa.js` | TC-PERF-07 | P2 / Alto | 8 VUs concurrentes · 90 s réplica (`REPLAY=off`: 70 mensajes en 1 min) |
