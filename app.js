const CONTACT_CONFIG = {
  brandName: "Gimena Soledad Mendez",
  summary:
    "Apoyo escolar para nivel primario, con una entrevista inicial y un acompanamiento cercano, claro y personalizado.",
  whatsappNumber: "5491120946319",
  whatsappDisplay: "+54 9 11 2094-6319",
  email: "gimesoledadmendez@gmail.com",
  location: "Morón, Buenos Aires.",
  scheduleUrl: "",
  whatsappQuestionsMessage:
    "Hola, vi la v-card de apoyo escolar y quiero hacer una consulta.",
  whatsappScheduleMessage:
    "Hola, vi la v-card de apoyo escolar y quiero agendar una entrevista inicial.",
};

function buildWhatsappUrl(number, message) {
  if (!number) return "#configuracion";
  const sanitized = number.replace(/[^\d]/g, "");
  return `https://wa.me/${sanitized}?text=${encodeURIComponent(message)}`;
}

function resolveScheduleUrl() {
  if (CONTACT_CONFIG.scheduleUrl) return CONTACT_CONFIG.scheduleUrl;
  return buildWhatsappUrl(
    CONTACT_CONFIG.whatsappNumber,
    CONTACT_CONFIG.whatsappScheduleMessage,
  );
}

function updateStaticContent() {
  document.getElementById("current-year").textContent = String(new Date().getFullYear());
  document.getElementById("contact-name").textContent = CONTACT_CONFIG.brandName;
  document.getElementById("contact-summary").textContent = CONTACT_CONFIG.summary;
  document.getElementById(
    "contact-whatsapp",
  ).textContent = `WhatsApp: ${CONTACT_CONFIG.whatsappDisplay}`;
  document.getElementById("contact-email").textContent = `Email: ${CONTACT_CONFIG.email}`;
  document.getElementById("contact-location").textContent = `Localidad: ${CONTACT_CONFIG.location}`;
}

function bindLinks() {
  const scheduleUrl = resolveScheduleUrl();
  const whatsappUrl = buildWhatsappUrl(
    CONTACT_CONFIG.whatsappNumber,
    CONTACT_CONFIG.whatsappQuestionsMessage,
  );

  document.querySelectorAll("[data-schedule-link]").forEach((link) => {
    link.setAttribute("href", scheduleUrl);
    if (!CONTACT_CONFIG.scheduleUrl && CONTACT_CONFIG.whatsappNumber) {
      link.setAttribute("aria-label", "Agendar entrevista por WhatsApp");
    }
  });

  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.setAttribute("href", whatsappUrl);
  });
}

updateStaticContent();
bindLinks();
