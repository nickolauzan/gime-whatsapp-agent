const DEFAULT_MODEL = "gpt-4.1-mini";

function getConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    openAiModel: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    metaVerifyToken: process.env.META_VERIFY_TOKEN || "",
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "",
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ""
  };
}

function getConfigStatus() {
  const config = getConfig();

  return {
    openAiConfigured: Boolean(config.openAiApiKey),
    whatsappConfigured: Boolean(
      config.whatsappAccessToken && config.whatsappPhoneNumberId && config.metaVerifyToken
    ),
    calendarConfigured: Boolean(config.googleCalendarId && config.googleServiceAccountJson),
    openAiModel: config.openAiModel
  };
}

module.exports = {
  getConfig,
  getConfigStatus
};
