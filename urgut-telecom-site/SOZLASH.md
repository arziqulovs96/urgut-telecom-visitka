# Urgut Telecom sayti — sozlash (v10)

v10 da sayt Telegram sotuv boti bilan ulandi: botdagi buyurtmalar ham saytning admin panelidagi **Arizalar** bo‘limiga tushadi, Telegram’dagi ariza xabarlarida esa **✅ Qabul qildim / 🚚 Yo‘lda / ✔️ Bajarildi / ❌ Bekor** tugmalari paydo bo‘ladi.

## Yangi versiya uchun 4 ta qadam

### 1. Firestore qoidalarini yangilash (majburiy)
Firebase → **Firestore Database → Rules** → eski matnni to‘liq o‘chirib, shu papkadagi **`firestore.rules`** matnini qo‘ying → **Publish**.
Busiz do‘kon, yangiliklar va sharhlar saytda ko‘rinmaydi.

### 2. Server kaliti — FIREBASE_SERVICE_ACCOUNT (majburiy)
Arizalar, promokodlar, AI boshqaruv va AI yangiliklar shu kalit orqali ishlaydi.

1. Firebase → **⚙️ Project settings → Service accounts** → **Generate new private key** → **Generate key**. Kompyuteringizga `.json` fayl tushadi.
2. Faylni Bloknot (Notepad) bilan oching, **ichidagi hamma matnni** nusxalang (Ctrl+A, Ctrl+C).
3. Netlify → **Project configuration → Environment variables → Add a variable**:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: nusxalangan matn (to‘liq, `{` dan `}` gacha)
4. **Deploys → Trigger deploy → Deploy project**.

⚠️ Bu fayl maxfiy: hech kimga yubormang, GitHub’ga yuklamang. Yo‘qolsa yoki kimdir ko‘rib qolsa, Firebase’da o‘chirib, yangisini yarating.

### 3. Bot kaliti — BOT_API_KEY (bot uchun majburiy)
Bu — sayt bilan bot bir-birini tanishi uchun parol. Bir xil qiymat **ikki joyda** turadi: Netlify’da va VPS’dagi botning `.env` faylida.
1. Kalit yarating (VPS’da): `openssl rand -hex 24` → chiqqan 48 belgili matnni nusxalang.
2. Netlify → **Environment variables → Add a variable** → Key: `BOT_API_KEY`, Value: shu matn → **Create**.
3. **Deploys → Trigger deploy → Deploy project**.

### 4. GitHub’ga yuklash
`urgut-telecom-site` papkasining **o‘zini** (tashqi `-v10` papkani emas) GitHub’dagi reponing ichiga sudrab tashlang → **Commit changes**.

## Tekshirish
- `urguttelecom.netlify.app/api/ai` → `"service":true` va `"gemini":true` chiqishi kerak.
- Admin panel → **Bosh panel → Tizim holati**: hammasi “Ulangan”.
- Admin panel → **UrgutTelecom AI → Modelni sinab ko‘rish**: model va internet qidiruvi ishlayotganini ko‘rsatadi.

## Netlify o‘zgaruvchilari (hammasi)
| Nomi | Nima uchun |
|---|---|
| `GEMINI_API_KEY` | UrgutTelecom AI (aistudio.google.com/apikey) |
| `TG_BOT_TOKEN` | Telegram xabarlari (bot tokeni) |
| `TG_CHAT_ID` | Xabar boradigan adminlar: `8179708976,8889804019` |
| `FIREBASE_PROJECT_ID` | `sayt-567af` |
| `FIREBASE_API_KEY` | index.html dagi apiKey |
| `FIREBASE_SERVICE_ACCOUNT` | Server kaliti (yuqoridagi 2-qadam) |
| `GEMINI_MODEL` | Ixtiyoriy. Endi model admin paneldan tanlanadi, bu faqat zaxira |
| `BOT_API_KEY` | Sotuv boti bilan aloqa paroli (3-qadam). Botdagi `.env` bilan bir xil |

Ikkala super admin xabar olishi uchun har biri botga bir marta `/start` yozishi kerak. Botda qo‘shilgan adminlar ham (ruxsatiga qarab) ariza xabarlarini oladi.

## Avtomatik ishlar (Netlify o‘zi bajaradi)
- **Har 15 daqiqa**: qabul qilinmagan arizalar haqida adminlarga eslatma.
- **Har 6 soat**: AI yangiliklar (admin panelda yoqilgan bo‘lsa).
- **Har kuni 09:00**: kechagi kun hisoboti Telegram’ga.

## Admin panel bo‘limlari
Bosh panel · Arizalar · **AI boshqaruv** · **Do‘kon** · **Chiroyli raqamlar** · **Yangiliklar** · **Promokod va referal** · **Sharhlar** · **Buyurtma sozlamalari** · Kompaniya · Telefonlar · Filiallar · Slayder · Operatorlar · SIM takliflari · Xizmatlar · Kompaniya haqida · Asoschi · UrgutTelecom AI

## Fayllar
- `index.html` — sayt va admin panel
- `netlify/edge-functions/ai.mjs` — UrgutTelecom AI (mijozlar uchun)
- `netlify/edge-functions/admin-ai.mjs` — AI boshqaruv (adminlar uchun)
- `netlify/functions/order.mjs` — ariza va buyurtmalar (narx, promokod, yetkazish serverda hisoblanadi)
- `netlify/functions/promo.mjs`, `track.mjs` — promokod tekshiruvi, ariza holati va baho
- `netlify/functions/*-cron.mjs` — eslatma, AI yangiliklar, kunlik hisobot
- `netlify/lib/` — umumiy kod
- `firestore.rules` — baza xavfsizlik qoidalari
