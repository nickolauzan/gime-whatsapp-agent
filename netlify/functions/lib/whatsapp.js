const { getConfig } = require("./config");

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

function getVerifyChallenge(event) {
  const params = event.queryStringParameters || {};
  return {
    mode: params["hub.mode"],
    token: params["hub.verify_token"],
    challenge: params["hub.challenge"]
  };
}

function extractIncomingMessages(payload) {
  const entries = payload?.entry || [];
  const messages = [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const incoming = value.messages || [];

      for (const message of incoming) {
        messages.push({
          from: message.from,
          profileName: contacts[0]?.profile?.name || "",
          text:
            message.text?.body ||
            message.button?.text ||
            message.interactive?.button_reply?.title ||
            "",
          type: message.type
        });
      }
    }
  }

  return messages.filter((message) => message.text);
}

async function sendWhatsAppText({ to, text }) {
  const config = getConfig();

  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    return {
      status: "not_sent_missing_whatsapp_config"
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${config.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          body: text
        }
      })
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`WhatsApp send failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

module.exports = {
  buildResponse,
  getVerifyChallenge,
  extractIncomingMessages,
  sendWhatsAppText
};
