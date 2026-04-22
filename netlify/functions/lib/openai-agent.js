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

const SYSTEM_PROMPT = `
Sos el asistente de WhatsApp de Gimena Soledad Mendez para apoyo escolar.

Tu objetivo es:
- responder consultas breves con claridad
- guiar al contacto hacia una entrevista inicial
- captar datos utiles del alumno
- usar herramientas cuando necesites informacion o acciones

Reglas:
- no inventes horarios ni reservas
- no inventes precios
- hace una sola pregunta por vez si faltan datos
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
    description: "Guarda los datos que ya compartio la familia.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        adult_name: { type: "string" },
        student_name: { type: "string" },
        student_level: { type: "string" },
        student_age: { type: "string" },
        subject: { type: "string" },
        modality: { type: "string" },
        notes: { type: "string" },
        whatsapp_user_id: { type: "string" }
      },
      required: ["whatsapp_user_id", "adult_name"]
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
      required: ["date_from", "date_to"]
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
        subject: { type: "string" },
        slot_start: { type: "string" },
        slot_end: { type: "string" },
        modality: { type: "string" },
        whatsapp_user_id: { type: "string" }
      },
      required: ["adult_name", "student_name", "slot_start", "slot_end", "whatsapp_user_id"]
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
      required: ["reason", "summary", "whatsapp_user_id"]
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

function extractText(response) {
  if (response.output_text) {
    return response.output_text.trim();
  }

  const message = (response.output || []).find((item) => item.type === "message");
  const textBlock = message?.content?.find((item) => item.type === "output_text");
  return textBlock?.text?.trim() || "";
}

async function generateAgentReply({ messageText, whatsappUserId, profileName }) {
  const config = getConfig();

  if (!config.openAiApiKey) {
    return generateFallbackReply(messageText);
  }

  const client = new OpenAI({ apiKey: config.openAiApiKey });

  let response = await client.responses.create({
    model: config.openAiModel,
    tools: TOOL_DEFINITIONS,
    parallel_tool_calls: false,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `whatsapp_user_id=${whatsappUserId}\nprofile_name=${profileName || ""}\nmessage=${messageText}`
          }
        ]
      }
    ]
  });

  while (true) {
    const functionCalls = (response.output || []).filter((item) => item.type === "function_call");

    if (!functionCalls.length) {
      const finalText = extractText(response);
      return finalText || "Gracias por escribir. Enseguida sigo con tu consulta.";
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
