const { getConfigStatus } = require("./lib/config");

exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      ok: true,
      service: "gime-whatsapp-agent",
      timestamp: new Date().toISOString(),
      config: getConfigStatus()
    })
  };
};
