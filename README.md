# GIME V-Card

Landing vertical y mobile-first para usar como destino del QR del folleto impreso.

## Frontend

- `index.html`: estructura principal de la v-card.
- `styles.css`: diseno visual orientado a celular.
- `app.js`: configuracion de nombre, WhatsApp, email, agenda y ano dinamico.

## Backend para Netlify

Se agrego una base serverless compatible con Netlify Functions para el agente de WhatsApp.

- `netlify.toml`: configuracion de build y redirects de API.
- `netlify/functions/health.js`: healthcheck.
- `netlify/functions/whatsapp-webhook.js`: verificacion GET y webhook POST de Meta.
- `netlify/functions/agent-reply.js`: endpoint de prueba manual para generar respuestas.
- `netlify/functions/agent-book.js`: stub de reserva.
- `netlify/functions/lib/`: configuracion, agente, servicios y helpers.
- `data/faq.json`: base de conocimiento inicial.
- `.env.example`: variables de entorno necesarias.

## Endpoints

- `/api/health`
- `/api/webhooks/whatsapp`
- `/api/agent/reply`
- `/api/agent/book`

## Variables de entorno

Definilas en Netlify:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

## Notas

- Si `OPENAI_API_KEY` no esta configurada, el agente cae a respuestas FAQ simples.
- Si WhatsApp no esta configurado, el webhook recibe eventos pero no puede responder al usuario.
- La reserva automatica y la agenda real quedaron estructuradas, pero todavia devuelven estado manual hasta integrar Google Calendar.
