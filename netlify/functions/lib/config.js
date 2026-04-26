const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_CALENDAR_TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_CALENDAR_UTC_OFFSET = "-03:00";
const DEFAULT_INTERVIEW_DURATION_MINUTES = 30;
const DEFAULT_WORKDAY_WINDOWS = "09:00-10:00,19:00-21:00";
const DEFAULT_WORKDAY_START_HOUR = 9;
const DEFAULT_WORKDAY_END_HOUR = 19;
const DEFAULT_WORKDAYS = "1,2,3,4,5";

function getConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    openAiModel: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    agentAdminToken: process.env.AGENT_ADMIN_TOKEN || "",
    metaVerifyToken: process.env.META_VERIFY_TOKEN || "",
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "",
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
    googleCalendarTimezone: process.env.GOOGLE_CALENDAR_TIMEZONE || DEFAULT_CALENDAR_TIMEZONE,
    googleCalendarUtcOffset: process.env.GOOGLE_CALENDAR_UTC_OFFSET || DEFAULT_CALENDAR_UTC_OFFSET,
    interviewDurationMinutes:
      Number.parseInt(process.env.INTERVIEW_DURATION_MINUTES || "", 10) ||
      DEFAULT_INTERVIEW_DURATION_MINUTES,
    workdayWindows: process.env.WORKDAY_WINDOWS || DEFAULT_WORKDAY_WINDOWS,
    workdayStartHour:
      Number.parseInt(process.env.WORKDAY_START_HOUR || "", 10) || DEFAULT_WORKDAY_START_HOUR,
    workdayEndHour:
      Number.parseInt(process.env.WORKDAY_END_HOUR || "", 10) || DEFAULT_WORKDAY_END_HOUR,
    workdays: process.env.WORKDAYS || DEFAULT_WORKDAYS
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
    adminReactivationConfigured: Boolean(config.agentAdminToken),
    openAiModel: config.openAiModel,
    calendarTimezone: config.googleCalendarTimezone,
    workdayWindows: config.workdayWindows
  };
}

module.exports = {
  getConfig,
  getConfigStatus
};
