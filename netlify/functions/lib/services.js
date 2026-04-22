const faqEntries = require("../../../data/faq.json");

const serviceSnapshot = {
  levels: ["Nivel primario"],
  subjects: ["Matematica", "Lengua", "Ciencias", "Tecnicas de estudio"],
  modalities: ["Presencial", "Online"],
  classFormat: "Clases individuales con seguimiento personalizado",
  interviewFormat: "Entrevista inicial breve para conocer al alumno y definir el plan"
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreFaq(question, entry) {
  const normalizedQuestion = normalizeText(question);

  return entry.keywords.reduce((score, keyword) => {
    return score + (normalizedQuestion.includes(normalizeText(keyword)) ? 1 : 0);
  }, 0);
}

async function searchFaq({ question }) {
  const ranked = faqEntries
    .map((entry) => ({ entry, score: scoreFaq(question, entry) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];

  if (!best || best.score === 0) {
    return {
      answer:
        "Puedo ayudarte con dudas sobre modalidad, materias, entrevista inicial y coordinacion de horarios. Si queres, contame que necesitas.",
      confidence: 0.2,
      source: "fallback"
    };
  }

  return {
    answer: best.entry.answer,
    confidence: Math.min(1, best.score / 3),
    source: best.entry.source
  };
}

async function getServices() {
  return serviceSnapshot;
}

async function saveLead(payload) {
  return {
    status: "captured_without_database",
    lead: payload
  };
}

async function getAvailability({ date_from, date_to, preferred_modality }) {
  return {
    status: "calendar_not_connected",
    suggested_slots: [],
    requested_window: {
      date_from,
      date_to,
      preferred_modality
    },
    message:
      "La agenda automatica todavia no esta conectada. El caso debe pasar a coordinacion manual o integrar Google Calendar."
  };
}

async function bookInterview(payload) {
  return {
    status: "pending_manual_booking",
    booking_id: null,
    calendar_event_id: null,
    booking_request: payload,
    message:
      "La reserva automatica todavia no esta habilitada. La solicitud debe pasar a coordinacion manual."
  };
}

async function handoffToHuman(payload) {
  return {
    status: "queued_for_handoff",
    handoff: payload
  };
}

async function getConversationContext({ whatsapp_user_id }) {
  return {
    whatsapp_user_id,
    status: "new",
    summary: "",
    needs_human: false
  };
}

async function generateFallbackReply(question) {
  const faqResult = await searchFaq({ question });
  return faqResult.answer;
}

module.exports = {
  searchFaq,
  getServices,
  saveLead,
  getAvailability,
  bookInterview,
  handoffToHuman,
  getConversationContext,
  generateFallbackReply
};
