// Runs automatically after Netlify accepts a quote-form submission (spam is already filtered out).
// It writes the customer's text message into a small queue. The iPhone shortcut picks it up
// from /api/text-queue and sends it from the business phone.
import { connectLambda, getStore } from "@netlify/blobs";

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

export const handler = async (event) => {
  connectLambda(event);
  let payload = {};
  try { payload = JSON.parse(event.body || "{}").payload || {}; } catch (e) { return { statusCode: 200, body: "bad body" }; }
  if (payload.form_name && payload.form_name !== FORM) return { statusCode: 200, body: "other form" };
  const data = payload.data || {};
  if (data["bot-field"]) return { statusCode: 200, body: "honeypot" };
  const to = phoneE164(data.phone);
  if (!to) return { statusCode: 200, body: "no valid phone" };

  const store = getStore({ name: "customer-texts", consistency: "strong" });
  // Don't text the same number twice within 10 minutes (double submits)
  const { blobs } = await store.list({ prefix: "" });
  const recent = Date.now() - 10 * 60 * 1000;
  if (blobs.some((b) => b.key.endsWith(to) && Number(b.key.split("_")[0]) > recent)) {
    return { statusCode: 200, body: "duplicate" };
  }
  await store.setJSON(`${Date.now()}_${to}`, { to, body: buildText(data), created: new Date().toISOString() });
  return { statusCode: 200, body: "queued" };
};
