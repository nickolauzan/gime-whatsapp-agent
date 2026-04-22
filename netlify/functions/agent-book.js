const { bookInterview } = require("./lib/services");
const { buildResponse } = require("./lib/whatsapp");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const result = await bookInterview(payload);

    return buildResponse(200, {
      ok: true,
      result
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      error: error.message
    });
  }
};
