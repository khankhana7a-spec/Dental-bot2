// Dent-O-Care assistant backend
// Serves two channels from one place:
//   1) POST /api/chat        -> used by the website widget (public/widget.js)
//   2) GET/POST /webhook     -> used by WhatsApp Cloud API
//
// Both channels share the same Claude-powered brain (systemPrompt.js) and
// the same conversation-history + booking-notification logic below.

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { buildSystemPrompt } = require("./systemPrompt");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

// WhatsApp Cloud API config
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
// Optional: clinic's own WhatsApp number (with country code, no + or spaces)
// gets a copy of every confirmed booking, e.g. "923363388525"
const CLINIC_NOTIFY_NUMBER = process.env.CLINIC_NOTIFY_NUMBER;

// ---- In-memory conversation history -----------------------------------
// Keyed by sessionId (website) or phone number (WhatsApp).
// NOTE: this resets whenever the server restarts. For production, swap
// this Map for a real store (Redis, a database table, etc.) so history
// survives restarts and works across multiple server instances.
const conversations = new Map();
const MAX_TURNS = 20; // keep the last N messages per conversation

function getHistory(key) {
  if (!conversations.has(key)) conversations.set(key, []);
  return conversations.get(key);
}

function pushHistory(key, role, content) {
  const history = getHistory(key);
  history.push({ role, content });
  if (history.length > MAX_TURNS) history.splice(0, history.length - MAX_TURNS);
}

// ---- Claude call --------------------------------------------------------
async function askClaude(history, lang) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: buildSystemPrompt(lang),
      messages: history,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((c) => c.type === "text");
  return textBlock ? textBlock.text : "Maazrat, jawab dene mein masla hua.";
}

// ---- Booking parsing + clinic notification ------------------------------
function extractBooking(text) {
  const match = text.match(/<BOOKING>([\s\S]*?)<\/BOOKING>/);
  if (!match) return { clean: text, booking: null };
  let booking = null;
  try {
    booking = JSON.parse(match[1]);
  } catch (e) {
    booking = null;
  }
  const clean = text.replace(match[0], "").trim();
  return { clean, booking };
}

async function notifyClinic(booking, source) {
  console.log(`[NEW BOOKING via ${source}]`, booking);
  if (!CLINIC_NOTIFY_NUMBER || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;
  const text =
    `Nayi appointment (${source}):\n` +
    `Naam: ${booking.name}\nPhone: ${booking.phone}\n` +
    `Date: ${booking.date}\nTime: ${booking.time}\nWajah: ${booking.reason}`;
  try {
    await sendWhatsAppMessage(CLINIC_NOTIFY_NUMBER, text);
  } catch (e) {
    console.error("Failed to notify clinic:", e.message);
  }
}

// ---- Route 1: website widget --------------------------------------------
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message, lang } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }
    const key = `web:${sessionId}`;
    pushHistory(key, "user", message);
    const reply = await askClaude(getHistory(key), lang || "auto");
    pushHistory(key, "assistant", reply);

    const { clean, booking } = extractBooking(reply);
    if (booking) await notifyClinic(booking, "website");

    res.json({ reply: clean, booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---- Route 2: WhatsApp Cloud API -----------------------------------------

// Meta calls this once, during webhook setup, to verify you own the endpoint.
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta POSTs every incoming WhatsApp message here.
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately so Meta doesn't retry/timeout.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message || message.type !== "text") return; // ignore non-text events (status updates, etc.)

    const from = message.from; // sender's WhatsApp number
    const text = message.text.body;
    const key = `wa:${from}`;

    pushHistory(key, "user", text);
    const reply = await askClaude(getHistory(key), "auto");
    pushHistory(key, "assistant", reply);

    const { clean, booking } = extractBooking(reply);
    if (booking) await notifyClinic(booking, "whatsapp");

    await sendWhatsAppMessage(from, clean);
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }
});

async function sendWhatsAppMessage(to, body) {
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WhatsApp send error ${response.status}: ${errText}`);
  }
}

app.get("/", (req, res) => {
  res.send("Dent-O-Care assistant backend is running.");
});

app.listen(PORT, () => {
  console.log(`Dent-O-Care backend listening on port ${PORT}`);
});
