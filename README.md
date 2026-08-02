# Dent-O-Care Assistant — Backend

Yeh backend "Dento" assistant ko do jagah power karta hai:
1. **Website chat widget** (`public/widget.js`) — koi bhi site par ek `<script>` tag se lag jata hai.
2. **WhatsApp bot** — Meta ke official WhatsApp Cloud API se connect hota hai.

Dono ek hi Claude-powered brain use karte hain (`systemPrompt.js` mein clinic ki details hain — timings, fees, address, phone).

---

## 1. Local par test karna (optional, sirf dekhne ke liye)

```bash
npm install
cp .env.example .env
# .env file kholo aur ANTHROPIC_API_KEY daal do
npm start
```

Phir browser mein `http://localhost:3000` kholo — neeche-right corner mein chat bubble dikhega.

---

## 2. Live deploy karna (zaroori — WhatsApp aur real website ke liye)

Backend ko internet par live hona zaroori hai (Meta aur aapki website dono isay call karenge). Sabse aasan free option **Render.com** hai:

1. Is poore folder ko GitHub par ek naye repo mein push karo.
2. [render.com](https://render.com) par account banao → **New Web Service** → apna GitHub repo select karo.
3. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
4. **Environment Variables** section mein `.env.example` ki saari values daal do (ANTHROPIC_API_KEY sab se zaroori).
5. Deploy karo — Render aapko ek URL dega, jaise: `https://dento-backend.onrender.com`

(Railway, Fly.io, ya koi bhi Node-hosting service bhi chalegi — steps milte julte hain.)

---

## 3. Website par lagana

Apni website ke HTML mein, `</body>` se pehle yeh line daal do:

```html
<script src="https://dento-backend.onrender.com/widget.js" data-backend="https://dento-backend.onrender.com"></script>
```

(`dento-backend.onrender.com` ko apne asal Render URL se replace karo.) Bas — chat bubble har page par dikhega.

---

## 4. WhatsApp par lagana (Meta WhatsApp Cloud API)

Yeh Meta ka official, free tareeqa hai. Steps:

1. [developers.facebook.com](https://developers.facebook.com) par jao → **My Apps** → **Create App** → type: "Business".
2. App ke andar **WhatsApp** product add karo.
3. **API Setup** page par:
   - Ek test phone number milega (ya apna business number verify kar sakte ho baad mein).
   - Yahan se **Temporary access token** aur **Phone number ID** copy karo → apne Render environment variables mein `WHATSAPP_TOKEN` aur `WHATSAPP_PHONE_NUMBER_ID` mein daal do.
   - (Temporary token 24 ghante mein expire hota hai — production ke liye "System User" bana kar permanent token generate karo, Meta ki documentation mein "Permanent Token" search karo.)
4. **Configuration** tab mein **Webhook** setup karo:
   - Callback URL: `https://dento-backend.onrender.com/webhook`
   - Verify token: wahi string jo aapne `.env` mein `WHATSAPP_VERIFY_TOKEN` rakhi thi
   - "Verify and Save" dabao — agar sab sahi hai to green tick aa jayega
   - **Webhook fields** mein `messages` ko subscribe karo
5. Ab jo bhi us WhatsApp number par message kare, Dento reply karega.

**Note:** Meta ka test number sirf pehle se add kiye gaye "test recipients" ko reply karta hai. Real customers ke liye apna business number verify karna hoga (Meta Business Manager ke through) — yeh process Meta khud guide karta hai.

---

## 5. Bookings kahan dikhengi?

Jab bhi bot appointment confirm karta hai (website ya WhatsApp se), backend console mein log ho jati hai. Agar aap chahte hain ke clinic staff ko WhatsApp par bhi copy mile, `.env` mein `CLINIC_NOTIFY_NUMBER` daal do (clinic ka apna WhatsApp number) — bot automatically ek notification bhej dega.

Production ke liye behtar hai ke bookings ek database (jaise Google Sheets, Airtable, ya koi bhi DB) mein save ho — agar chahen to yeh feature bhi add karwa sakte hain.

---

## Files

- `server.js` — main backend (website + WhatsApp dono routes)
- `systemPrompt.js` — clinic ki details (yahan edit karke prices/timings update kar sakte ho)
- `public/widget.js` — website ke liye chat widget
- `public/index.html` — demo/test page
- `.env.example` — konsi environment variables chahiye
