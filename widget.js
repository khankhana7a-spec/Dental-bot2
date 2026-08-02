/**
 * Dent-O-Care chat widget
 * Embed on any website with:
 *   <script src="https://YOUR-BACKEND-URL/widget.js" data-backend="https://YOUR-BACKEND-URL"></script>
 *
 * If data-backend is omitted, it defaults to the same origin the script was
 * loaded from (works automatically if the widget is served by your backend).
 */
(function () {
  const scriptTag = document.currentScript;
  const BACKEND_URL =
    (scriptTag && scriptTag.getAttribute("data-backend")) ||
    new URL(scriptTag.src).origin;

  const SESSION_KEY = "dento_session_id";
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  const TEXT = {
    auto: {
      welcome:
        "Assalam-o-Alaikum! Main Dento hoon, Dent-O-Care ka assistant. Aap English ya Urdu, dono mein baat kar sakte hain. Kis cheez mein madad chahiye?",
      placeholder: "Apna sawal likhein...",
      title: "Dent-O-Care",
      subtitle: "Dento assistant",
    },
    en: {
      welcome:
        "Hello! I'm Dento, the assistant for Dent-O-Care. How can I help — timings, symptoms, or booking an appointment?",
      placeholder: "Type your question...",
      title: "Dent-O-Care",
      subtitle: "Dento assistant",
    },
    ur: {
      welcome:
        "Assalam-o-Alaikum! Main Dento hoon, Dent-O-Care ka assistant. Kis cheez mein madad chahiye?",
      placeholder: "Apna sawal likhein...",
      title: "Dent-O-Care",
      subtitle: "Dento assistant",
    },
  };

  let lang = "auto";
  let open = false;
  let loading = false;
  let history = []; // {role, text}

  // ---- styles --------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #dento-bubble { position: fixed; bottom: 20px; right: 20px; width: 58px; height: 58px;
      border-radius: 50%; background: #2A9D8F; color: white; border: none; font-size: 26px;
      cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.2); z-index: 999999; }
    #dento-panel { position: fixed; bottom: 90px; right: 20px; width: 340px; max-width: 92vw;
      height: 480px; max-height: 75vh; background: white; border-radius: 18px; overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,0.25); display: none; flex-direction: column;
      font-family: -apple-system, Segoe UI, Roboto, sans-serif; z-index: 999999; }
    #dento-panel.open { display: flex; }
    #dento-header { background: #0D2B2B; color: white; padding: 12px 14px; }
    #dento-header h3 { margin: 0; font-size: 15px; }
    #dento-header p { margin: 2px 0 0; font-size: 11px; color: #9FCFC5; }
    #dento-langs { display: flex; gap: 6px; margin-top: 8px; }
    #dento-langs button { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: none;
      background: rgba(255,255,255,0.1); color: #9FCFC5; cursor: pointer; }
    #dento-langs button.active { background: #F4A259; color: #0D2B2B; }
    #dento-messages { flex: 1; overflow-y: auto; padding: 12px; background: #F7FAF9; }
    .dento-msg { max-width: 82%; padding: 8px 12px; border-radius: 14px; font-size: 13px;
      margin-bottom: 8px; line-height: 1.4; white-space: pre-wrap; }
    .dento-msg.bot { background: #2A9D8F; color: white; border-bottom-left-radius: 4px; }
    .dento-msg.user { background: #FFF6EC; border: 1.5px solid #F4A259; margin-left: auto;
      border-bottom-right-radius: 4px; }
    #dento-input-row { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #EDF3F1; background: white; }
    #dento-input { flex: 1; border: 1px solid #DCEAE6; border-radius: 999px; padding: 8px 12px; font-size: 13px; outline: none; }
    #dento-send { background: #F4A259; border: none; width: 36px; height: 36px; border-radius: 50%;
      color: white; cursor: pointer; }
  `;
  document.head.appendChild(style);

  // ---- DOM -------------------------------------------------------------
  const bubble = document.createElement("button");
  bubble.id = "dento-bubble";
  bubble.innerText = "🦷";
  bubble.setAttribute("aria-label", "Chat with Dent-O-Care");

  const panel = document.createElement("div");
  panel.id = "dento-panel";
  panel.innerHTML = `
    <div id="dento-header">
      <h3 id="dento-title"></h3>
      <p id="dento-subtitle"></p>
      <div id="dento-langs">
        <button data-lang="auto" class="active">Auto</button>
        <button data-lang="en">EN</button>
        <button data-lang="ur">اردو</button>
      </div>
    </div>
    <div id="dento-messages"></div>
    <div id="dento-input-row">
      <input id="dento-input" type="text" />
      <button id="dento-send" aria-label="Send">➤</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector("#dento-messages");
  const inputEl = panel.querySelector("#dento-input");
  const sendEl = panel.querySelector("#dento-send");
  const titleEl = panel.querySelector("#dento-title");
  const subtitleEl = panel.querySelector("#dento-subtitle");
  const langButtons = panel.querySelectorAll("#dento-langs button");

  function renderMessages() {
    messagesEl.innerHTML = "";
    history.forEach((m) => {
      const div = document.createElement("div");
      div.className = `dento-msg ${m.role === "assistant" ? "bot" : "user"}`;
      div.textContent = m.text;
      messagesEl.appendChild(div);
    });
    if (loading) {
      const div = document.createElement("div");
      div.className = "dento-msg bot";
      div.textContent = "...";
      messagesEl.appendChild(div);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function applyLangText() {
    const t = TEXT[lang];
    titleEl.textContent = t.title;
    subtitleEl.textContent = t.subtitle;
    inputEl.placeholder = t.placeholder;
    if (history.length === 0) {
      history.push({ role: "assistant", text: t.welcome });
      renderMessages();
    }
  }

  langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      lang = btn.getAttribute("data-lang");
      langButtons.forEach((b) => b.classList.toggle("active", b === btn));
      applyLangText();
    });
  });

  bubble.addEventListener("click", () => {
    open = !open;
    panel.classList.toggle("open", open);
    if (open) applyLangText();
  });

  async function send() {
    const text = inputEl.value.trim();
    if (!text || loading) return;
    history.push({ role: "user", text });
    inputEl.value = "";
    loading = true;
    renderMessages();

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, lang }),
      });
      const data = await res.json();
      history.push({ role: "assistant", text: data.reply || "..." });
      if (data.booking) {
        history.push({
          role: "assistant",
          text: `✓ Appointment confirmed:\n${data.booking.name}, ${data.booking.date} ${data.booking.time}`,
        });
      }
    } catch (e) {
      history.push({ role: "assistant", text: "Connection error. Please try again." });
    } finally {
      loading = false;
      renderMessages();
    }
  }

  sendEl.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
})();
