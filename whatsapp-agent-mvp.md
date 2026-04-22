# WhatsApp Agent MVP

## Objetivo

Construir un agente de IA para WhatsApp que:

- responda consultas frecuentes sobre apoyo escolar
- califique al contacto
- recolecte datos del alumno
- ofrezca entrevista inicial
- consulte disponibilidad real
- reserve un turno o derive a humano

El agente no debe improvisar operaciones críticas. Debe conversar con IA y ejecutar acciones con herramientas controladas.

## Alcance del MVP

### Sí incluye

- atención de consultas por WhatsApp
- respuestas sobre modalidad, materias, nivel y proceso de trabajo
- captura de datos mínimos del lead
- propuesta de entrevista inicial
- consulta de disponibilidad
- creación de reserva
- derivación a humano cuando corresponda

### No incluye en la primera versión

- cobros
- reprogramaciones complejas
- múltiples agentes especializados
- analítica avanzada
- campañas salientes automatizadas

## Arquitectura elegida

### Canal

- Meta WhatsApp Cloud API

### Entrada

- webhook HTTPS público

### Orquestación

- backend propio con `FastAPI`

### Motor de IA

- OpenAI `Responses API`
- uso de `function calling` con herramientas estrictas

### Persistencia

- `PostgreSQL`

### Agenda

- `Google Calendar`

### Hosting sugerido

- backend: Render, Railway o VPS
- base de datos: Supabase Postgres, Neon o PostgreSQL propio

## Stack recomendado

- Python 3.12
- FastAPI
- Uvicorn
- OpenAI Python SDK
- PostgreSQL
- SQLAlchemy o SQLModel
- Alembic
- Redis opcional para colas y rate limiting
- Google Calendar API

## Herramientas del agente

Estas son las tools que el modelo puede llamar.

### 1. `search_faq`

Busca respuestas en una base de conocimiento curada.

#### Entrada

- `question`

#### Salida

- `answer`
- `confidence`
- `source`

### 2. `get_services`

Devuelve la propuesta vigente del servicio.

#### Salida

- niveles atendidos
- materias
- modalidades
- duración estimada
- formato de entrevista inicial

### 3. `save_lead`

Guarda o actualiza los datos de la conversación.

#### Entrada

- `adult_name`
- `student_name`
- `student_level`
- `student_age`
- `subject`
- `modality`
- `notes`
- `whatsapp_user_id`

### 4. `get_availability`

Consulta disponibilidad real para entrevistas.

#### Entrada

- `date_from`
- `date_to`
- `preferred_modality`

#### Salida

- lista de slots

### 5. `book_interview`

Reserva una entrevista.

#### Entrada

- `adult_name`
- `student_name`
- `subject`
- `slot_start`
- `slot_end`
- `modality`
- `whatsapp_user_id`

#### Salida

- `booking_id`
- `status`
- `calendar_event_id`

### 6. `handoff_to_human`

Marca la conversación para seguimiento manual.

#### Entrada

- `reason`
- `priority`
- `summary`
- `whatsapp_user_id`

### 7. `get_conversation_context`

Recupera el estado de la conversación y datos del lead.

#### Entrada

- `whatsapp_user_id`

## Reglas del agente

- No inventar horarios.
- No confirmar reservas sin usar `get_availability` y `book_interview`.
- No inventar precios ni promociones.
- Hacer una sola pregunta por vez si faltan datos.
- Mantener respuestas breves y naturales para WhatsApp.
- Si detecta confusión, resumir y ofrecer dos caminos:
  - consultar
  - agendar entrevista
- Si el caso sale del alcance, llamar `handoff_to_human`.

## Datos mínimos que debe captar

- nombre del adulto
- nombre del alumno
- nivel o edad
- materia principal
- modalidad preferida
- franja horaria

## Base de conocimiento inicial

La knowledge base del MVP debe incluir:

- qué es el servicio
- nivel atendido
- materias
- modalidad presencial y online
- cómo es la entrevista inicial
- duración estimada de clases
- cómo se coordina
- zonas o alcance si aplica
- preguntas frecuentes

## Modelo de datos

### Tabla `leads`

- `id`
- `whatsapp_user_id`
- `adult_name`
- `student_name`
- `student_age`
- `student_level`
- `subject`
- `modality`
- `status`
- `created_at`
- `updated_at`

### Tabla `conversations`

- `id`
- `whatsapp_user_id`
- `last_intent`
- `last_summary`
- `needs_human`
- `last_seen_at`

### Tabla `messages`

- `id`
- `conversation_id`
- `role`
- `channel`
- `message_text`
- `tool_name`
- `tool_payload`
- `created_at`

### Tabla `bookings`

- `id`
- `lead_id`
- `calendar_event_id`
- `slot_start`
- `slot_end`
- `status`
- `created_at`

## Flujo conversacional base

### Flujo 1. Consulta general

1. Llega mensaje por webhook.
2. Backend identifica usuario.
3. Recupera contexto.
4. Llama a OpenAI con instrucciones + tools.
5. Si es pregunta frecuente, usa `search_faq` o `get_services`.
6. Responde por WhatsApp.
7. Si detecta intención de agendar, cambia al flujo 2.

### Flujo 2. Agenda de entrevista

1. Pregunta datos faltantes.
2. Guarda lead con `save_lead`.
3. Consulta disponibilidad con `get_availability`.
4. Ofrece 2 o 3 opciones.
5. Usuario elige una.
6. Reserva con `book_interview`.
7. Confirma fecha, hora y modalidad.

### Flujo 3. Derivación

1. El agente detecta caso fuera de alcance.
2. Resume el caso.
3. Ejecuta `handoff_to_human`.
4. Responde que el caso será continuado personalmente.

## Prompt del agente

### Rol

Asistente de WhatsApp de Gimena Soledad Mendez para apoyo escolar.

### Tarea

- responder preguntas con claridad
- guiar al contacto hacia entrevista inicial
- recolectar datos del alumno
- reservar solo usando herramientas reales

### Estilo

- cálido
- breve
- profesional
- sin párrafos largos
- una pregunta por vez

### Límites

- no inventes información faltante
- no confirmes turnos sin herramienta
- si no sabes algo, deriva

## Endpoint mínimos del backend

- `GET /health`
- `GET /webhooks/whatsapp` para verificación de Meta
- `POST /webhooks/whatsapp` para eventos entrantes
- `POST /internal/agent/reply`
- `POST /internal/agent/book`

## Integración con Google Calendar

Para el MVP:

- un calendario exclusivo para entrevistas
- slots de 20 o 30 minutos
- disponibilidad consultada por API
- eventos con nombre del adulto, alumno, materia y modalidad

## Seguridad mínima

- validar firma del webhook de Meta
- usar variables de entorno para tokens y claves
- registrar logs sin exponer datos sensibles
- rate limiting básico por usuario
- idempotencia para evitar mensajes duplicados

## Observabilidad mínima

- log de webhook recibido
- log de respuesta del modelo
- log de tool calls
- log de errores de agenda
- trazabilidad por `whatsapp_user_id`

## Roadmap después del MVP

### Fase 2

- recordatorios automáticos
- reprogramación simple
- plantillas aprobadas para seguimiento
- panel básico de leads

### Fase 3

- agente separado para agenda
- RAG más robusto
- métricas de conversión
- clasificación de intención más fina

## Decisión final

El MVP queda definido así:

- `Canal`: WhatsApp Cloud API
- `Backend`: FastAPI
- `IA`: OpenAI Responses API + function calling
- `Agenda`: Google Calendar
- `DB`: PostgreSQL
- `Tools`: FAQ, servicios, guardar lead, disponibilidad, reserva, derivación
- `Objetivo principal`: responder consultas y cerrar entrevistas iniciales
