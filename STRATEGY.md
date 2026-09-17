# Estrategia y plan de pruebas de rendimiento — TicketPe (R6)

Equipo **TesTitans** · Testathon 2026 · Alineado a ISTQB **CTFL v4.0** (proceso de prueba, técnicas, criterios) y
**CT-PT — Performance Testing** (tipos, perfiles de carga, métricas, proceso) · Documento de plan según la estructura de **ISO/IEC/IEEE 29119-3**.

---

## 1. Objetivo y alcance

**Objetivo:** aportar evidencia falsable de que TicketPe cumple (o no) los objetivos no funcionales del README,
refinados en R2 §6 (A-75…A-79) y diseñados en R3 como `TC-PERF-01…07`.

| Dentro de alcance | Fuera de alcance |
|---|---|
| Comportamiento temporal (ISO 25010 *time behaviour*) de la API del núcleo y del agente | Monitoreo del lado del servidor (CPU, memoria, BD): no hay acceso |
| Capacidad y límites del espacio del agente (60 rpm / 4 concurrentes, `429`) | Pruebas de *soak/endurance* (> 5 min) y *spike*: dañan un entorno compartido por 22 equipos |
| Integridad bajo concurrencia (0 sobreventas) | Rendimiento de la web (Core Web Vitals) |
| Aislamiento entre equipos (A-78) | Buscar el punto de quiebre (*breakpoint/capacity test*) |

## 2. Base de prueba (*test basis*)

| Fuente | Aporta |
|---|---|
| README · *Criterios no funcionales* | Objetivos orientativos: p95 lecturas < 500 ms, escrituras < 1 s, reporte < 2 s, TTFT < 3 s, turno < 8 s, 60 rpm / 4 concurrentes |
| R2 §6 · A-75, A-76, A-77, A-78, A-79 | Condición de carga, umbral de error, punto de medición, métrica de aislamiento, contrato del `429` |
| R3 · Tabla 4 + A-84 | Casos `TC-PERF-01…07`, prioridad, severidad, 20 turnos por medición de IA |
| Swagger `/api/core/openapi.json`, `/api/openapi.json` | Contratos reales (formato SSE, schema `Error`, `Idempotency-Key`) |
| R1 · RSK-21, RSK-22, RSK de sobreventa | Priorización por riesgo |

## 3. Análisis de riesgo y priorización

Prioridad = riesgo de producto (probabilidad × impacto) heredado de R1/R3. Se ejecuta primero lo P1.

| Riesgo de producto | Impacto de negocio | Casos | Prioridad |
|---|---|---|---|
| Catálogo/disponibilidad lentos bajo carga → abandono de compra | Ventas | TC-PERF-01 | P1 |
| Reserva/pago degradados o **sobreventa** con concurrencia | Dinero, reputación | TC-PERF-02 | P1 |
| Límite de tasa responde `500` o cuelga | Contrato, disponibilidad | TC-PERF-03 | P1 |
| Un equipo degrada a los demás (RSK-21) | Equidad / disponibilidad | TC-PERF-04 | P1 |
| Chat "parece colgado" (TTFT alto) | Usabilidad | TC-PERF-05 | P1 |
| Turno con herramienta lento | Usabilidad | TC-PERF-06 | P2 |
| Reporte con N+1 → organizador no opera | Operación | TC-PERF-07 | P2 |

## 4. Enfoque de prueba

### 4.1 Tipos de prueba (CT-PT) por caso

| TC | Escenario | Tipo CT-PT | Característica ISO 25010 |
|---|---|---|---|
| TC-PERF-01 | ESC01-CP01 | *Load test* | Comportamiento temporal |
| TC-PERF-02 | ESC01-CP02 | *Load* + *Concurrency test* | Comportamiento temporal, integridad |
| TC-PERF-07 | ESC01-CP03 | *Load* + *Scalability test* (N+1) | Comportamiento temporal, capacidad |
| TC-PERF-05 | ESC02-CP04 | *Load test* (concurrencia = tope del espacio) | Comportamiento temporal |
| TC-PERF-06 | ESC02-CP05 | *Load test* con clase de equivalencia (1 tool call) | Comportamiento temporal |
| TC-PERF-03 | ESC03-CP06 | *Stress test* sobre el límite | Capacidad, tolerancia a fallos |
| TC-PERF-04 | ESC03-CP07 | *Isolation test* (línea base vs bajo carga) | Coexistencia, capacidad |

### 4.2 Perfil operacional y perfiles de carga

Modelo **cerrado** (VUs constantes, `constant-vus`/`shared-iterations`), porque R3 declara la condición en VUs.
*Think time* aleatorio 1–3 s entre pasos para reproducir el perfil de un comprador real (CT-PT: evitar carga irreal de ráfaga).

| TC | Perfil operacional (flujo) | VUs | Duración | Warm-up descartado | Think time |
|---|---|---|---|---|---|
| 01 | `GET /eventos` → `GET /eventos/:id/disponibilidad` → `GET /mis-entradas` | 20 | 5 min | 30 s | 1–3 s |
| 02 | registro → `POST /reservas` (1) → `POST /reservas/:id/pago` → `POST /checkin` | 20 | 5 min | 30 s | 1–3 s |
| 07 | `GET /reportes/ventas` del evento con más entradas + sondeo N+1 al cierre | 5 | 3 min | 30 s | 0,5–1,5 s |
| 05 | `POST /api/v1/chat/stream` IA real | 4 | 20 turnos | — | — |
| 06 | `POST /api/v1/chat` IA real, turnos con 1 herramienta | 4 | 20 turnos | — | — |
| 03 | `POST /api/v1/chat` (réplica) sobre el límite | 8 | 2 min | — | 1 s (≈ 480 rpm) |
| 04 | Fase 1: 5 VUs `GET /eventos` · Fase 2: + 8 VUs saturando el espacio A | 5 (+8) | 5 + 5 min | — | 0,5–1,5 s |

Warm-up (A-75): escenario `warmup` sin umbrales + escenario `steady`; todos los umbrales filtran `{scenario:steady}`.

### 4.3 Oráculos y métricas (trazabilidad TC → AC → umbral k6)

| TC | AC / hallazgo | Resultado esperado (R3) | Umbral k6 / métrica | Script |
|---|---|---|---|---|
| 01 | A-75, A-76, A-77 | p95 < 500 ms, error < 1 % | `http_req_duration{scenario:steady,name:GET …}` `p(95)<500` × 3 endpoints · `http_req_failed{scenario:steady}` `rate<0.01` | `tests/esc01-cp01-lecturas-catalogo.js` |
| 02 | A-75, A-76, HU-E3.2 | p95 < 1 s, error < 1 %, 0 sobreventas | `p(95)<1000` × 3 endpoints · `sobreventas` `count==0` (cierre: `cupo_vendido <= cupo_total`, `disponible >= 0`, y entradas emitidas = reservadas) | `tests/esc01-cp02-escrituras-compra.js` |
| 07 | A-75, A-76, HU-E5.2, **A-85** | < 2 s por respuesta, error < 1 %, sin crecimiento lineal | `max<2000` · `reporte_sin_n_mas_1` `rate==1` | `tests/esc01-cp03-reporte-ventas.js` |
| 05 | A-75, **A-84**, **A-86** | TTFT p95 < 3 s, error < 1 %, 20 turnos | `ttft_cliente_ms` y `ttft_servidor_ms` `p(95)<3000` · `turno_fallido` `rate<0.01` · `turnos_medidos` `count>=20` | `tests/esc02-cp04-ttft-chat.js` |
| 06 | A-75, **A-84** | p95 < 8 s, error < 1 %, 20 turnos | `turno_1_herramienta_ms` `p(95)<8000` · `turnos_medidos` `count>=20` | `tests/esc02-cp05-turno-con-herramienta.js` |
| 03 | A-79 | 100 % exceso ⇒ `429` + `Retry-After`; 0 `5xx`; 0 conexiones > 30 s | `contrato_429_ok` `rate==1` · `respuesta_fuera_de_contrato` `rate==0` · `respuestas_200` `rate<=1` (≤ 60 rpm) · `max<30000` | `tests/esc03-cp06-limite-de-tasa.js` |
| 04 | A-78 | p95 del otro equipo no se degrada > 20 %, error < 1 % | `handleSummary` → `reports/TC-PERF-04-veredicto.json` (`degradacion_pct <= 20`) · `http_req_failed` por fase | `tests/esc03-cp07-aislamiento-equipos.js` |

Métricas transversales en todos los scripts: `red_base_ms` (A-77, latencia de red base al `/health`), `checks`, `http_reqs`, `iteration_duration`.

> **Anti falso positivo:** un `p(95)` sobre una métrica sin muestras vale `0` y "pasa". Por eso las pruebas de IA exigen `turnos_medidos count>=20`.

## 5. Entorno de prueba y punto de medición

| Aspecto | Declaración |
|---|---|
| SUT | `https://testathon.testingperu.com` (producción de la Testathon, **compartido por 22 equipos**) |
| Punto de medición (A-77) | Cliente de carga k6 v2.2.0 en la máquina del equipo (Lima), no el servidor |
| Red base | Se mide en cada `setup()` (`red_base_ms`, 10 muestras a `/api/core/health`). Observado en smoke: **~130–150 ms** — consume ~30 % del presupuesto de 500 ms |
| Representatividad | No es un entorno aislado: los resultados incluyen ruido de otros equipos. Se reporta siempre la hora de ejecución y `red_base_ms` para contextualizar |
| Espacio del agente | Límite/cuota por token. Con el token compartido `svc_…` el espacio está saturado por los 22 equipos (ver §10) |

## 6. Datos de prueba

| Dato | Origen | Gestión |
|---|---|---|
| Semilla ~5200 entradas | Semilla del sistema (medido: **5511** vendidas en 24 eventos) | Si hay *reset* general, se regenera sola; el `setup()` descubre ids en vez de *hardcodear* |
| Evento para escrituras (TC-02) | Evento futuro del organizador del equipo (`organizador-testitans@…` → evento 20) | Se contamina **solo** el evento propio; nunca uno de otro equipo |
| Compradores (TC-02) | `POST /auth/registro` por iteración (`perf-testitans-…@ticketpe.test`) | Evita que el tope de 4 entradas/persona produzca 409 de negocio en la medición |
| Asistente de lectura (TC-01) | `asistente01@ticketpe.demo` (semilla) | Solo lectura |
| Reporte (TC-07) | `admin@ticketpe.demo` | Solo lectura; único rol que ve el reporte de cualquier evento |

## 7. Criterios de entrada, suspensión y salida

**Entrada (por corrida):**
1. `./run.sh smoke <TC>` pasa (shakedown 1 VU: script, datos y contrato OK) — *gate* obligatorio antes de `full`.
2. `GET /api/core/health` y `/api/v1/health` responden `200`.
3. Login de cuentas y descubrimiento de datos en `setup()` OK (si no, el script aborta con `Criterio de entrada: …`).
4. TC-03 y TC-04: `TEAM_TOKEN` propio definido (el script se niega a saturar el token compartido).

**Suspensión / reanudación:**
- `http_req_failed rate<0.10` con `abortOnFail` (30 s de gracia): si el SUT colapsa se aborta para no penalizar a otros equipos. Se reanuda tras verificar *health* y registrar el incidente.
- *Reset* de la semilla durante la corrida → se invalida la corrida y se repite.

**Salida:**
- Todos los umbrales k6 de los casos P1 evaluados (pasa/falla), con artefactos en `reports/`.
- Todo umbral incumplido se reporta como defecto R4 o se justifica como ruido de entorno con evidencia (`red_base_ms`, `agente_429_reintentados`).

## 8. Supuestos declarados

| ID | Supuesto | Por qué |
|---|---|---|
| A-84 | 20 turnos por medición de IA | R2 no fija muestra (heredado de R3) |
| **A-85** (nuevo) | N+1 se decide comparando el evento con menos vs más entradas (ratio ≥ 2×): el tiempo de servidor (TTFB − red base, mediana de 15) debe crecer **menos de la mitad** del ratio de entradas | "No crece linealmente al duplicar" no es observable sin duplicar datos en producción; se usa la variación natural de la semilla (50 → 329 entradas) |
| **A-86** (nuevo) | TTFT del cliente = TTFB del stream SSE (`timings.waiting`), contrastado con `usage.ttft_ms` del servidor | k6 core no expone lectura SSE incremental; upgrade: `xk6-sse` si ambas métricas divergen |
| A-87 (nuevo) | En TC-02, `409` en `POST /reservas` es respuesta de negocio correcta (sin cupo), no error | Al agotarse el evento el sistema **debe** responder 409; contarlo como error ocultaría la verificación de sobreventa |
| A-88 (nuevo) | En TC-05/06 un `429` no es muestra de latencia: se reintenta según `Retry-After` y se contabiliza en `agente_429_reintentados` | Aísla el ruido del espacio compartido del tiempo de inferencia |

## 9. Proceso de prueba (CT-PT) y entregables

| Actividad CT-PT | Qué se hace aquí | Entregable |
|---|---|---|
| Planificación | Este documento | `docs/estrategia-performance.md` |
| Análisis y diseño | R2 §6 + R3 Tabla 4 → perfiles y oráculos (§4) | Matriz §4.3 |
| Implementación | Framework k6 (ver `README.md`) | `lib/`, `tests/`, `run.sh` |
| Ejecución | `smoke` → `full` P1 → `full` P2, fuera de horas pico | `reports/*.json`, `reports/*.html` |
| Evaluación y reporte | Contrastar umbrales, separar red/servidor, reportar defectos con evidencia | Informe (§11) + bugs R4 |
| Cierre | Archivar reportes, lecciones aprendidas, supuestos a validar con PO | Commit en rama `testitans` |

## 10. Riesgos del proyecto de prueba

| Riesgo | Mitigación |
|---|---|
| Token compartido del agente saturado (smoke 16/09 11:00: 100 % `429` en `/chat` y `/chat/stream`, también con `X-Replay-Mode`) | Pedir `TEAM_TOKEN` propio por WhatsApp oficial; sin él TC-05/06 no son concluyentes y TC-03/04 no se ejecutan |
| Resultados contaminados por carga de otros equipos | Registrar hora, `red_base_ms`, repetir en horario valle; comparar línea base y carga en la misma corrida (TC-04) |
| Cuota de IA real agotada | TC-03/04 usan réplica; IA real solo en TC-05/06 (40 turnos) |
| *Reset* de datos en plena corrida | Descubrimiento dinámico en `setup()`; invalidar y repetir |
| Nuestra carga degrada a otros equipos | Perfiles acotados a R3, *pacing* en TC-03, criterio de suspensión, sin soak/spike |

## 11. Plantilla de informe de resultados

```markdown
### TC-PERF-0X · <nombre> · <PASA | FALLA>
- Fecha/hora (UTC-5): … · Perfil: full · Commit: …
- Condición ejecutada: <VUs, duración, warm-up> · Red base p95: … ms
- Resultado vs umbral: p95 … ms (umbral …) · error … % (umbral 1 %)
- Métricas adicionales: …
- Evidencia: reports/TC-PERF-0X-full.html, reports/TC-PERF-0X-full.json, trace_id (IA)
- Análisis: ¿servidor o red? (p95 − red base) · ¿ruido de entorno? (429 reintentados, hora)
- Defecto R4 asociado: …
```

## 12. Hallazgos tempranos (ejecución smoke, 16/09/2026)

| # | Hallazgo | Evidencia | Severidad propuesta |
|---|---|---|---|
| 1 | **`POST /reservas/:id/pago` emite 2 entradas para una reserva de `cantidad: 1`** y cobra solo 1 (total = precio × 1,18). Reproducido en 6/6 intentos (4 en smoke k6 + 2 manuales con curl, con y sin `Idempotency-Key`). Entradas no pagadas consumen aforo → riesgo de sobreventa | Check `pago emite exactamente 1 entrada por 1 reservada` de TC-PERF-02; respuesta `entradas[2]` con `desglose.total` de 1 unidad | Crítico (dinero / cupo) |
| 2 | El `429` responde `{error, mensaje}` + `Retry-After`; A-79 (R2) exigía `{codigo, mensaje}`. El contrato real (Swagger) es `{error}` → **corregir A-79**, no es defecto | Check informativo en TC-PERF-03 | — (ajuste de AC) |
| 3 | Espacio del token compartido saturado permanentemente → 100 % `429`, incluso en modo réplica | `agente_429_reintentados` en TC-PERF-06 smoke | Riesgo de proyecto (§10) |
| 4 | Latencia de red base ~130–150 ms desde Lima: el objetivo de 500 ms deja ~350 ms reales al servidor | `red_base_ms` | Informativo |
