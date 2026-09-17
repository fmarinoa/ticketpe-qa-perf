# Estrategia y plan de pruebas de rendimiento — TicketPe (R6)

Equipo **TesTitans** · Testathon 2026 · Alineado a ISTQB **CTFL v4.0** (proceso de prueba, técnicas, criterios) y
**CT-PT — Performance Testing** (tipos, perfiles de carga, métricas, proceso) · Documento de plan según la estructura de **ISO/IEC/IEEE 29119-3**.

---

## 1. Objetivo y alcance

**Objetivo:** aportar evidencia falsable de que TicketPe cumple (o no) los objetivos no funcionales del README (L333–L339),
refinados en R2 §6 (N-01…N-05) y diseñados en la matriz R3 `Performance.tsv` como `TC-PERF-01…07`.

| Dentro de alcance | Fuera de alcance |
|---|---|
| Comportamiento temporal (ISO 25010 *time behaviour*) de la API del núcleo y del agente | Monitoreo del lado del servidor (CPU, memoria, BD): no hay acceso |
| Modo réplica del agente: latencia y consumo de cuota | Pruebas de *soak/endurance* (> 5 min) y *spike*: dañan un entorno compartido por 22 equipos |
| Límite de tasa del espacio del agente (60 rpm / 4 concurrentes, `429`) | Rendimiento de la web (Core Web Vitals) |
| | Integridad bajo concurrencia (sobreventa) y aislamiento entre equipos: retirados de la matriz R3 (ver §8) |
| | N+1 del reporte: no observable desde caja negra; se registra, no se evalúa |
| | Buscar el punto de quiebre (*breakpoint/capacity test*) |

## 2. Base de prueba (*test basis*)

| Fuente | Aporta |
|---|---|
| README · *Criterios no funcionales* L333–L339 | Objetivos orientativos: p95 lecturas < 500 ms, escrituras < 1 s, reporte < 2 s, TTFT < 3 s, turno con 1 herramienta p95 < 8 s, réplica < 200 ms, `429` explícito |
| R2 §6 · N-01, N-02, N-03, N-05 | Condición de carga, error < 1 %, punto de medición, límite de tasa |
| R3 · `R3-diseno-pruebas/tsv/Performance.tsv` | Casos `TC-PERF-01…07`: precondiciones, condición de carga, resultado esperado, oráculo, prioridad, severidad |
| Swagger `/api/core/openapi.json`, `/api/openapi.json` | Contratos reales (formato SSE, schema `Error`, `Trace`, `/api/v1/quota`, `Idempotency-Key`) |
| R1 · RSK-20, RSK-22 | Priorización por riesgo |

## 3. Análisis de riesgo y priorización

Prioridad y severidad heredadas de la matriz R3: todos los casos son **P2**; el orden de ejecución lo decide la severidad y el aislamiento (§4.2).

| Riesgo de producto | Impacto de negocio | Casos | Prioridad / Severidad |
|---|---|---|---|
| RSK-22 · Catálogo/disponibilidad lentos bajo carga → abandono de compra | Ventas | TC-PERF-01 | P2 / Alto |
| RSK-22 · Reserva, pago o check-in degradados | Dinero, operación en puerta | TC-PERF-02 | P2 / Alto |
| RSK-22 · Reporte de ventas lento → organizador no opera | Operación | TC-PERF-03 | P2 / Medio |
| RSK-22 · Chat "parece colgado" (TTFT alto) | Usabilidad | TC-PERF-04 | P2 / Medio |
| RSK-22 · Turno con herramienta lento | Usabilidad | TC-PERF-05 | P2 / Medio |
| RSK-22 · Réplica lenta o que gasta cuota | Costo de pruebas / cuota | TC-PERF-06 | P2 / Bajo |
| RSK-20 · Límite de concurrencia devuelve error genérico o cuelga | Contrato, disponibilidad | TC-PERF-07 | P2 / Alto |

## 4. Enfoque de prueba

### 4.1 Tipos de prueba (CT-PT) por caso

| TC | Escenario | Tipo | Característica ISO 25010 |
|---|---|---|---|
| TC-PERF-01 | ESC01-CP01 | *Load test* | Comportamiento temporal |
| TC-PERF-02 | ESC01-CP02 | *Load test* | Comportamiento temporal |
| TC-PERF-03 | ESC01-CP03 | *Performance test* (1 VU, secuencial) | Comportamiento temporal |
| TC-PERF-04 | ESC02-CP04 | *Performance test* (1 turno a la vez) | Comportamiento temporal |
| TC-PERF-05 | ESC02-CP05 | *Performance test* con clase de equivalencia (1 tool call) | Comportamiento temporal |
| TC-PERF-06 | ESC02-CP06 | *Performance test* (modo réplica) | Comportamiento temporal, utilización de recursos (cuota) |
| TC-PERF-07 | ESC03-CP07 | *Stress test* sobre el límite | Capacidad, tolerancia a fallos |

### 4.2 Perfil operacional y perfiles de carga

La condición de carga de R3 se traduce al executor k6 que la expresa literalmente: VUs constantes, iteraciones por VU o tasa de llegada.

| TC | Perfil operacional (flujo) | Executor k6 | Condición | Warm-up | Think time |
|---|---|---|---|---|---|
| 01 | `GET /eventos` → `GET /eventos/:id/disponibilidad` → `GET /mis-entradas` (asistente propio por VU) | `constant-vus` (warmup + steady) | 20 VUs · 5 min | 30 s descartado | 1–3 s |
| 02 | registro (no medido) → `POST /reservas` (1) → `POST /reservas/:id/pago` → admin `POST /checkin` | `constant-arrival-rate` 3 / 5 s, 3 VUs | 2 min (~70 compras) | — | — (pacing 5 s) |
| 03 | admin `GET /reportes/ventas` del evento con mayor `aforo_vendido` | `per-vu-iterations` | 1 VU · 20 peticiones | — | — |
| 04 | `POST /api/v1/chat/stream` IA real, 4 mensajes rotando | `per-vu-iterations` | 1 VU · 10 turnos | — | — |
| 05 | `POST /api/v1/chat` IA real, "¿Qué eventos hay en Cusco?" + `GET /traces/:id` | `per-vu-iterations` | 1 VU · 20 turnos | — | — |
| 06 | `POST /api/v1/chat` con `X-Replay-Mode: on` + `GET /traces/:id`; `GET /quota` antes y después | `per-vu-iterations` | 1 VU · 20 turnos | — | — |
| 07 | `POST /api/v1/chat` réplica sin pausa + petición de recuperación 60 s después | `constant-vus` (`REPLAY=off`: `constant-arrival-rate` 70/min) | 8 VUs · 90 s | — | 0 (concurrencia real) |

Orden de ejecución (`run.sh`, por nombre de archivo): ESC01 → ESC02 → ESC03, para que el `429` de TC-PERF-07 no contamine la latencia del agente.

### 4.3 Oráculos y métricas (trazabilidad TC → matriz R3 → umbral k6)

| TC | Resultado esperado (R3) | Umbral k6 / métrica | Script |
|---|---|---|---|
| 01 | p95 de cada endpoint < 500 ms · error < 1 % | `http_req_duration{scenario:steady,name:GET …}` `p(95)<500` × 3 · `http_req_failed{scenario:steady}` `rate<0.01` · red base: `med` de `red_base_ms` (1 min) | `tests/esc01-cp01-lecturas-catalogo.js` |
| 02 | p95 de cada endpoint < 1 s · error < 1 % · ninguna `5xx` | `p(95)<1000` × 3 · `error_escrituras` `rate<0.01` (sin registro) · `respuesta_5xx` `rate==0` | `tests/esc01-cp02-escrituras-compra.js` |
| 03 | cada respuesta < 2 s | `http_req_duration{name:GET /reportes/ventas}` `max<2000` · `checks{scenario:reporte}` `rate==1` | `tests/esc01-cp03-reporte-ventas.js` |
| 04 | en cada turno: primer `delta` < 3 s y `usage.ttft_ms` < 3000 | `ttft_cliente_ms` y `ttft_servidor_ms` `max<3000` · `turnos_medidos` `count>=10` | `tests/esc02-cp04-ttft-chat.js` |
| 05 | p95 (solo turnos con `totals.tool_calls = 1`) < 8 s · se registran los demás | `turno_1_herramienta_ms` `p(95)<8000` · `turnos_en_clase` `count>0` · `turno_fuera_de_clase` (sin umbral) | `tests/esc02-cp05-turno-con-herramienta.js` |
| 06 | cada respuesta < 200 ms · `runtime.replay_mode` true · `tokens_restantes` sin cambio | `replica_ms` `max<200` · `replicas_medidas` `count>0` · `trace_replay_mode_true` `rate==1` · `cuota_sin_cambios` `rate==1` · `checks` `rate==1` | `tests/esc02-cp06-modo-replica.js` |
| 07 | toda respuesta 200 o 429 · cada 429 con cuerpo `Error` · ninguna petición > 30 s · 200 a los 60 s de parar | `respuesta_fuera_de_contrato` `rate==0` · `cuerpo_429_error_ok` `rate==1` · `max<30000` · `recupera_200_tras_60s` `rate==1` · `respuestas_429` `count>0` (detecta si la réplica no limita) | `tests/esc03-cp07-limite-de-tasa.js` |

Métricas transversales en todos los scripts: `red_base_ms` (latencia de red base al `/health`), `checks`, `http_reqs`, `iteration_duration`.

> **Anti falso positivo:** un `p(95)`/`max` sobre una métrica sin muestras vale `0` y "pasa". Por eso cada oráculo de latencia sobre métrica propia lleva un `Counter` con umbral de conteo (k6 no admite `count` sobre `Trend`).

## 5. Entorno de prueba y punto de medición

| Aspecto | Declaración |
|---|---|
| SUT | `https://testathon.testingperu.com` (producción de la Testathon, **compartido por 22 equipos**) |
| Punto de medición | Cliente de carga k6 v2.2.0, no el servidor: máquina del equipo (Lima) o runner de GitHub Actions (EE. UU.). El informe registra `runner` y la red base de cada corrida; no se comparan corridas de runners distintos |
| Red base | `red_base_ms` en cada `setup()` sobre `/api/core/health` (5 s; **1 min** en TC-PERF-01, p50 = `med`). Observado en smoke: **~130–150 ms** — consume ~30 % del presupuesto de 500 ms |
| Representatividad | No es un entorno aislado: los resultados incluyen ruido de otros equipos. Se reporta siempre la hora de ejecución y `red_base_ms` para contextualizar |
| Espacio del agente | Límite/cuota por token. Con el token compartido `svc_…` el espacio está saturado por los 22 equipos (ver §10) |

## 6. Datos de prueba

| Dato | Origen | Gestión |
|---|---|---|
| Semilla ~5200 entradas | Semilla del sistema (medido: **5511** vendidas en 24 eventos) | Si hay *reset* general, se regenera sola; el `setup()` descubre ids en vez de *hardcodear* |
| Asistentes de lectura (TC-01) | `POST /auth/registro`, uno por VU (`perf-testitans-…@ticketpe.test`) | Precondición R3: cada VU con su propio asistente |
| Evento para escrituras (TC-02) | Descubierto en `setup()`: evento futuro con venta abierta cuyo tipo tenga el mayor `disponible` (≥ 300) | Consume ~73 entradas por corrida `full` del catálogo compartido; el evento elegido queda en el informe |
| Compradores (TC-02) | `POST /auth/registro` por iteración | No se mide; evita el tope de 4 entradas por persona |
| Check-in (TC-02) y reporte (TC-03) | `admin@ticketpe.demo` | Check-in del QR emitido; reporte en solo lectura |
| Mensaje de réplica (TC-06) | Primer mensaje de `MENSAJES` con `runtime.replay_miss false` | Si ninguno está en el corpus, el `setup()` aborta (criterio de entrada) |

## 7. Criterios de entrada, suspensión y salida

**Entrada (por corrida):**
1. `smoke` pasa (shakedown 1 VU: script, datos y contrato OK) — *gate* obligatorio antes de `full`: `./run.sh smoke <TC|esc0X>` en local o `gh workflow run perf-esc01 -f perfil=smoke` en CI.
2. `GET /api/core/health` y `/api/v1/health` responden `200`.
3. Login de cuentas y descubrimiento de datos en `setup()` OK (si no, el script aborta con `Criterio de entrada: …`).
4. Variables sin fallback definidas: `TEAM` (TC-01/02) y `TEAM_TOKEN` propio (TC-04…07); el `setup()` aborta si faltan.

**Suspensión / reanudación:**
- TC-01/02: `http_req_failed rate<0.10` con `abortOnFail` (30 s de gracia): si el SUT colapsa se aborta para no penalizar a otros equipos. Se reanuda tras verificar *health* y registrar el incidente.
- *Reset* de la semilla durante la corrida → se invalida la corrida y se repite.

**Salida:**
- Todos los umbrales k6 de los 7 casos evaluados (pasa/falla), con artefactos en `reports/`.
- TC-07 sin `429` en réplica → se repite con `REPLAY=off` antes de concluir.
- Todo umbral incumplido se reporta como hallazgo R4 o se justifica como ruido de entorno con evidencia (`red_base_ms`, `agente_429_reintentados`).

## 8. Supuestos y decisiones declarados

| ID | Supuesto / decisión | Por qué |
|---|---|---|
| **A-86** | Primer `delta` del stream (TC-04) ≈ TTFB (`timings.waiting`), contrastado turno a turno con `usage.ttft_ms` | k6 core no lee SSE incremental y `xk6-sse` no está en el registro de extensiones de k6 2.x. El TTFB es cota inferior del primer `delta`; upgrade: binario xk6 con `xk6-sse` |
| A-88 | En TC-04/05/06 un `429` no es muestra de latencia: se reintenta según `Retry-After` y se contabiliza en `agente_429_reintentados` | Aísla el ruido del espacio compartido del tiempo de inferencia |
| A-89 (nuevo) | En TC-07 el `429` se valida contra el schema `Error` de Swagger (`error` requerido); `Retry-After` y ≤ 60 rpm aceptadas ya no son umbral | R3 solo exige "cuerpo Error" |
| A-90 (nuevo) | TC-07 en réplica sin *pacing*: 8 VUs sin pausa | Con 1 s de pausa y respuestas de ~150 ms la concurrencia real no supera 4 |
| Retirados | A-78 (aislamiento entre equipos, ex TC-PERF-04), A-85 (oráculo N+1), A-87 (`409` como negocio) y oráculo de sobreventa | Ya no están en la matriz R3; la observación de pago (§12 #1) no se reproduce al 17/09 |

## 9. Proceso de prueba (CT-PT) y entregables

| Actividad CT-PT | Qué se hace aquí | Entregable |
|---|---|---|
| Planificación | Este documento | `STRATEGY.md` |
| Análisis y diseño | README L333–L339 + R2 §6 → matriz R3 `Performance.tsv` → perfiles y oráculos (§4) | Matriz §4.3 |
| Implementación | Framework k6 (ver `ARCHITECTURE.md`) | `lib/`, `tests/`, `run.sh` |
| Ejecución | `smoke` → `full`, fuera de horas pico · ESC01 en GitHub Actions (`perf-esc01`), ESC02/03 en local | `reports/*.json`, `reports/*.html`, artifacts de CI |
| Evaluación y reporte | Contrastar umbrales, separar red/servidor, reportar hallazgos con evidencia | Informe (§11) + bugs R4 |
| Cierre | Archivar reportes, lecciones aprendidas, supuestos a validar con PO | Commit en rama `testitans` |

## 10. Riesgos del proyecto de prueba

| Riesgo | Mitigación |
|---|---|
| Token compartido del agente saturado (smoke 16/09 11:00: 100 % `429` en `/chat` y `/chat/stream`, también con `X-Replay-Mode`) | Pedir `TEAM_TOKEN` propio por WhatsApp oficial; sin él TC-04…07 no se ejecutan (sin fallback al token compartido) |
| Resultados contaminados por carga de otros equipos | Registrar hora y `red_base_ms`, repetir en horario valle |
| Cuota de IA real agotada | TC-06/07 usan réplica; IA real solo en TC-04/05 (30 turnos) y TC-07 con `REPLAY=off` (70 mensajes) |
| *Reset* de datos en plena corrida | Descubrimiento dinámico en `setup()`; invalidar y repetir |
| Nuestra carga degrada a otros equipos | Perfiles acotados a R3, criterio de suspensión, sin soak/spike; TC-07 dura 90 s y solo en réplica |

## 11. Informe de resultados (automático)

`lib/informe.js` genera `reports/TC-PERF-0X-<perfil>-informe.html` al cierre de cada caso (`handleSummary`) y `-resumen.md`; `run.sh index` arma `reports/index.html`, `resumen.md` (Job Summary) y `badge.json`; en CI (`perf-esc01`) se publica la última corrida en https://fmarinoa.github.io/ticketpe-qa-perf/ (sitio público).

| Regla de análisis | Cómo se calcula | Resultado |
|---|---|---|
| Veredicto | `thresholds[].ok` de cada umbral (= resultado esperado de R3) | **PASA** · **FALLA** · **NO CONCLUYENTE** |
| Validez | Métrica de umbral con 0 muestras (`count` / `passes+fails`) o perfil `smoke` | NO CONCLUYENTE, con aviso (evita el "pasa en vacío") |
| Red vs servidor | Servidor ≈ latencia medida − p50 de `red_base_ms`; % del presupuesto consumido por la red | Columnas *Servidor ≈* y *Red / presupuesto* |
| Ruido de entorno | p95/p50 de `red_base_ms` > 1,5 | Aviso "repetir en horario valle" |
| Contexto | `setup_data` sin claves `*token*` (evento, tipo, disponible) | Trazabilidad de los datos usados |
| Borrador R4 | Si hay umbrales incumplidos: plantilla de bug del README con esperado vs real, severidad de la matriz y evidencia | Listo para revisar y copiar a R4 |

Metadatos: fecha UTC-5, commit (`GIT_SHA`), runner (`local` / `github-actions`), duración y condición de carga ejecutada.

## 12. Hallazgos y observaciones (smoke 16/09 con la versión previa de la matriz · revisión 17/09)

| # | Hallazgo | Evidencia | Severidad propuesta |
|---|---|---|---|
| 1 | ~~`POST /reservas/:id/pago` emite 2 entradas para una reserva de `cantidad: 1`~~ **No se reproduce.** El 16/09 se observó en 6/6 intentos (smoke k6 + curl); el 17/09 01:2x UTC-5 una reserva de `cantidad: 1` en el evento 20 emitió 1 entrada y `mis-entradas` devolvió 1. Posible corrección del SUT o reset: se vigila como regresión, no se reporta en R4 | 16/09: check de TC-PERF-02 anterior · 17/09: `entradas.length = 1` tras el pago | — (no reproduce) |
| 2 | El `429` responde `{error, mensaje}` + `Retry-After`; A-79 (R2) exigía `{codigo, mensaje}`. El contrato real (Swagger) es `{error}` → **corregir A-79**, no es defecto | Check informativo del caso de límite de tasa anterior | — (ajuste de AC) |
| 3 | Espacio del token compartido saturado permanentemente → 100 % `429`, incluso en modo réplica | `agente_429_reintentados` en el smoke del caso de turno con herramienta | Riesgo de proyecto (§10) |
| 4 | Latencia de red base ~130–150 ms desde Lima: el objetivo de 500 ms deja ~350 ms reales al servidor | `red_base_ms` | Informativo |
| 5 | El `429` dice *"las demás esperan en cola"* pero rechaza la petición de inmediato | cuerpo `{"error":"limite_de_concurrencia","mensaje":"Máximo 4 peticiones concurrentes por espacio; las demás esperan en cola."}` (17/09) | Candidato a R4 (texto o comportamiento) |

## 13. Ingeniería de la automatización (TAS)

La suite de performance también es software: si falla, **no debe disfrazarse de fallo del SUT**. Vocabulario: ISTQB CT-PT (proceso) y CTAL-TAE (TAS vs SUT, gTAA).

### 13.1 TAS y SUT se prueban por separado

| | SUT | TAS |
|---|---|---|
| Qué es | API TicketPe Núcleo (`/api/core`) | esta suite k6 + el análisis automático |
| Quién lo prueba | `tests/esc01-*.js` | `framework/informe.test.js` (sin red) + `k6 inspect` |
| Veredicto | `reports/TC-PERF-0X-<perfil>-informe.html` | job `gates` de CI |

`informe.js` decide PASA/FALLA/NO CONCLUYENTE: si clasificara mal, el informe publicado culparía o absolvería al SUT. Por eso tiene su propia verificación (umbral sin muestras ⇒ nunca PASA, smoke ⇒ NO CONCLUYENTE, red vs servidor, aviso de ruido, borrador R4 solo si FALLA, nunca publica tokens).

### 13.2 gTAA: dónde cae cada archivo

| Capa gTAA | Aquí |
|---|---|
| Test Generation | — (hueco consciente: los perfiles de carga salen de la matriz R3, no de un modelo) |
| Test Definition | `tests/escNN-cpNN-*.js`: `options` (perfil + umbrales = resultado esperado de R3) |
| Test Adaptation | `lib/common.js` (cliente HTTP, datos, perfiles, red base) |
| Test Execution / Reporting | `run.sh`, `lib/informe.js`, `.github/workflows/perf-esc01.yml` |

### 13.3 Clasificación de un rojo (de lo barato a lo caro)

| Step en rojo | Significa | Lo arregla |
|---|---|---|
| Verificar el framework (TAS) | la automatización está rota | QA performance |
| Gate de salud del ambiente | el ambiente está caído: no se genera carga | infraestructura |
| `Criterio de entrada: …` en un caso | faltan datos o variables (`TEAM`, evento con cupo) | quien lanzó la corrida |
| Ejecutar TC-PERF-0X | umbral de R3 incumplido: hallazgo de rendimiento candidato | desarrollo (tras triage) |

En **toda** corrida, pase o falle, `scripts/analizar-corrida.sh` pasa los resúmenes a Copilot CLI: valida si un PASA es confiable (muestras, margen, red), explica un NO CONCLUYENTE y clasifica cada FALLA en `SUT_LENTO | RED | DATOS | AMBIENTE | TAS | RUIDO_COMPARTIDO`. El resultado va al Job Summary y al índice de Pages. La IA **sugiere** (`continue-on-error`, nunca bloquea la publicación); la decisión de reportar en R4 es humana.

### 13.4 Riesgos del TAS y mitigación

| Riesgo del TAS | Mitigación |
|---|---|
| Umbral que "pasa en vacío" (métrica sin muestras) | `summaryTrendStats` con `count` + veredicto NO CONCLUYENTE + contadores `count>0` |
| Datos quemados que caducan (evento sin cupo, reset de semilla) | `setup()` descubre el evento con más `disponible` en cada corrida |
| Culpar al SUT por la red | red base por corrida; columna *Servidor ≈* y aviso de red inestable |
| Casos que se contaminan entre sí | `max-parallel: 1` y `concurrency: perf` |
| Publicar secretos en Pages (sitio público) | `informe.js` filtra claves `*token*`; ESC01 no usa secrets |
| Supply chain del pipeline | actions fijadas por hash de commit |
| El análisis automático se rompe sin que nadie lo note | `framework/informe.test.js` en el job `gates` |

### 13.5 Métricas y bitácora

| Métrica | De dónde | Dónde se ve |
|---|---|---|
| Veredicto por caso y por oráculo, muestras, servidor ≈, red/presupuesto | `lib/informe.js` | Job Summary, Pages, badge |
| Latencia por endpoint en el tiempo de la corrida | dashboard k6 | Pages (`TC-PERF-0X-<perfil>.html`) |
| Salud del TAS y del ambiente | job `gates` | GitHub Actions |

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-09-17 | Matriz R3 como única fuente de oráculos | trazabilidad TC → umbral |
| 2026-09-17 | `informe.js` + `index`/badge | análisis de resultados sin intervención manual |
| 2026-09-17 | Job `gates` (TAS + salud) | clasificación de fallos |
| 2026-09-17 | Análisis IA de toda corrida (no solo de fallos) | un PASA frágil o un NO CONCLUYENTE también requieren criterio |

**Backlog (no implementado a propósito):** histórico de corridas en Pages (tendencia de p95 y flakiness de veredicto) · ESC02/ESC03 en CI (requieren decidir el uso del token compartido del agente) · comparación entre runners (Lima vs GitHub).
