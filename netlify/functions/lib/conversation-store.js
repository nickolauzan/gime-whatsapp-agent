let getStore;

try {
  ({ getStore } = require("@netlify/blobs"));
} catch (error) {
  getStore = null;
}

const memoryStore = new Map();
const STORE_NAME = "whatsapp-agent";
const MAX_HISTORY_ITEMS = 12;
const MAX_PROCESSED_MESSAGE_IDS = 40;

function getConversationKey(whatsappUserId) {
  return `conversations/${whatsappUserId}.json`;
}

function createEmptyConversation(whatsappUserId) {
  return {
    whatsappUserId,
    profileName: "",
    status: "new",
    awaitingField: null,
    summary: "",
    lastUserMessage: "",
    lastAssistantReply: "",
    lastModelResponseId: null,
    lead: {
      adultName: "",
      studentName: "",
      studentLevel: "",
      studentAge: "",
      subject: "",
      modality: "",
      notes: ""
    },
    history: [],
    processedMessageIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function trimString(value) {
  return String(value || "").trim();
}

function normalizeHistory(history) {
  return Array.isArray(history)
    ? history
        .filter((entry) => entry && entry.role && entry.text)
        .slice(-MAX_HISTORY_ITEMS)
        .map((entry) => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          text: trimString(entry.text),
          at: entry.at || new Date().toISOString()
        }))
    : [];
}

function normalizeConversation(record, whatsappUserId) {
  const empty = createEmptyConversation(whatsappUserId);
  const lead = record?.lead || {};

  return {
    ...empty,
    ...record,
    whatsappUserId,
    profileName: trimString(record?.profileName),
    status: trimString(record?.status) || empty.status,
    awaitingField: trimString(record?.awaitingField) || null,
    summary: trimString(record?.summary),
    lastUserMessage: trimString(record?.lastUserMessage),
    lastAssistantReply: trimString(record?.lastAssistantReply),
    lastModelResponseId: trimString(record?.lastModelResponseId) || null,
    lead: {
      adultName: trimString(lead.adultName),
      studentName: trimString(lead.studentName),
      studentLevel: trimString(lead.studentLevel),
      studentAge: trimString(lead.studentAge),
      subject: trimString(lead.subject),
      modality: trimString(lead.modality),
      notes: trimString(lead.notes)
    },
    history: normalizeHistory(record?.history),
    processedMessageIds: Array.isArray(record?.processedMessageIds)
      ? record.processedMessageIds.slice(-MAX_PROCESSED_MESSAGE_IDS).filter(Boolean)
      : [],
    createdAt: record?.createdAt || empty.createdAt,
    updatedAt: new Date().toISOString()
  };
}

function getBlobStore() {
  if (!getStore) {
    return null;
  }

  if (!process.env.NETLIFY && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.SITE_ID) {
    return null;
  }

  try {
    return getStore(STORE_NAME);
  } catch (error) {
    console.warn("NETLIFY_BLOBS_STORE_UNAVAILABLE", error?.message || error);
    return null;
  }
}

async function loadConversation(whatsappUserId) {
  const key = getConversationKey(whatsappUserId);
  const store = getBlobStore();

  if (store) {
    try {
      const record = await store.get(key, { type: "json" });

      if (record) {
        const normalized = normalizeConversation(record, whatsappUserId);
        memoryStore.set(key, normalized);
        return normalized;
      }
    } catch (error) {
      console.warn("NETLIFY_BLOBS_READ_FAILED", error?.message || error);
    }
  }

  return normalizeConversation(memoryStore.get(key), whatsappUserId);
}

async function saveConversation(conversation) {
  const normalized = normalizeConversation(conversation, conversation.whatsappUserId);
  const key = getConversationKey(normalized.whatsappUserId);
  const store = getBlobStore();

  memoryStore.set(key, normalized);

  if (store) {
    try {
      await store.set(key, JSON.stringify(normalized));
    } catch (error) {
      console.warn("NETLIFY_BLOBS_WRITE_FAILED", error?.message || error);
    }
  }

  return normalized;
}

function hasProcessedMessage(conversation, messageId) {
  if (!messageId) {
    return false;
  }

  return conversation.processedMessageIds.includes(messageId);
}

function markProcessedMessage(conversation, messageId) {
  if (!messageId) {
    return conversation;
  }

  const processedMessageIds = [...conversation.processedMessageIds.filter((id) => id !== messageId), messageId]
    .slice(-MAX_PROCESSED_MESSAGE_IDS);

  return {
    ...conversation,
    processedMessageIds
  };
}

function appendHistory(conversation, role, text) {
  const cleanText = trimString(text);

  if (!cleanText) {
    return conversation;
  }

  return {
    ...conversation,
    history: [...conversation.history, { role, text: cleanText, at: new Date().toISOString() }].slice(
      -MAX_HISTORY_ITEMS,
    )
  };
}

function mergeLead(conversation, patch = {}) {
  return {
    ...conversation,
    lead: {
      ...conversation.lead,
      ...Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, trimString(value)]),
      )
    }
  };
}

function buildConversationSummary(conversation) {
  const parts = [];

  if (conversation.lead.studentLevel) {
    parts.push(`nivel=${conversation.lead.studentLevel}`);
  }

  if (conversation.lead.subject) {
    parts.push(`materia=${conversation.lead.subject}`);
  }

  if (conversation.lead.studentName) {
    parts.push(`alumno=${conversation.lead.studentName}`);
  }

  if (conversation.lead.adultName) {
    parts.push(`adulto=${conversation.lead.adultName}`);
  }

  if (conversation.lead.modality) {
    parts.push(`modalidad=${conversation.lead.modality}`);
  }

  if (conversation.awaitingField) {
    parts.push(`esperando=${conversation.awaitingField}`);
  }

  return parts.join(" | ");
}

module.exports = {
  appendHistory,
  buildConversationSummary,
  createEmptyConversation,
  hasProcessedMessage,
  loadConversation,
  markProcessedMessage,
  mergeLead,
  saveConversation
};
