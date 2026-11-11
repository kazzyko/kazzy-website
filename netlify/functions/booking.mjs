// Online booking backed by Google Calendar.
//   GET  /api/booking?date=YYYY-MM-DD  -> which time slots are open that day
//   POST /api/booking                  -> books a slot and adds it to the calendar
//
// Netlify environment variables:
//   GOOGLE_SERVICE_ACCOUNT  the whole JSON key file of a Google service account
//   GOOGLE_CALENDAR_ID      the calendar to book into (usually your Gmail address)
// The calendar has to be shared with the service account's email address
// with the "Make changes to events" permission.

import crypto from "node:crypto";

const TZ = "America/Chicago";
const SHORT_SLOTS = [["06:00", "08:00"], ["08:00", "10:00"], ["10:00", "12:00"], ["12:00", "14:00"], ["14:00", "16:00"], ["16:00", "18:00"]];
const LONG_SLOTS = [["06:00", "12:00"], ["12:00", "18:00"]];
const LONG_SERVICES = new Set(["Light Demolition", "Property Cleanout"]);
const DAYS_AHEAD = 30;
const NOTICE_MINUTES = 120;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ---------- time helpers (all slots are Chicago local time)
function offset(date) {
  // offset for that calendar day, checked at midday so DST changeovers at 2 AM don't matter
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${date}T18:00:00Z`)).find((p) => p.type === "timeZoneName").value;
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}` : "-06:00";
}
const at = (date, hhmm) => `${date}T${hhmm}:00${offset(date)}`;
const todayChicago = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function hourLabel(hhmm) {
  const h = parseInt(hhmm, 10);
  return { n: h % 12 || 12, ap: h < 12 ? "AM" : "PM" };
}
function slotLabel([s, e]) {
  const a = hourLabel(s), b = hourLabel(e);
  return a.ap === b.ap ? `${a.n}–${b.n} ${b.ap}` : `${a.n} ${a.ap}–${b.n} ${b.ap}`;
}
function dayLabel(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    .format(new Date(`${date}T12:00:00Z`));
}
function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const day = Date.parse(`${date}T00:00:00Z`), today = Date.parse(`${todayChicago()}T00:00:00Z`);
  return day >= today && day <= today + DAYS_AHEAD * 86400000;
}

// ---------- Google auth (service account, signed JWT)
function account() {
  // Returns the service account, or a plain-English setup problem (no secrets are ever shown)
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return { problem: "Setup: GOOGLE_SERVICE_ACCOUNT is missing or empty for this deploy." };
  if (!(process.env.GOOGLE_CALENDAR_ID || "").trim()) return { problem: "Setup: GOOGLE_CALENDAR_ID is missing or empty for this deploy." };
  let a;
  try { a = JSON.parse(raw); } catch {
    return { problem: `Setup: GOOGLE_SERVICE_ACCOUNT isn't the complete JSON file (it starts with "${raw.slice(0, 1)}" and is ${raw.length} characters long; the full file starts with "{" and is about 2,300 characters).` };
  }
  if (!a.client_email || !a.private_key) return { problem: "Setup: GOOGLE_SERVICE_ACCOUNT is JSON but is missing client_email or private_key. Paste the whole downloaded key file." };
  return { email: a.client_email, key: a.private_key.replace(/\\n/g, "\n") };
}
async function token(acct) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: acct.email, scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(acct.key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return (await res.json()).access_token;
}

async function busyTimes(tok, date) {
  const cal = process.env.GOOGLE_CALENDAR_ID;
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: at(date, "00:00"), timeMax: at(date, "23:59"), timeZone: TZ, items: [{ id: cal }] }),
  });
  if (!res.ok) throw new Error(`freebusy ${res.status}`);
  const c = (await res.json()).calendars?.[cal];
  if (!c || c.errors?.length) throw new Error("calendar not shared with the service account");
  return c.busy.map((b) => [Date.parse(b.start), Date.parse(b.end)]);
}

function openSlots(date, list, busy) {
  const now = Date.now();
  return list.map(([s, e]) => {
    const start = Date.parse(at(date, s)), end = Date.parse(at(date, e));
    const free = start - now >= NOTICE_MINUTES * 60000 && !busy.some(([bs, be]) => bs < end && be > start);
    return { id: `${s}-${e}`, label: slotLabel([s, e]), available: free };
  });
}

// ---------- handler
export default async (req) => {
  const acct = account();
  if (acct.problem) return json({ error: "Online booking isn't set up yet.", detail: acct.problem }, 503);

  try {
    if (req.method === "GET") {
      const date = new URL(req.url).searchParams.get("date");
      if (!validDate(date)) return json({ error: "Pick a date within the next 30 days." }, 400);
      const busy = await busyTimes(await token(acct), date);
      return json({ date, day: dayLabel(date), short: openSlots(date, SHORT_SLOTS, busy), long: openSlots(date, LONG_SLOTS, busy) });
    }

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
      const name = clean(b.name, 80), phone = clean(b.phone, 30), address = clean(b.address, 200);
      const service = clean(b.service, 80), date = clean(b.date, 10), slot = clean(b.slot, 11);
      if (b.hp) return json({ ok: true }); // bot
      if (name.length < 2 || phone.replace(/\D/g, "").length < 10 || address.length < 5)
        return json({ error: "Please fill in your name, phone number and service address." }, 400);
      if (!validDate(date)) return json({ error: "Pick a date within the next 30 days." }, 400);

      const list = LONG_SERVICES.has(service) ? LONG_SLOTS : SHORT_SLOTS;
      const pick = list.find(([s, e]) => `${s}-${e}` === slot);
      if (!pick) return json({ error: "Please choose one of the available time slots." }, 400);

      const tok = await token(acct);
      const open = openSlots(date, [pick], await busyTimes(tok, date))[0];
      if (!open.available) return json({ error: "Sorry, that time was just taken. Please pick another slot.", taken: true }, 409);

      const lines = [
        `Name: ${name}`, `Phone: ${phone}`, b.email && `Email: ${clean(b.email, 120)}`, `Address: ${address}`,
        `Service: ${service || "Not specified"}`, b.location && `Items located: ${clean(b.location, 120)}`,
        b.estimate && `Website estimate: ${clean(b.estimate, 120)}`, "", clean(b.details, 1500), "", "Booked online at kazzykohauling.com",
      ].filter((l) => l !== false && l !== undefined && l !== null);
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `${service || "Junk removal"} – ${name} – ${phone}`,
          location: address,
          description: lines.join("\n"),
          start: { dateTime: at(date, pick[0]), timeZone: TZ },
          end: { dateTime: at(date, pick[1]), timeZone: TZ },
        }),
      });
      if (!res.ok) throw new Error(`insert ${res.status}`);
      return json({ ok: true, when: `${dayLabel(date)}, ${slotLabel(pick)}` });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error(e);
    const msg = String(e && e.message || e);
    const detail = msg.startsWith("auth") ? "Google rejected the service account key. Re-download the JSON key and paste the whole file."
      : msg.includes("not shared") ? "The calendar isn't shared with the service account email, or GOOGLE_CALENDAR_ID is wrong."
      : msg.startsWith("freebusy 403") || msg.startsWith("insert 403") ? "Permission denied. Share the calendar with the service account using \"Make changes to events\", and make sure the Google Calendar API is enabled."
      : msg;
    return json({ error: "Online booking is having trouble right now. Choose “Contact me to schedule” and we'll set up a time by phone.", detail }, 502);
  }
};

export const config = { path: "/api/booking" };
