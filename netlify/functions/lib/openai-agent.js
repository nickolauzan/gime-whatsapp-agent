const OpenAI = require("openai");
const { getConfig } = require("./config");
const {
  searchFaq,
  getServices,
  saveLead,
  getAvailability,
  bookInterview,
  handoffToHuman,
  getConversationContext,
  generateFallbackReply
} = require("./services");
const {
  appendHistory,
  buildConversationSummary,
  loadConversation,
  mergeLead,
  saveConversation
} = require("./conversation-store");

const SYSTEM_PROMPT = `
Sos el asistente de WhatsApp de Gimena Soledad Mendez para apoyo escolar.

Tu objetivo es:
- responder consultas breves con claridad
- guiar al contacto hacia una entrevista inicial
- captar datos utiles del alumno sin perder el hilo
- usar herramientas solo cuando hagan falta

Contexto fijo del servicio:
- el servicio actual esta orientado solo a nivel primario
- las clases pueden ser presenciales u online
- el formato es individual y con seguimiento personalizado

Reglas obligatorias:
- si el usuario pide secundaria, terciario o universidad, corregilo con claridad: deci que hoy el servicio es solo para primaria y no sigas como si ese nivel estuviera disponible
- asumi por defecto que quien escribe es padre, madre o tutor y que consulta por un menor
- no preguntes si el apoyo es para la persona que escribe, salvo que ella diga explicitamente que busca apoyo para si misma
- no reinventes la conversacion en cada turno
- no saludes de nuevo en mitad del chat
- si el ultimo mensaje del asistente pidio un dato concreto y el usuario responde con un dato corto, interpretalo como respuesta a esa pregunta
- no asumas que un nombre corto significa que ahora habla otra persona
- hace una sola pregunta por vez si faltan datos
- no inventes horarios ni reservas
- si preguntan por disponibilidad, agenda, manana, un dia puntual, semana que viene o proximo turno, consulta la agenda antes de responder
- cuando hables de agenda, usa fechas absolutas con dia y mes
- no inventes precios
- responde en espanol rioplatense, con tono calido y profesional
- mantenete breve, natural y apto para WhatsApp
- evita repetir toda la ficha del alumno en cada mensaje
- si ya captaste un dato, avanza al siguiente punto sin reformular todo
`.trim();

const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "search_faq",
    description: "Busca respuestas en la base de preguntas frecuentes.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        question: { type: "string" }
      },
      required: ["question"]
    }
  },
  {
    type: "function",
    name: "get_services",
    description: "Devuelve la propuesta actual del servicio de apoyo escolar.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "save_lead",
    description: "Guarda o actualiza los datos que ya compartio la familia.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        adult_name: { type: ["string", "null"] },
        student_name: { type: ["string", "null"] },
        student_level: { type: ["string", "null"] },
        student_age: { type: ["string", "null"] },
        subject: { type: ["string", "null"] },
        modality: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
        whatsapp_user_id: { type: "string" }
      },
      required: [
        "adult_name",
        "student_name",
        "student_level",
        "student_age",
        "subject",
        "modality",
        "notes",
        "whatsapp_user_id"
      ]
    }
  },
  {
    type: "function",
    name: "get_availability",
    description: "Consulta horarios disponibles para entrevista inicial.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        preferred_modality: { type: "string" }
      },
      required: ["date_from", "date_to", "preferred_modality"]
    }
  },
  {
    type: "function",
    name: "book_interview",
    description: "Reserva una entrevista usando datos confirmados.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        adult_name: { type: "string" },
        student_name: { type: "string" },
        subject: { type: ["string", "null"] },
        slot_start: { type: "string" },
        slot_end: { type: "string" },
        modality: { type: "string" },
        whatsapp_user_id: { type: "string" }
      },
      required: ["adult_name", "student_name", "slot_start", "slot_end", "whatsapp_user_id", "modality", "subject"]
    }
  },
  {
    type: "function",
    name: "handoff_to_human",
    description: "Deriva la conversacion a una persona.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
        priority: { type: "string" },
        summary: { type: "string" },
        whatsapp_user_id: { type: "string" }
      },
      required: ["reason", "summary", "whatsapp_user_id", "priority"]
    }
  },
  {
    type: "function",
    name: "get_conversation_context",
    description: "Recupera el contexto previo de la conversacion.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        whatsapp_user_id: { type: "string" }
      },
      required: ["whatsapp_user_id"]
    }
  }
];

const SUBJECT_PATTERNS = [
  { pattern: /\bmat(e|é)matica(s)?\b/, value: "Matematica" },
  { pattern: /\blengua\b/, value: "Lengua" },
  { pattern: /\bciencias?\b/, value: "Ciencias" },
  { pattern: /\btecnicas? de estudio\b/, value: "Tecnicas de estudio" }
];

const UNSUPPORTED_LEVEL_PATTERN =
  /\b(secundaria|secundario|terciario|universidad|universitario|facultad|cbc)\b/;

const PRIMARY_LEVEL_PATTERN =
  /\b(primaria|primario|primer grado|segundo grado|tercer grado|cuarto grado|quinto grado|sexto grado|1ro|2do|3ro|4to|5to|6to|grado)\b/;

const WEEKDAY_LABELS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado"
];

const WEEKDAY_INDEX_BY_NAME = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6
};

const ASSISTANT_TRIGGER_PATTERN =
  /\b(agendar|coordinar|reservar)\b.*\b(entrevista|entrevista inicial)\b.*\b(apoyo escolar|clases|primario|primaria)?\b/;

const ASSISTANT_STOP_PATTERNS = [
  /\b(deja|deje|dejen|detene|detener|frena|frenar)\b.*\b(asistente|bot|ia|automat(ic|iz)ado|respuesta(s)? automatica(s)?)\b/,
  /\b(no quiero|no quisiera|prefiero no)\b.*\b(asistente|bot|ia|automat(ic|iz)ado)\b/,
  /\b(quiero|prefiero|necesito)\b.*\b(hablar|seguir)\b.*\b(con una persona|con alguien|con gimena|directamente)\b/,
  /\b(pasa(me)?|deriva(me)?)\b.*\b(con una persona|con gimena|a humano)\b/,
  /\bfin del asistente\b/,
  /\bdeja la conversacion libre\b/
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function shouldActivateAssistant(messageText) {
  const normalized = normalizeText(messageText);

  if (!normalized) {
    return false;
  }

  return ASSISTANT_TRIGGER_PATTERN.test(normalized);
}

function shouldDeactivateAssistant(messageText) {
  const normalized = normalizeText(messageText);
  return ASSISTANT_STOP_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildAssistantDisabledReply() {
  return "Perfecto. Dejo la conversación libre para que siga Gimena por acá.";
}

function shouldSendActivationOpening(messageText, conversation, leadPatch) {
  return (
    shouldActivateAssistant(messageText) &&
    !conversation.lead.studentLevel &&
    !conversation.lead.subject &&
    !leadPatch.studentLevel &&
    !leadPatch.subject
  );
}

function buildActivationOpeningReply() {
  return "Perfecto. Para coordinar la entrevista inicial, ¿me decís en qué grado está el alumno y qué materia necesitan reforzar?";
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayLookup = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    weekdayIndex: weekdayLookup[map.weekday] ?? null,
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10)
  };
}

function addDaysToDateKey(dateKey, days, utcOffset) {
  const date = new Date(`${dateKey}T12:00:00${utcOffset}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildOffsetDateTime(dateKey, hours, minutes, utcOffset) {
  return `${dateKey}T${padTwo(hours)}:${padTwo(minutes)}:00${utcOffset}`;
}

function formatWindowLabel(dateTimeIso, timeZone) {
  const date = new Date(dateTimeIso);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function formatSlotsList(slots, timeZone) {
  return slots
    .map((slot) => {
      if (slot.label) {
        return slot.label;
      }

      return formatWindowLabel(slot.start, timeZone);
    })
    .join(", ");
}

function parseTimeFromMessage(messageText) {
  const match = String(messageText || "").match(
    /\b(?:a\s*las?\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas)?\b/i,
  );

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2] || "0", 10);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function looksLikeAvailabilityIntent(messageText) {
  const normalized = normalizeText(messageText);
  const hasScheduleKeywords =
    /\b(disponible|disponibilidad|turno|turnos|horario|horarios|agenda|agendar|entrevista)\b/.test(
      normalized,
    );
  const hasRelativeDay = /\b(hoy|manana)\b/.test(normalized);
  const hasWeekdayReference =
    /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(normalized);
  const hasSchedulingQualifier =
    /\?/.test(String(messageText || "")) ||
    /\b(a las|por la|puede ser|te viene|me viene|serviria|serviria|libre|disponible)\b/.test(
      normalized,
    );

  return (
    hasScheduleKeywords ||
    hasRelativeDay ||
    /\bsemana que viene\b/.test(normalized) ||
    /\bproximo horario\b|\bsiguiente horario\b|\bprimer horario\b|\bproximo turno\b/.test(normalized) ||
    (hasWeekdayReference && hasSchedulingQualifier)
  );
}

function isGeneralHoursQuestion(messageText) {
  const normalized = normalizeText(messageText);

  return (
    /\bque dias y horarios\b/.test(normalized) ||
    /\bque horarios trabajas\b/.test(normalized) ||
    /\bdias y horarios\b/.test(normalized) ||
    /\bcuando trabajas\b/.test(normalized)
  );
}

function wantsNextAvailable(messageText) {
  const normalized = normalizeText(messageText);

  return (
    /\bproximo horario disponible\b/.test(normalized) ||
    /\bcual es el proximo horario\b/.test(normalized) ||
    /\bsiguiente horario\b/.test(normalized) ||
    /\bprimer horario\b/.test(normalized) ||
    /\bque tenes disponible\b/.test(normalized) ||
    /\bque dias y horarios\b/.test(normalized) ||
    /\bsemana que viene\b/.test(normalized)
  );
}

function getPreferredModality(conversation) {
  return conversation.lead.modality || "Presencial";
}

function getTimeSegment(messageText) {
  const normalized = normalizeText(messageText);

  if (/\bpor la manana\b/.test(normalized)) {
    return { startHour: 0, startMinute: 0, endHour: 12, endMinute: 59 };
  }

  if (/\bpor la tarde\b/.test(normalized)) {
    return { startHour: 13, startMinute: 0, endHour: 17, endMinute: 59 };
  }

  if (/\bpor la noche\b/.test(normalized)) {
    return { startHour: 18, startMinute: 0, endHour: 23, endMinute: 59 };
  }

  return null;
}

function resolveSpecificDateKey(messageText, config) {
  const normalized = normalizeText(messageText);
  const nowParts = getLocalDateParts(new Date(), config.googleCalendarTimezone);

  if (/\bhoy\b/.test(normalized)) {
    return nowParts.dateKey;
  }

  if (/^manana\b/.test(normalized) || (/\bmanana\b/.test(normalized) && !/\bpor la manana\b/.test(normalized))) {
    return addDaysToDateKey(nowParts.dateKey, 1, config.googleCalendarUtcOffset);
  }

  for (const [weekdayName, weekdayIndex] of Object.entries(WEEKDAY_INDEX_BY_NAME)) {
    if (new RegExp(`\\b${weekdayName}\\b`).test(normalized)) {
      let delta = (weekdayIndex - nowParts.weekdayIndex + 7) % 7;

      if (delta === 0) {
        delta = 7;
      }

      return addDaysToDateKey(nowParts.dateKey, delta, config.googleCalendarUtcOffset);
    }
  }

  return "";
}

function resolveNextWeekWindow(config) {
  const nowParts = getLocalDateParts(new Date(), config.googleCalendarTimezone);
  const currentWeekMondayDelta = (8 - nowParts.weekdayIndex) % 7 || 7;
  const mondayDateKey = addDaysToDateKey(
    nowParts.dateKey,
    currentWeekMondayDelta,
    config.googleCalendarUtcOffset,
  );
  const fridayDateKey = addDaysToDateKey(mondayDateKey, 4, config.googleCalendarUtcOffset);

  return {
    dateFrom: buildOffsetDateTime(mondayDateKey, 0, 0, config.googleCalendarUtcOffset),
    dateTo: buildOffsetDateTime(fridayDateKey, 23, 59, config.googleCalendarUtcOffset)
  };
}

function resolveAvailabilityRequest(messageText, conversation, config) {
  if (!looksLikeAvailabilityIntent(messageText)) {
    return null;
  }

  if (isGeneralHoursQuestion(messageText)) {
    return { kind: "general_hours" };
  }

  const normalized = normalizeText(messageText);
  const preferredModality = getPreferredModality(conversation);
  const nowParts = getLocalDateParts(new Date(), config.googleCalendarTimezone);

  if (wantsNextAvailable(messageText)) {
    if (/\bsemana que viene\b/.test(normalized)) {
      const nextWeekWindow = resolveNextWeekWindow(config);

      return {
        kind: "window",
        label: "la semana que viene",
        preferredModality,
        ...nextWeekWindow
      };
    }

    return {
      kind: "next_available",
      preferredModality,
      dateFrom: buildOffsetDateTime(
        nowParts.dateKey,
        nowParts.hour,
        nowParts.minute,
        config.googleCalendarUtcOffset,
      ),
      dateTo: buildOffsetDateTime(
        addDaysToDateKey(nowParts.dateKey, 14, config.googleCalendarUtcOffset),
        23,
        59,
        config.googleCalendarUtcOffset,
      )
    };
  }

  const dateKey = resolveSpecificDateKey(messageText, config);

  if (!dateKey) {
    return null;
  }

  const specificTime = parseTimeFromMessage(messageText);

  if (specificTime) {
    const slotStart = buildOffsetDateTime(
      dateKey,
      specificTime.hours,
      specificTime.minutes,
      config.googleCalendarUtcOffset,
    );
    const slotEndDate = new Date(slotStart);
    slotEndDate.setUTCMinutes(slotEndDate.getUTCMinutes() + config.interviewDurationMinutes);

    return {
      kind: "exact_slot",
      preferredModality,
      dateFrom: slotStart,
      dateTo: slotEndDate.toISOString(),
      requestedSlotStart: slotStart
    };
  }

  const timeSegment = getTimeSegment(messageText);

  if (timeSegment) {
    return {
      kind: "window",
      label: formatWindowLabel(
        buildOffsetDateTime(dateKey, timeSegment.startHour, timeSegment.startMinute, config.googleCalendarUtcOffset),
        config.googleCalendarTimezone,
      ),
      preferredModality,
      dateFrom: buildOffsetDateTime(
        dateKey,
        timeSegment.startHour,
        timeSegment.startMinute,
        config.googleCalendarUtcOffset,
      ),
      dateTo: buildOffsetDateTime(
        dateKey,
        timeSegment.endHour,
        timeSegment.endMinute,
        config.googleCalendarUtcOffset,
      )
    };
  }

  return {
    kind: "window",
    label: dateKey,
    preferredModality,
    dateFrom: buildOffsetDateTime(dateKey, 0, 0, config.googleCalendarUtcOffset),
    dateTo: buildOffsetDateTime(dateKey, 23, 59, config.googleCalendarUtcOffset)
  };
}

function formatWorkdayWindows(workdayWindows) {
  const windows = String(workdayWindows || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace("-", " a "));

  return windows.join(" y ");
}

async function findFallbackNextAvailable(preferredModality, config) {
  const nowParts = getLocalDateParts(new Date(), config.googleCalendarTimezone);
  return getAvailability({
    date_from: buildOffsetDateTime(
      nowParts.dateKey,
      nowParts.hour,
      nowParts.minute,
      config.googleCalendarUtcOffset,
    ),
    date_to: buildOffsetDateTime(
      addDaysToDateKey(nowParts.dateKey, 14, config.googleCalendarUtcOffset),
      23,
      59,
      config.googleCalendarUtcOffset,
    ),
    preferred_modality: preferredModality
  });
}

async function generateAvailabilityReply(messageText, conversation, config) {
  const resolved = resolveAvailabilityRequest(messageText, conversation, config);

  if (!resolved) {
    return "";
  }

  if (resolved.kind === "general_hours") {
    const windowsLabel = formatWorkdayWindows(config.workdayWindows);
    return `Las entrevistas iniciales las estoy coordinando de lunes a viernes, de ${windowsLabel}. Si queres, te busco un horario puntual.`;
  }

  console.log("calendar query requested:", JSON.stringify(resolved));

  const availability = await getAvailability({
    date_from: resolved.dateFrom,
    date_to: resolved.dateTo,
    preferred_modality: resolved.preferredModality
  });

  console.log("calendar query result:", JSON.stringify(availability));

  if (availability.status !== "calendar_connected") {
    return availability.message || "Todavia no tengo la agenda conectada para confirmar horarios.";
  }

  const slots = availability.suggested_slots || [];

  if (resolved.kind === "exact_slot") {
    const requestedStartMs = new Date(resolved.requestedSlotStart).getTime();
    const exactMatch = slots.find((slot) => new Date(slot.start).getTime() === requestedStartMs);

    if (exactMatch) {
      return `Si, ese horario esta disponible: ${exactMatch.label}. Si queres, te lo reservo.`;
    }

    const fallback = await findFallbackNextAvailable(resolved.preferredModality, config);
    const fallbackSlots = fallback.suggested_slots || [];

    if (fallback.status === "calendar_connected" && fallbackSlots.length) {
      return `Ese horario no lo tengo libre. El proximo turno que veo es ${fallbackSlots[0].label}. Si queres, te lo reservo.`;
    }

    return "Ese horario no lo tengo libre. Si queres, probamos con otro dia u horario.";
  }

  if (slots.length) {
    if (resolved.kind === "next_available") {
      const visibleSlots = slots.slice(0, 3);
      return `Los proximos horarios que tengo son ${formatSlotsList(visibleSlots, config.googleCalendarTimezone)}. Si queres, te reservo uno.`;
    }

    const visibleSlots = slots.slice(0, 3);
    return `Para ese momento tengo ${formatSlotsList(visibleSlots, config.googleCalendarTimezone)}. Si queres, te reservo uno.`;
  }

  const fallback = await findFallbackNextAvailable(resolved.preferredModality, config);
  const fallbackSlots = fallback.suggested_slots || [];

  if (fallback.status === "calendar_connected" && fallbackSlots.length) {
    return `En ese horario no tengo lugar. El proximo disponible que veo es ${fallbackSlots[0].label}. Si queres, te lo reservo.`;
  }

  return "No encontre espacios libres en esa franja. Si queres, proponeme otro dia u horario.";
}

function extractText(response) {
  if (response.output_text) {
    return response.output_text.trim();
  }

  const message = (response.output || []).find((item) => item.type === "message");
  const textBlock = message?.content?.find((item) => item.type === "output_text");
  return textBlock?.text?.trim() || "";
}

function detectUnsupportedLevel(messageText) {
  return UNSUPPORTED_LEVEL_PATTERN.test(normalizeText(messageText));
}

function looksLikeName(text) {
  const trimmed = String(text || "").trim();

  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) {
    return false;
  }

  if (/[?!.,:;@/\\]/.test(trimmed)) {
    return false;
  }

  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(trimmed);
}

function extractLeadPatch(messageText, conversation) {
  const normalized = normalizeText(messageText);
  const patch = {};

  if (PRIMARY_LEVEL_PATTERN.test(normalized)) {
    patch.studentLevel = String(messageText || "").trim();
  }

  for (const subject of SUBJECT_PATTERNS) {
    if (subject.pattern.test(normalized)) {
      patch.subject = subject.value;
      break;
    }
  }

  if (/\bonline\b|\bvirtual\b/.test(normalized)) {
    patch.modality = "Online";
  }

  if (/\bpresencial\b/.test(normalized)) {
    patch.modality = "Presencial";
  }

  if (conversation.awaitingField === "student_name" && looksLikeName(messageText)) {
    patch.studentName = String(messageText || "").trim();
  }

  if (conversation.awaitingField === "adult_name" && looksLikeName(messageText)) {
    patch.adultName = String(messageText || "").trim();
  }

  return patch;
}

function inferAwaitingField(replyText) {
  const normalized = normalizeText(replyText);

  if (normalized.includes("nombre del alumno")) {
    return "student_name";
  }

  if (
    normalized.includes("tu nombre") ||
    normalized.includes("nombre del adulto") ||
    normalized.includes("nombre de quien consulta")
  ) {
    return "adult_name";
  }

  if (normalized.includes("nivel") || normalized.includes("grado")) {
    return "student_level";
  }

  if (normalized.includes("materia")) {
    return "subject";
  }

  if (normalized.includes("presencial u online") || normalized.includes("modalidad")) {
    return "modality";
  }

  if (normalized.includes("horario") || normalized.includes("disponibilidad")) {
    return "availability";
  }

  return null;
}

function inferConversationStatus(conversation) {
  if (conversation.status === "unsupported_level") {
    return "unsupported_level";
  }

  if (conversation.awaitingField) {
    return "collecting_data";
  }

  if (conversation.lead.studentLevel && conversation.lead.subject) {
    return "qualified";
  }

  return "active";
}

function buildUnsupportedLevelReply() {
  return (
    "Hoy el servicio de Gimena esta orientado solo a nivel primario. " +
    "Si queres, te cuento como trabaja para primaria o dejo tu consulta para derivacion manual."
  );
}

function buildRuntimeContext(conversation, profileName) {
  const serviceScope =
    "Servicio actual: apoyo escolar individual para nivel primario, presencial u online.";
  const config = getConfig();
  const nowParts = getLocalDateParts(new Date(), config.googleCalendarTimezone);

  const knownData = [
    `contacto_whatsapp=${profileName || conversation.profileName || "sin_dato"}`,
    `adulto=${conversation.lead.adultName || "sin_dato"}`,
    `alumno=${conversation.lead.studentName || "sin_dato"}`,
    `nivel=${conversation.lead.studentLevel || "sin_dato"}`,
    `materia=${conversation.lead.subject || "sin_dato"}`,
    `modalidad=${conversation.lead.modality || "sin_dato"}`,
    `rol_interlocutor_esperado=adulto_responsable`,
    `fecha_local_actual=${nowParts.dateKey}`,
    `dia_local_actual=${WEEKDAY_LABELS[nowParts.weekdayIndex] || "sin_dato"}`,
    `hora_local_actual=${padTwo(nowParts.hour)}:${padTwo(nowParts.minute)}`,
    `zona_horaria=${config.googleCalendarTimezone}`,
    `franjas_entrevista=${config.workdayWindows}`,
    `esperando=${conversation.awaitingField || "ninguno"}`,
    `estado=${conversation.status || "new"}`
  ].join("\n");

  return `Contexto de esta conversacion de WhatsApp:\n${serviceScope}\n${knownData}`;
}

function buildModelInput(conversation, profileName) {
  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: SYSTEM_PROMPT }]
    },
    {
      role: "system",
      content: [{ type: "input_text", text: buildRuntimeContext(conversation, profileName) }]
    }
  ];

  for (const item of conversation.history) {
    input.push({
      role: item.role,
      content: [
        {
          type: item.role === "assistant" ? "output_text" : "input_text",
          text: item.text
        }
      ]
    });
  }

  return input;
}

async function executeTool(name, args) {
  console.log("OpenAI tool call:", name, JSON.stringify(args));

  let result;

  switch (name) {
    case "search_faq":
      result = await searchFaq(args);
      break;
    case "get_services":
      result = await getServices();
      break;
    case "save_lead":
      result = await saveLead(args);
      break;
    case "get_availability":
      result = await getAvailability(args);
      break;
    case "book_interview":
      result = await bookInterview(args);
      break;
    case "handoff_to_human":
      result = await handoffToHuman(args);
      break;
    case "get_conversation_context":
      result = await getConversationContext(args);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  console.log("OpenAI tool result:", name, JSON.stringify(result));
  return result;
}

async function generateRuleBasedReply(messageText, conversation) {
  if (conversation.awaitingField === "student_name" && conversation.lead.studentName) {
    return "Gracias. ¿Me compartis tu nombre para seguir con la entrevista inicial?";
  }

  if (conversation.awaitingField === "adult_name" && conversation.lead.adultName) {
    return "Perfecto. ¿Preferis modalidad presencial u online?";
  }

  if (conversation.lead.studentLevel && conversation.lead.subject && !conversation.lead.studentName) {
    return "Gracias por la informacion. ¿Podrias decirme el nombre del alumno?";
  }

  const faqAnswer = await generateFallbackReply(messageText);
  return faqAnswer || "Gracias por escribir. Si queres, contame nivel y materia para orientarte mejor.";
}

async function finalizeConversation(conversation, replyText, responseId) {
  let updatedConversation = appendHistory(conversation, "assistant", replyText);
  updatedConversation = {
    ...updatedConversation,
    awaitingField: inferAwaitingField(replyText),
    lastAssistantReply: replyText,
    lastModelResponseId: responseId || conversation.lastModelResponseId,
    summary: buildConversationSummary(updatedConversation)
  };
  updatedConversation.status = inferConversationStatus(updatedConversation);
  await saveConversation(updatedConversation);
  return replyText;
}

async function generateAgentReply({ messageText, whatsappUserId, profileName }) {
  const config = getConfig();
  const trimmedMessage = String(messageText || "").trim();
  let conversation = await loadConversation(whatsappUserId);

  conversation = {
    ...conversation,
    profileName: profileName || conversation.profileName,
    lastUserMessage: trimmedMessage
  };

  const leadPatch = extractLeadPatch(trimmedMessage, conversation);
  conversation = mergeLead(conversation, leadPatch);
  conversation = appendHistory(conversation, "user", trimmedMessage);
  conversation.summary = buildConversationSummary(conversation);

  if (detectUnsupportedLevel(trimmedMessage)) {
    const reply = buildUnsupportedLevelReply();
    conversation.status = "unsupported_level";
    conversation.awaitingField = null;
    return finalizeConversation(conversation, reply, null);
  }

  if (shouldSendActivationOpening(trimmedMessage, conversation, leadPatch)) {
    return finalizeConversation(conversation, buildActivationOpeningReply(), null);
  }

  const availabilityReply = await generateAvailabilityReply(trimmedMessage, conversation, config);

  if (availabilityReply) {
    return finalizeConversation(conversation, availabilityReply, null);
  }

  if (!config.openAiApiKey) {
    const fallbackReply = await generateRuleBasedReply(trimmedMessage, conversation);
    return finalizeConversation(conversation, fallbackReply, null);
  }

  const client = new OpenAI({ apiKey: config.openAiApiKey });

  let response = await client.responses.create({
    model: config.openAiModel,
    tools: TOOL_DEFINITIONS,
    parallel_tool_calls: false,
    input: buildModelInput(conversation, profileName)
  });

  while (true) {
    const functionCalls = (response.output || []).filter((item) => item.type === "function_call");

    if (!functionCalls.length) {
      const finalText = extractText(response);
      return finalizeConversation(
        conversation,
        finalText || "Gracias por escribir. Enseguida sigo con tu consulta.",
        response.id,
      );
    }

    const toolOutputs = [];

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments || "{}");
      const result = await executeTool(call.name, args);
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }

    response = await client.responses.create({
      model: config.openAiModel,
      previous_response_id: response.id,
      input: toolOutputs
    });
  }
}

module.exports = {
  buildAssistantDisabledReply,
  generateAgentReply,
  shouldActivateAssistant,
  shouldDeactivateAssistant
};
