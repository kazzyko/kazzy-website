// Runs automatically after Netlify accepts a quote-form submission (spam is already filtered out).
// It writes the customer's text message into a small queue. The iPhone shortcut picks it up
// from /api/text-queue and sends it from the business phone.
// It also emails a short "KKLEAD" ping to the business phone's carrier text gateway
// (PING_TO, e.g. 4143886289@tmomail.net). That ping arrives as a text, and an iPhone
// automation that watches for "KKLEAD" runs the shortcut right away.
import { connectLambda, getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

const FORM = "milwaukee-quote-request";

function phoneE164(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? "+1" + d : null;
}

function firstName(full) {
  const f = String(full || "").trim().split(/\s+/)[0] || "";
  return f ? f[0].toUpperCase() + f.slice(1) : "";
}

export function buildText(data) {
  const name = firstName(data.full_name);
  const hi = name ? `Hi ${name}, this is Kazzy & Ko Hauling.` : "Hi, this is Kazzy & Ko Hauling.";
  const status = String(data.booking_status || "");
  if (status.startsWith("Booked online:")) {
    const when = status.replace("Booked online:", "").trim();
    return `${hi} We got your booking for ${when}. We'll reach out to you soon to confirm your appointment. Feel free to text us photos of the items here.`;
  }
  return `${hi} Thanks for your request! We'll reach out to you shortly to get you scheduled. Feel free to text us photos of the items here for a faster quote.`;
}

async function sendPing(data) {
  const pass = process.env.GMAIL_APP_PASSWORD;
  const toAddr = process.env.PING_TO;
  if (!pass || !toAddr) { console.log("Ping skipped: GMAIL_APP_PASSWORD or PING_TO not set"); return; }
  const user = process.env.GMAIL_USER || "kazzykohauling@gmail.com";
  const name = firstName(data.full_name) || "Someone";
  const status = String(data.booking_status || "");
  const what = status.startsWith("Booked online:")
    ? "booked " + status.replace("Booked online:", "").trim()
    : "wants a call to schedule";
  try {
    const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await mail.sendMail({ from: user, to: toAddr, subject: "KKLEAD", text: `KKLEAD New lead: ${name} ${what}`.replace(/[–—]/g, "-").slice(0, 150) });
    console.log("Ping sent");
  } catch (e) {
    console.log("Ping failed:", e.message);
  }
}

export const handler = async (event) => {
  connectLambda(event);
  let payload = {};
  try { payload = JSON.parse(event.body || "{}").payload || {}; } catch (e) { return { statusCode: 200, body: "bad body" }; }
  if (payload.form_name && payload.form_name !== FORM) return { statusCode: 200, body: "other form" };
  const data = payload.data || {};
  if (data["bot-field"]) return { statusCode: 200, body: "honeypot" };
  const to = phoneE164(data.phone);
  if (!to) return { statusCode: 200, body: "no valid phone" };

  // Lambda-style functions can't use "strong" reads, so use the default store mode here.
  // text-queue (a newer-style function) reads with strong consistency, so new texts show up right away.
  const store = getStore("customer-texts");
  try {
    // Don't text the same number twice within 10 minutes (double submits)
    const { blobs } = await store.list();
    const recent = Date.now() - 10 * 60 * 1000;
    if (blobs.some((b) => b.key.endsWith(to) && Number(b.key.split("_")[0]) > recent)) {
      console.log("Skipped duplicate for number ending", to.slice(-4));
      return { statusCode: 200, body: "duplicate" };
    }
  } catch (e) {
    console.log("Duplicate check skipped:", e.message);
  }
  await store.setJSON(`${Date.now()}_${to}`, { to, body: buildText(data), created: new Date().toISOString() });
  console.log("Queued text for number ending", to.slice(-4));
  await sendPing(data);
  return { statusCode: 200, body: "queued" };
};
