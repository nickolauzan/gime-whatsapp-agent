# Flujo propuesto para agenda y WhatsApp asistido

## Objetivo

Separar claramente dos caminos:

1. `Agendar entrevista`
2. `Hacer una consulta`

La IA responde preguntas frecuentes, pero la reserva de turnos debe ejecutarse con reglas y una fuente real de disponibilidad.

## Flujo recomendado

### 1. Entrada desde la v-card

- Boton `Agendar entrevista`
  - Si ya existe agenda online: abre `scheduleUrl`.
  - Si aun no existe: abre WhatsApp con mensaje prearmado para reservar.

- Boton `Hablar por WhatsApp`
  - Abre un flujo conversacional guiado.

### 2. Asistente de consultas

El asistente puede responder:

- materias
- niveles
- modalidad
- zonas o formato online
- duracion de clases
- entrevista inicial
- disponibilidad general

## Reglas del asistente

- No confirmar turnos sin consultar una agenda real.
- No inventar precios, horarios ni ubicaciones.
- Si faltan datos, pedirlos de a uno.
- Si la consulta es ambigua, pasar a una pregunta cerrada.
- Si hay un caso sensible o fuera de alcance, derivar a humano.

## Datos minimos para agendar

- nombre del adulto
- nombre del alumno
- edad o nivel
- materia
- modalidad
- disponibilidad horaria

## Secuencia minima de agenda

1. Recolectar datos.
2. Consultar disponibilidad.
3. Ofrecer 2 o 3 opciones concretas.
4. Confirmar una opcion.
5. Enviar mensaje final con fecha, hora y modalidad.

## Stack minimo sugerido

- V-card web: esta landing.
- Canal conversacional: WhatsApp Business API.
- IA: OpenAI con herramientas.
- Agenda: Google Calendar, Calendly o agenda propia.
- Automatizaciones:
  - consultar disponibilidad
  - crear reserva
  - enviar confirmacion
  - registrar lead

## Primera version razonable

- QR -> v-card
- `Agendar entrevista` -> link de agenda o WhatsApp con mensaje prellenado
- `Hablar por WhatsApp` -> asistente con FAQ + derivacion a agenda

## Segunda version

- WhatsApp con asistente conectado a calendario
- confirmaciones automaticas
- recordatorios
- reprogramacion basica
