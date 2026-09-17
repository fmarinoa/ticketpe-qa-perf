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
cp .env.example .env                 # TEAM (ESC01) y TEAM_TOKEN (ESC02/03) obligatorios, sin fallback
./run.sh smoke                       # gate: shakedown 1 VU de toda la suite
./run.sh full p2                     # casos P2 (hoy, toda la suite) con condición de R3
./run.sh full TC-PERF-02             # un caso
./run.sh smoke esc01                 # un escenario (ESC01 = API del núcleo)
./run.sh index                       # regenera reports/index.html
k6 run -e PROFILE=smoke tests/esc01-cp01-lecturas-catalogo.js   # directo
k6 run -e REPLAY=off tests/esc03-cp07-limite-de-tasa.js         # TC-PERF-07 con IA real si la réplica no limita
```

Variables (ver `.env.example`):

| Variable | Obligatoria | Casos | Por defecto |
|---|---|---|---|
| `TEAM` | Sí | TC-PERF-01, 02 (prefijo `perf-<TEAM>-…` de las cuentas creadas) | — (el `setup()` aborta) |
| `TEAM_TOKEN` | Sí | TC-PERF-04…07 (token del agente; hoy el compartido del README) | — (el `setup()` aborta) |
| `BASE_URL` | No | Todos | `https://testathon.testingperu.com` |
| `ADMIN_EMAIL` / `ADMIN_PASS` | No | TC-PERF-02 (check-in), 03 (reporte) | cuenta admin pública del README |
| `REPLAY` | No | TC-PERF-07 (`off` = IA real) | réplica |
| `PROFILE`, `GIT_SHA`, `RUNNER` | No | Todos | los define `run.sh` |
Evidencias en `reports/`: `TC-PERF-0X-<perfil>.json` (summary), `.html` (dashboard k6), `-informe.html` (análisis automático) e `index.html`.

## CI y Pages

Workflow manual [`perf-esc01`](.github/workflows/perf-esc01.yml): solo ESC01 (API del núcleo, TC-PERF-01…03), en fila (`max-parallel: 1`) para que un caso no contamine la medición de otro.

```bash
gh workflow run perf-esc01 -f perfil=smoke   # gate, ≈ 3–4 min
gh workflow run perf-esc01 -f perfil=full    # condición de R3, ≈ 11–13 min
gh run watch                                 # seguir la corrida
```

| Aspecto | Configuración |
|---|---|
| Variables de repo | `TEAM=testitans` (`gh variable set TEAM -b testitans`). Sin secrets: ESC01 no usa `TEAM_TOKEN` y la cuenta admin es pública |
| Evidencias | Artifact `reports-TC-PERF-0X` por caso (JSON, dashboard k6, informe) |
| Publicación | Job `publish` (`if: always()`): `index.html` + informes + dashboards en **https://fmarinoa.github.io/ticketpe-qa-perf/**, también cuando un umbral falla. Se publica solo la última corrida |
| Pages | Origen *GitHub Actions*, entorno `github-pages`. **El sitio es público** aunque el repo sea privado: no contiene tokens (`informe.js` filtra `*token*`) |
| Concurrencia | `concurrency: perf`: nunca dos corridas a la vez sobre el entorno compartido |
| Punto de medición | Runner de GitHub (EE. UU.): la red base difiere de Lima; no comparar corridas de runners distintos |

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
