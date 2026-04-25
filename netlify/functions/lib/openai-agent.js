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
- no reinventes la conversacion en cada turno
- no saludes de nuevo en mitad del chat
- si el ultimo mensaje del asistente pidio un dato concreto y el usuario responde con un dato corto, interpretalo como respuesta a esa pregunta
- no asumas que un nombre corto significa que ahora habla otra persona
- hace una sola pregunta por vez si faltan datos
- no inventes horarios ni reservas
- no inventes precios
- responde en espanol rioplatense, con tono calido y profesional
- mantenete breve, natural y apto para WhatsApp
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  const knownData = [
    `contacto_whatsapp=${profileName || conversation.profileName || "sin_dato"}`,
    `adulto=${conversation.lead.adultName || "sin_dato"}`,
    `alumno=${conversation.lead.studentName || "sin_dato"}`,
    `nivel=${conversation.lead.studentLevel || "sin_dato"}`,
    `materia=${conversation.lead.subject || "sin_dato"}`,
    `modalidad=${conversation.lead.modality || "sin_dato"}`,
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
      content: [{ type: "input_text", text: item.text }]
    });
  }

  return input;
}

async function executeTool(name, args) {
  switch (name) {
    case "search_faq":
      return searchFaq(args);
    case "get_services":
      return getServices();
    case "save_lead":
      return saveLead(args);
    case "get_availability":
      return getAvailability(args);
    case "book_interview":
      return bookInterview(args);
    case "handoff_to_human":
      return handoffToHuman(args);
    case "get_conversation_context":
      return getConversationContext(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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
  generateAgentReply
};
