const { generateAgentReply } = require("./lib/openai-agent");
const { buildResponse } = require("./lib/whatsapp");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const messageText = String(payload.message || "").trim();

    if (!messageText) {
      return buildResponse(400, { error: "message is required" });
    }

    const reply = await generateAgentReply({
      messageText,
      whatsappUserId: String(payload.whatsappUserId || "manual-test"),
      profileName: String(payload.profileName || "Manual Test")
    });

    return buildResponse(200, {
      ok: true,
      reply
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      error: error.message
    });
  }
};
