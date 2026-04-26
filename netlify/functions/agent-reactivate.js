const { getConfig } = require("./lib/config");
const { loadConversation, resetAssistantConversation, saveConversation } = require("./lib/conversation-store");
const { buildResponse } = require("./lib/whatsapp");

function readAdminToken(event) {
  const headers = event.headers || {};

  return (
    headers["x-admin-token"] ||
    headers["X-Admin-Token"] ||
    headers["authorization"] ||
    headers["Authorization"] ||
    ""
  );
}

function extractBearerToken(rawValue) {
  const trimmed = String(rawValue || "").trim();

  if (!trimmed) {
    return "";
  }

  const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
  return bearerMatch ? bearerMatch[1].trim() : trimmed;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  const config = getConfig();

  if (!config.agentAdminToken) {
    return buildResponse(500, {
      ok: false,
      error: "AGENT_ADMIN_TOKEN is not configured"
    });
  }

  const providedToken = extractBearerToken(readAdminToken(event));

  if (!providedToken || providedToken !== config.agentAdminToken) {
    return buildResponse(403, {
      ok: false,
      error: "Invalid admin token"
    });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const whatsappUserId = String(
      payload.whatsapp_user_id || payload.whatsappUserId || "",
    ).trim();

    if (!whatsappUserId) {
      return buildResponse(400, {
        ok: false,
        error: "whatsapp_user_id is required"
      });
    }

    const existingConversation = await loadConversation(whatsappUserId);
    const resetConversation = resetAssistantConversation(existingConversation);
    const savedConversation = await saveConversation(resetConversation);

    return buildResponse(200, {
      ok: true,
      status: "assistant_reactivated",
      whatsapp_user_id: whatsappUserId,
      assistant_state: savedConversation.assistantState,
      message:
        "El contacto quedo reactivado. La IA volvera a entrar solo si ese numero vuelve a escribir con el trigger de agenda."
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      error: error.message
    });
  }
};
