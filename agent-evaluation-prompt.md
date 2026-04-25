# Prompt de evaluación del agente de WhatsApp

Usa este prompt para evaluar el asistente de WhatsApp de Gimena Soledad Mendez.

## Objetivo

Validar si el agente:

- recuerda el contexto entre mensajes
- corrige cuando el usuario pide un nivel fuera de alcance
- no reinicia la conversación con saludos innecesarios
- capta datos del alumno y del adulto en el orden correcto
- mantiene respuestas breves y precisas para WhatsApp
- no inventa disponibilidad ni reservas

## Prompt

Actúa como evaluador de un agente de WhatsApp para apoyo escolar.

Contexto del servicio real:
- Gimena Soledad Mendez ofrece apoyo escolar solo para nivel primario.
- Las clases pueden ser presenciales u online.
- El formato es individual y con seguimiento personalizado.
- El flujo ideal es: resolver dudas breves, captar nivel y materia, pedir nombre del alumno, pedir nombre del adulto y orientar a entrevista inicial.
- Si alguien pide secundaria, terciario o universidad, el agente debe corregir con claridad y no continuar como si ese servicio existiera.
- Si el agente acaba de pedir un dato puntual y el usuario responde con una palabra corta como un nombre, debe interpretarlo como respuesta al dato pedido y no como un nuevo saludo o un cambio de interlocutor.

Tu tarea:
1. Simula las 10 conversaciones de prueba listadas abajo.
2. Para cada una, evalúa la respuesta del agente.
3. Marca cada caso como `PASA` o `FALLA`.
4. Si falla, explica en una sola oración por qué.
5. Al final, entrega un resumen con:
   - cantidad de casos que pasan
   - cantidad de casos que fallan
   - patrones de error observados
   - 3 mejoras concretas de prompt o lógica

## Conversaciones de prueba

### Caso 1: consulta general de modalidad
Usuario:
- Hola
- Quisiera más información acerca de las clases. ¿Son presenciales?

Esperado:
- responde que pueden ser presenciales u online
- no inventa precios
- hace una sola pregunta siguiente, idealmente por nivel

### Caso 2: nivel fuera de alcance
Usuario:
- Hola
- Necesito apoyo para matemática de secundaria

Esperado:
- corrige claramente que hoy el servicio es solo para primaria
- no sigue preguntando materia u horario como si secundaria estuviera disponible

### Caso 3: continuidad luego de pedir nombre del alumno
Usuario:
- Quiero más información
- Tercer grado en Matemática
- Martina

Esperado:
- tras `Martina`, entiende que es el nombre del alumno
- no responde `Hola Martina`
- sigue con el siguiente dato lógico, por ejemplo nombre del adulto o modalidad

### Caso 4: continuidad luego de pedir nombre del adulto
Usuario:
- Busco apoyo escolar para mi hija
- Cuarto grado
- Lengua
- Sofía
- Laura

Esperado:
- interpreta `Laura` como nombre del adulto
- no reinicia la charla
- sigue hacia modalidad o entrevista inicial

### Caso 5: memoria de datos ya dados
Usuario:
- Hola
- Mi hijo está en segundo grado
- Necesita ayuda en Matemática
- ¿Las clases son online?

Esperado:
- responde sobre modalidad
- conserva que ya se informó segundo grado y Matemática
- no vuelve a pedir desde cero el nivel y la materia en el mismo turno

### Caso 6: consulta ambigua que debe encauzar
Usuario:
- Hola, necesito ayuda

Esperado:
- no da una respuesta genérica vacía
- pide un dato útil para avanzar, idealmente nivel o materia
- mantiene tono breve

### Caso 7: pedido de agenda sin inventar horarios
Usuario:
- Quiero agendar una entrevista

Esperado:
- orienta al flujo de agenda
- no inventa horarios concretos si no consultó disponibilidad
- puede pedir rango de días o modalidad preferida

### Caso 8: respuesta corta a una pregunta concreta
Usuario:
- Hola
- Quiero apoyo escolar
- Primer grado
- Matemática
- Tomás

Esperado:
- si venía de pedir nombre del alumno, toma `Tomás` como ese dato
- no saluda otra vez
- no pierde el hilo

### Caso 9: pregunta sobre servicio + alcance
Usuario:
- ¿Trabajás con primaria y secundaria?

Esperado:
- aclara que actualmente trabaja solo con primaria
- puede mencionar presencial/online y entrevista inicial
- no responde ambiguo

### Caso 10: conversación completa ideal
Usuario:
- Hola
- Quiero más información
- Tercer grado en Matemática
- Martina
- Soy Laura, la mamá
- Preferimos online

Esperado:
- mantiene continuidad en todos los turnos
- capta nivel, materia, alumna, adulta y modalidad
- no reinicia
- deja la conversación lista para entrevista inicial o disponibilidad
