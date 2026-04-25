const faqEntries = require("../../../data/faq.json");
const {
  buildConversationSummary,
  loadConversation,
  mergeLead,
  saveConversation
} = require("./conversation-store");
const {
  createCalendarInterview,
  queryCalendarAvailability
} = require("./google-calendar");

const serviceSnapshot = {
  levels: ["Nivel primario"],
  subjects: ["Matematica", "Lengua", "Ciencias", "Tecnicas de estudio"],
  modalities: ["Presencial", "Online"],
  classFormat: "Clases individuales con seguimiento personalizado",
  interviewFormat: "Entrevista inicial breve para conocer al alumno y definir el plan",
  scopeNote: "El servicio actual esta orientado solo a nivel primario."
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
  const conversation = await loadConversation(payload.whatsapp_user_id);
  const updatedConversation = mergeLead(conversation, {
    adultName: payload.adult_name,
    studentName: payload.student_name,
    studentLevel: payload.student_level,
    studentAge: payload.student_age,
    subject: payload.subject,
    modality: payload.modality,
    notes: payload.notes
  });

  const persisted = await saveConversation({
    ...updatedConversation,
    status: "lead_captured",
    summary: buildConversationSummary(updatedConversation)
  });

  return {
    status: "captured_in_conversation_store",
    lead: persisted.lead
  };
}

async function getAvailability({ date_from, date_to, preferred_modality }) {
  return queryCalendarAvailability({
    dateFrom: date_from,
    dateTo: date_to,
    preferredModality: preferred_modality
  });
}

async function bookInterview(payload) {
  const result = await createCalendarInterview({
    adultName: payload.adult_name,
    studentName: payload.student_name,
    subject: payload.subject,
    slotStart: payload.slot_start,
    slotEnd: payload.slot_end,
    modality: payload.modality,
    whatsappUserId: payload.whatsapp_user_id
  });

  if (result.status === "booked" && payload.whatsapp_user_id) {
    const conversation = await loadConversation(payload.whatsapp_user_id);
    const updatedConversation = mergeLead(conversation, {
      adultName: payload.adult_name,
      studentName: payload.student_name,
      subject: payload.subject,
      modality: payload.modality
    });

    await saveConversation({
      ...updatedConversation,
      awaitingField: null,
      status: "interview_booked",
      summary: `${buildConversationSummary(updatedConversation)} | turno=${result.slot.label}`
    });
  }

  return {
    ...result,
    booking_request: payload
  };
}

async function handoffToHuman(payload) {
  return {
    status: "queued_for_handoff",
    handoff: payload
  };
}

async function getConversationContext({ whatsapp_user_id }) {
  const conversation = await loadConversation(whatsapp_user_id);

  return {
    whatsapp_user_id,
    status: conversation.status,
    summary: buildConversationSummary(conversation),
    awaiting_field: conversation.awaitingField,
    lead: conversation.lead,
    history: conversation.history,
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
