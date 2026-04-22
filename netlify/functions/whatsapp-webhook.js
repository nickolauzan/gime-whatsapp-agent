const { getConfig } = require("./lib/config");
const { generateAgentReply } = require("./lib/openai-agent");
const {
  buildResponse,
  getVerifyChallenge,
  extractIncomingMessages,
  sendWhatsAppText
} = require("./lib/whatsapp");

exports.handler = async function handler(event) {
  console.log("=== WHATSAPP WEBHOOK HIT ===");
  console.log("method:", event.httpMethod);
  console.log("path:", event.path);
  console.log("query:", JSON.stringify(event.queryStringParameters || {}));
  console.log("headers:", JSON.stringify(event.headers || {}));
  console.log("body:", event.body || null);

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

  console.log("=== POST WHATSAPP WEBHOOK ===");
  console.log("method:", event.httpMethod);
  console.log("raw body:", event.body);

  try {
    const payload = JSON.parse(event.body || "{}");
    console.log("parsed payload:", JSON.stringify(payload));

    const messages = extractIncomingMessages(payload);
    console.log("extracted messages:", JSON.stringify(messages));

    if (!messages.length) {
      return buildResponse(200, {
        ok: true,
        ignored: true
      });
    }

    for (const message of messages) {
      console.log("processing message:", JSON.stringify(message));
      console.log("calling OpenAI with:", message.text);
      
      const reply = await generateAgentReply({
        messageText: message.text,
        whatsappUserId: message.from,
        profileName: message.profileName
      });
      
      console.log("OpenAI response:", response);
      console.log("sending reply to WhatsApp...");
      
      await sendWhatsAppText({
        to: message.from,
        text: reply
      });
      
      console.log("reply sent OK");
    }

    return buildResponse(200, {
      ok: true,
      processed: messages.length
    });
  } catch (error) {
    console.error("WHATSAPP WEBHOOK ERROR:", error);
    console.error("error message:", error?.message);
    console.error("error stack:", error?.stack);

    return buildResponse(500, {
      ok: false,
      error: error.message
    });
  }
};
