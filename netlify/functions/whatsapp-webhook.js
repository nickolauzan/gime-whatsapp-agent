const { getConfig } = require("./lib/config");
const { generateAgentReply } = require("./lib/openai-agent");
const {
  buildResponse,
  getVerifyChallenge,
  extractIncomingMessages,
  sendWhatsAppText
} = require("./lib/whatsapp");

exports.handler = async function handler(event) {
  const config = getConfig();

  if (event.httpMethod === "GET") {
    const { mode, token, challenge } = getVerifyChallenge(event);

    if (mode === "subscribe" && token && token === config.metaVerifyToken) {
      return {
        statusCode: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: challenge || ""
      };
    }

    return {
      statusCode: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "Verification token mismatch"
    };
  }

  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const messages = extractIncomingMessages(payload);

    if (!messages.length) {
      return buildResponse(200, {
        ok: true,
        ignored: true
      });
    }

    for (const message of messages) {
      const reply = await generateAgentReply({
        messageText: message.text,
        whatsappUserId: message.from,
        profileName: message.profileName
      });

      await sendWhatsAppText({
        to: message.from,
        text: reply
      });
    }

    return buildResponse(200, {
      ok: true,
      processed: messages.length
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      error: error.message
    });
  }
};
