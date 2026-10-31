# Urgut Telecom sayti — sozlash (bir marta qilinadi)

Sayt hozir ham ishlaydi, lekin admin panel, onlayn arizalar va AI to‘liq ishlashi uchun quyidagilarni bir marta sozlash kerak.

## 1. Firebase (baza va admin kirishi)

1. https://console.firebase.google.com → **Add project** → nom: `urguttelecom` (Google Analytics shart emas).
2. **Build → Firestore Database → Create database** → *Production mode* → joylashuv: `eur3 (europe-west)`.
3. **Firestore → Rules** → shu papkadagi `firestore.rules` faylining matnini to‘liq qo‘ying → **Publish**.
4. **Build → Authentication → Get started → Email/Password** → yoqing.
5. **Authentication → Users → Add user**:
   - E-pochta: `nasriddin1988@urguttelecom.uz` (saytda login qismiga faqat `nasriddin1988` yozilsa ham bo‘ladi)
   - Parol: o‘zingiz kuchli parol qo‘ying
   - Xuddi shunday o‘zingiz uchun ham hisob qo‘shing.
   - Har bir foydalanuvchining **User UID** sini nusxalab oling.
6. **Firestore → Data → Start collection** → nomi `admins` → Document ID ga **UID** ni qo‘ying → maydon: `role` = `owner` (string). Har bir admin uchun takrorlang.
   Faqat shu ro‘yxatdagi hisoblar admin panelga kira oladi.
7. **Project settings (⚙️) → Your apps → Web (</>)** → ilova qo‘shing → chiqqan `firebaseConfig` qiymatlarini `index.html` boshidagi `window.UT_CONFIG` → `firebase` qismiga yozing:

```js
firebase:{apiKey:"AIza...",authDomain:"urguttelecom.firebaseapp.com",projectId:"urguttelecom",storageBucket:"...",messagingSenderId:"...",appId:"..."},
```

## 2. Cloudinary (rasm va videolar)

1. https://cloudinary.com → **Settings → Upload → Upload presets → Add upload preset**.
2. **Signing mode: Unsigned**, Folder: `urguttelecom` → Save.
3. `index.html` dagi `UT_CONFIG` → `cloudinary:{cloud:"CLOUD_NAME",preset:"PRESET_NOMI"}`.
   Cloud name Cloudinary bosh sahifasida (Dashboard) yozilgan.

## 3. Netlify (AI va Telegram xabarnoma)

**Site configuration → Environment variables → Add a variable**:

| Nomi | Qiymati |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio’dan olingan kalit (https://aistudio.google.com/apikey) |
| `FIREBASE_PROJECT_ID` | Firebase loyiha ID (masalan `urguttelecom`) |
| `FIREBASE_API_KEY` | `index.html` dagi `apiKey` bilan bir xil (ixtiyoriy) |
| `TG_BOT_TOKEN` | Yangi ariza haqida xabar yuboradigan bot tokeni (@BotFather) |
| `TG_CHAT_ID` | Xabar boradigan chat ID. Bir nechta bo‘lsa vergul bilan: `111,222` |

Bot sizga xabar yubora olishi uchun avval botga `/start` yozing. Chat ID ni @userinfobot dan bilib olasiz.

O‘zgaruvchilarni qo‘shgandan keyin **Deploys → Trigger deploy** bosing.

> Netlify’da sayt papkasi (Base directory) `urgut-telecom-site` bo‘lishi kerak — hozir qanday bo‘lsa, shunday qoladi. `netlify/functions` papkasi shu papka ichida turadi.

## 4. Birinchi kirish

1. Saytni oching → tepadagi **logotipga 3 marta** bosing (yoki manzil oxiriga `#admin` yozing).
2. Login va parol bilan kiring.
3. **Operatorlar va logolar** bo‘limida Ucell, Uzmobile, Beeline, Mobiuz uchun rasmiy logotiplarni yuklang.
4. Har qanday bo‘limda **Saqlash** ni bir marta bosing — shundan keyin saytdagi barcha ma’lumot Firebase’dan olinadi.
5. **Bosh panel → Tizim holati** da hammasi “Ulangan” ekanini tekshiring.

## Fayllar

- `index.html` — sayt va admin panel
- `netlify/functions/ai.mjs` — AI yordamchi (sayt bazasi + Google Search)
- `netlify/functions/notify.mjs` — yangi ariza haqida Telegram xabari
- `firestore.rules` — baza xavfsizlik qoidalari
