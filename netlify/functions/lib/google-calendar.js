const { google } = require("googleapis");
const { getConfig } = require("./config");

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function parseWorkdays(value) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);

  return parsed.length ? parsed : [1, 2, 3, 4, 5];
}

function parseClockValue(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function parseWorkdayWindows(value, fallbackStartHour, fallbackEndHour) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((windowValue) => {
      const [startRaw, endRaw] = windowValue.split("-");
      const startMinutes = parseClockValue(startRaw);
      const endMinutes = parseClockValue(endRaw);

      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
      }

      return {
        startMinutes,
        endMinutes
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startMinutes - right.startMinutes);

  if (parsed.length) {
    return parsed;
  }

  return [
    {
      startMinutes: fallbackStartHour * 60,
      endMinutes: fallbackEndHour * 60
    }
  ];
}

function parseServiceAccountJson(rawJson) {
  const parsed = JSON.parse(rawJson);

  return {
    ...parsed,
    private_key: String(parsed.private_key || "").replace(/\\n/g, "\n")
  };
}

function getCalendarSettings() {
  const config = getConfig();

  return {
    calendarId: config.googleCalendarId,
    timezone: config.googleCalendarTimezone,
    utcOffset: config.googleCalendarUtcOffset,
    interviewDurationMinutes: config.interviewDurationMinutes,
    workdayWindows: parseWorkdayWindows(
      config.workdayWindows,
      config.workdayStartHour,
      config.workdayEndHour,
    ),
    workdayStartHour: config.workdayStartHour,
    workdayEndHour: config.workdayEndHour,
    workdays: parseWorkdays(config.workdays)
  };
}

function normalizeDateInput(value, { endOfDay = false, utcOffset = "-03:00" } = {}) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    throw new Error("Fecha requerida para consultar la agenda.");
  }

  if (isDateOnly(trimmed)) {
    const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
    const date = new Date(`${trimmed}${suffix}${utcOffset}`);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Fecha invalida: ${trimmed}`);
    }

    return date;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha invalida: ${trimmed}`);
  }

  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function roundUpToStep(date, stepMinutes) {
  const rounded = new Date(date.getTime());
  rounded.setUTCSeconds(0, 0);

  const remainder = rounded.getUTCMinutes() % stepMinutes;

  if (remainder !== 0) {
    rounded.setUTCMinutes(rounded.getUTCMinutes() + (stepMinutes - remainder));
  }

  return rounded;
}

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekdayIndex: WEEKDAY_INDEX[map.weekday] ?? null,
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10)
  };
}

function isWithinWorkWindow(slotStart, slotEnd, settings) {
  const startLocal = getLocalParts(slotStart, settings.timezone);
  const endLocal = getLocalParts(slotEnd, settings.timezone);

  if (startLocal.weekdayIndex === null || endLocal.weekdayIndex === null) {
    return false;
  }

  if (startLocal.dateKey !== endLocal.dateKey) {
    return false;
  }

  if (!settings.workdays.includes(startLocal.weekdayIndex)) {
    return false;
  }

  const startMinutes = startLocal.hour * 60 + startLocal.minute;
  const endMinutes = endLocal.hour * 60 + endLocal.minute;

  if (endMinutes <= startMinutes) {
    return false;
  }

  return settings.workdayWindows.some((window) => {
    return startMinutes >= window.startMinutes && endMinutes <= window.endMinutes;
  });
}

function formatSlotLabel(date, timeZone) {
  const formatted = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function overlapsBusy(slotStart, slotEnd, busyIntervals) {
  const startMs = slotStart.getTime();
  const endMs = slotEnd.getTime();

  return busyIntervals.some((interval) => startMs < interval.endMs && endMs > interval.startMs);
}

function buildSuggestedSlots({ timeMin, timeMax, busyIntervals, settings }) {
  const suggestions = [];
  let cursor = roundUpToStep(timeMin, 30);

  while (addMinutes(cursor, settings.interviewDurationMinutes) <= timeMax && suggestions.length < 5) {
    const slotStart = new Date(cursor.getTime());
    const slotEnd = addMinutes(slotStart, settings.interviewDurationMinutes);

    if (
      isWithinWorkWindow(slotStart, slotEnd, settings) &&
      !overlapsBusy(slotStart, slotEnd, busyIntervals)
    ) {
      suggestions.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        label: formatSlotLabel(slotStart, settings.timezone)
      });
    }

    cursor = addMinutes(cursor, 30);
  }

  return suggestions;
}

async function getCalendarApi() {
  const config = getConfig();

  if (!config.googleCalendarId || !config.googleServiceAccountJson) {
    return {
      status: "calendar_not_configured",
      calendar: null,
      settings: getCalendarSettings()
    };
  }

  const credentials = parseServiceAccountJson(config.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: CALENDAR_SCOPES
  });

  return {
    status: "calendar_ready",
    calendar: google.calendar({
      version: "v3",
      auth
    }),
    settings: getCalendarSettings(),
    serviceAccountEmail: credentials.client_email || ""
  };
}

function mapGoogleCalendarError(error) {
  const status = error?.response?.status;

  if (status === 403 || status === 404) {
    return new Error(
      "No se pudo acceder a Google Calendar. Verifica GOOGLE_CALENDAR_ID y comparte ese calendario con la cuenta de servicio.",
    );
  }

  return new Error(error?.message || "Fallo la integracion con Google Calendar.");
}

async function queryCalendarAvailability({ dateFrom, dateTo, preferredModality }) {
  const { status, calendar, settings, serviceAccountEmail } = await getCalendarApi();

  if (status !== "calendar_ready") {
    return {
      status,
      suggested_slots: [],
      requested_window: {
        date_from: dateFrom,
        date_to: dateTo,
        preferred_modality: preferredModality
      },
      message:
        "Google Calendar todavia no esta configurado. Carga GOOGLE_CALENDAR_ID y GOOGLE_SERVICE_ACCOUNT_JSON en Netlify."
    };
  }

  const timeMin = normalizeDateInput(dateFrom, { utcOffset: settings.utcOffset });
  const timeMax = normalizeDateInput(dateTo, {
    utcOffset: settings.utcOffset,
    endOfDay: isDateOnly(dateTo)
  });

  if (timeMax <= timeMin) {
    throw new Error("La ventana solicitada no es valida. date_to debe ser posterior a date_from.");
  }

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: settings.timezone,
        items: [{ id: settings.calendarId }]
      }
    });

    const busyIntervals = (response.data.calendars?.[settings.calendarId]?.busy || []).map((item) => ({
      startMs: new Date(item.start).getTime(),
      endMs: new Date(item.end).getTime()
    }));

    const suggestedSlots = buildSuggestedSlots({
      timeMin,
      timeMax,
      busyIntervals,
      settings
    });

    return {
      status: "calendar_connected",
      service_account_email: serviceAccountEmail,
      requested_window: {
        date_from: dateFrom,
        date_to: dateTo,
        preferred_modality: preferredModality
      },
      suggested_slots: suggestedSlots,
      message: suggestedSlots.length
        ? "Disponibilidad encontrada en Google Calendar."
        : "No encontre espacios libres en esa ventana. Proba otro rango o amplialo."
    };
  } catch (error) {
    throw mapGoogleCalendarError(error);
  }
}

async function createCalendarInterview({
  adultName,
  studentName,
  subject,
  slotStart,
  slotEnd,
  modality,
  whatsappUserId
}) {
  const { status, calendar, settings, serviceAccountEmail } = await getCalendarApi();

  if (status !== "calendar_ready") {
    return {
      status,
      booking_id: null,
      calendar_event_id: null,
      message:
        "Google Calendar todavia no esta configurado. Carga GOOGLE_CALENDAR_ID y GOOGLE_SERVICE_ACCOUNT_JSON en Netlify."
    };
  }

  const start = normalizeDateInput(slotStart, { utcOffset: settings.utcOffset });
  const end = normalizeDateInput(slotEnd, { utcOffset: settings.utcOffset });

  if (end <= start) {
    throw new Error("El horario de fin debe ser posterior al horario de inicio.");
  }

  try {
    const busyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: settings.timezone,
        items: [{ id: settings.calendarId }]
      }
    });

    const busy = busyResponse.data.calendars?.[settings.calendarId]?.busy || [];

    if (busy.length > 0) {
      return {
        status: "slot_unavailable",
        booking_id: null,
        calendar_event_id: null,
        message: "Ese horario ya no esta disponible. Hay que ofrecer otro turno."
      };
    }

    const summaryParts = ["Entrevista inicial"];

    if (studentName) {
      summaryParts.push(studentName);
    }

    if (subject) {
      summaryParts.push(subject);
    }

    const event = await calendar.events.insert({
      calendarId: settings.calendarId,
      sendUpdates: "none",
      requestBody: {
        summary: summaryParts.join(" | "),
        description: [
          "Reserva generada desde el asistente de WhatsApp.",
          `Adulto: ${adultName || "Sin dato"}`,
          `Alumno: ${studentName || "Sin dato"}`,
          `Materia: ${subject || "Sin dato"}`,
          `Modalidad: ${modality || "Sin dato"}`,
          `WhatsApp user id: ${whatsappUserId || "Sin dato"}`
        ].join("\n"),
        start: {
          dateTime: start.toISOString(),
          timeZone: settings.timezone
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: settings.timezone
        },
        extendedProperties: {
          private: {
            whatsapp_user_id: whatsappUserId || "",
            student_name: studentName || "",
            adult_name: adultName || "",
            subject: subject || "",
            modality: modality || ""
          }
        }
      }
    });

    return {
      status: "booked",
      booking_id: event.data.id || null,
      calendar_event_id: event.data.id || null,
      html_link: event.data.htmlLink || null,
      service_account_email: serviceAccountEmail,
      slot: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatSlotLabel(start, settings.timezone)
      },
      message: "La entrevista inicial quedo reservada en Google Calendar."
    };
  } catch (error) {
    throw mapGoogleCalendarError(error);
  }
}

module.exports = {
  createCalendarInterview,
  queryCalendarAvailability
};
