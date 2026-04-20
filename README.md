# Wavvy — WhatsApp Multi-Session Bot Platform

Platform web untuk mengelola banyak akun WhatsApp sekaligus dengan fitur automation, AI assistant, bulk campaign, dan REST API — dibangun di atas **Baileys** (WhatsApp Web) untuk session utama dan **WhatsApp Business API (WABA)** untuk OTP verifikasi.

---

## Daftar Isi

- [Deskripsi Singkat](#deskripsi-singkat)
- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur](#arsitektur)
- [Struktur Proyek](#struktur-proyek)
- [Persyaratan](#persyaratan)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Onboarding & Phone Verification](#onboarding--phone-verification)
- [REST API](#rest-api)
- [Webhook Session](#webhook-session)
- [WhatsApp OTP (WABA) Setup](#whatsapp-otp-waba-setup)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Deskripsi Singkat

Wavvy adalah aplikasi web multi-user yang memungkinkan satu akun pengguna memegang beberapa session WhatsApp (via QR login Baileys), lalu mengotomatisasi pesan masuk/keluar melalui:

- **Dashboard web** untuk login, scan QR, monitoring session, dan kelola konten
- **REST API** untuk integrasi dengan sistem eksternal (CRM, e-commerce, dsb)
- **Webhook** untuk mengirim event pesan ke backend pengguna
- **AI Assistant & Auto-Reply** untuk membalas pesan otomatis berbasis rule atau LLM
- **Campaign** untuk kirim pesan massal terjadwal

Aplikasi memakai **plan-based quota** (tier) untuk mengatur batas session, pesan, dan fitur per user.

---

## Fitur Utama

### 1. Session Management
- Multi-session WhatsApp dalam satu akun user
- QR code login via Baileys
- Auto-reconnect dengan backoff, cleanup session idle (default 24 jam)
- Session state tersimpan per folder di `sessions/{sessionId}`

### 2. Message API
- Kirim **text**, **media** (image/video/PDF/audio), dan **button message**
- Upload file hingga 50 MB (konfigurasi via `UPLOAD_MAX_SIZE`)
- Rate limiting per API key + kuota pesan per plan
- Enkripsi data sensitif dengan AES-256-GCM

### 3. Auto-Reply System
- Trigger **exact match**, **contains**, atau **regex**
- Balasan berupa text atau media
- Aktif per session

### 4. AI Assistant
- Integrasi multi-provider: OpenAI, DeepSeek, Gemini, OpenRouter
- Knowledge base per assistant
- Conversation history tersimpan (cleanup otomatis, default 30 hari)

### 5. Contact & Template Management
- Import kontak, pengelompokan, pencarian
- Message template reusable (dengan placeholder & media)

### 6. Campaign (Bulk Messaging)
- Kirim pesan ke banyak nomor sekaligus
- Scheduling (kirim terjadwal)
- Progress tracking per campaign
- Anti-spam delay antar pesan

### 7. Number Checker
- Validasi batch apakah nomor terdaftar di WhatsApp

### 8. Webhook Session
- Event pesan masuk dikirim HTTP POST ke URL eksternal user
- Konfigurasi per session: `webhook_url` & `webhook_enabled`

### 9. User & Plan Management
- Multi-user dengan login **email/password** + **Google OAuth 2.0**
- Tier berbasis plan (messages/month, sessions, feature flags)
- API key per user untuk akses REST API
- Phone verification via WABA OTP untuk aktivasi plan default

### 10. Admin Settings
- Halaman settings untuk toggle fitur, konfigurasi OAuth & WABA
- Edit `.env` runtime via UI (sebagian variabel)

---

## Tech Stack

| Lapisan | Teknologi |
|---|---|
| **Runtime** | Node.js 20 (ES Modules) |
| **Framework** | Express.js 5.1 |
| **WhatsApp (session)** | @whiskeysockets/baileys 7.0.0-rc.9 |
| **WhatsApp (OTP)** | Meta Graph API (WhatsApp Business Platform) |
| **Database** | MySQL 8.0 (mysql2 + connection pool) |
| **Session Store** | express-session + express-mysql-session |
| **Auth** | Passport.js (Local + Google OAuth 2.0) |
| **Template Engine** | EJS + express-ejs-layouts |
| **Security** | helmet, csrf-csrf, bcryptjs, AES-256-GCM encryption |
| **Validation** | express-validator |
| **Upload** | multer + sharp (image processing) |
| **Rate Limiting** | express-rate-limit |
| **Scheduler** | node-cron |
| **Logging** | winston |
| **Media Processing** | ffmpeg (via system binary) |
| **QR Code** | qrcode |
| **Frontend** | Vanilla JS, Bootstrap (CDN), FontAwesome |
| **Dev** | nodemon |
| **Container** | Docker + Docker Compose |

---

## Arsitektur

Aplikasi mengikuti pola **MVC + Service Layer** dalam single monolithic Node.js app:

```
┌──────────────────────────────────────────────────┐
│                 Browser / API Client              │
└───────────────────┬──────────────────────────────┘
                    │
           ┌────────▼────────┐
           │  Express Routes  │  (auth, web, api, webapi, autoreply, ai)
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │   Middleware     │  (auth, CSRF, rate-limit, validation, plan-gate)
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │   Controllers    │  (17 file, business logic)
           └────┬───────┬────┘
                │       │
         ┌──────▼─┐  ┌──▼────────┐
         │ Models │  │ Services  │  (Campaign, NumberChecker, OTP, Cleanup, Webhook)
         └────┬───┘  └─────┬─────┘
              │            │
       ┌──────▼────┐  ┌────▼────────────────┐
       │  MySQL    │  │ Baileys / Meta API  │
       └───────────┘  └─────────────────────┘
```

**Request flow tipikal (kirim pesan via API):**

1. Client → `POST /api/v1/sessions/:id/send` dengan API key
2. Middleware: `checkFeatureAccess('api')` → `checkMessageLimit` → `validateSendMessage` → `verifySessionOwnership`
3. `ApiController.sendMessage` → ambil instance Baileys dari memory
4. Baileys kirim pesan, simpan log ke `messages` table
5. Respons JSON ke client

**Event flow (pesan masuk):**

```
WhatsApp server → Baileys socket → WhatsAppController handler
  ↓
  ├── Simpan ke DB (messages)
  ├── Jalankan AutoReply / AI Assistant (kalau aktif)
  └── WebhookService.send() → POST ke user's webhook_url
```

---

## Struktur Proyek

```
wavvy/
├── config/              # Konfigurasi (database pool, WA config, encryption, passport)
├── controllers/         # Business logic (17 file)
│   ├── AuthController.js
│   ├── WhatsAppController.js
│   ├── ApiController.js
│   ├── CampaignController.js
│   ├── AiAssistantController.js
│   ├── PhoneVerificationController.js
│   ├── SettingsController.js
│   └── ...
├── models/              # Database models (User, Session, AutoReply, Contact, Plan, ...)
├── services/            # Integrasi & background tasks
│   ├── OtpService.js         # WABA OTP
│   ├── CampaignService.js
│   ├── NumberCheckerService.js
│   ├── WebhookService.js
│   ├── MessageCleanupService.js
│   └── SessionCleanupService.js
├── routes/              # Express routers
│   ├── auth.js          # /auth/*
│   ├── web.js           # halaman dashboard
│   ├── api.js           # /api/v1/* (REST API publik, pakai API key)
│   ├── webapi.js        # /webapi/* (AJAX dari dashboard, pakai session cookie)
│   ├── autoreply.js
│   └── ai-assistant.js
├── middleware/          # auth, validation, rate-limits, CSRF, plan-gate
├── utils/               # logger, error handler, encryption, socket cleanup
├── views/               # EJS templates + layout
│   ├── layout.ejs
│   ├── phone-verification.ejs
│   ├── settings/
│   └── ...
├── public/              # static assets (CSS, JS dashboard, icons)
├── migrations/          # perubahan schema manual
├── sessions/            # Baileys auth state per session (generated)
├── uploads/             # file upload user (generated)
├── database.sql         # initial schema (dipakai Docker on first run)
├── server.js            # entry point
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

---

## Persyaratan

- **Node.js** ≥ 20
- **MySQL** 8.0
- **ffmpeg** (untuk proses media)
- Opsional: **Docker** & **Docker Compose** (cara termudah)
- Opsional: **Akun WhatsApp Business Platform** (untuk fitur OTP verifikasi)
- Opsional: **Google OAuth credentials** (untuk login Google)

---

## Instalasi

### Cara 1 — Docker Compose (direkomendasikan)

```bash
# Clone repo
git clone <repo-url> wavvy
cd wavvy

# Siapkan .env
cp .env.example .env
# Edit .env — minimal isi DB_PASSWORD dan ENCRYPTION_KEY

# Generate ENCRYPTION_KEY (64-char hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Jalankan
docker-compose up -d
```

Aplikasi akan berjalan di `http://localhost:3000`. MySQL di-init otomatis dari `database.sql` pada first run.

### Cara 2 — Manual

```bash
git clone <repo-url> wavvy
cd wavvy

# Install dependencies
npm install

# Siapkan database
mysql -u root -p -e "CREATE DATABASE wavvy"
mysql -u root -p wavvy < database.sql

# Siapkan .env (lihat section di bawah)
cp .env.example .env
# edit .env

# Jalankan
npm run dev   # development (nodemon)
# atau
npm start     # production
```

---

## Konfigurasi Environment

File `.env.example` berisi semua variabel beserta default dan komentarnya. Yang **wajib** diisi untuk production:

| Variabel | Fungsi |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Koneksi MySQL |
| `SESSION_SECRET` | Secret untuk signing session cookie (generate random) |
| `ENCRYPTION_KEY` | 64-char hex untuk AES-256-GCM (generate random) |
| `APP_URL` | URL publik aplikasi (mis. `https://wavvy.example.com`) |
| `NODE_ENV` | `production` di server |

Variabel opsional:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_AUTH_ENABLED` — login Google
- `WABA_*` — WhatsApp Business API untuk OTP (lihat [WhatsApp OTP Setup](#whatsapp-otp-waba-setup))
- `OPENROUTER_API_KEY` — AI Assistant fallback model caching
- `WA_*` — timeout & retry config Baileys
- `MSG_*`, `SESSION_CLEANUP_*` — interval cleanup background
- `UPLOAD_MAX_SIZE`, `UPLOAD_ALLOWED_TYPES` — batas upload

> **Penting:** `ENCRYPTION_KEY` tidak boleh berubah setelah data tersimpan — data terenkripsi lama tidak akan bisa didekripsi jika key diganti.

---

## Menjalankan Aplikasi

1. Akses `http://localhost:3000`
2. **Register** akun baru (email/password) atau login via Google
3. Setelah login, banner **"Verify to activate free plan"** akan muncul (jika `WABA_OTP_ENABLED=true`)
4. Verifikasi nomor via OTP WhatsApp → plan default otomatis aktif
5. Masuk dashboard → **Create Session** → scan QR dengan WhatsApp di HP
6. Session tersambung → mulai kirim pesan / setup auto-reply / generate API key

---

## Onboarding & Phone Verification

Alur onboarding didesain sebagai **gate aktivasi plan gratis** dengan anti-abuse via verifikasi nomor WhatsApp:

```
Signup → Login → Dashboard (tier=null, phone_verified=false)
   ↓
Banner "Verify to activate" → /verify-phone
   ↓
Step 1: Input nomor → POST /webapi/phone-verification/send-otp
   ↓  (Meta Graph API kirim template OTP ke HP user)
Step 2: Input 6 digit → POST /webapi/phone-verification/verify-otp
   ↓
Step 3: Plan default otomatis aktif + thank you message via WA
   ↓
Dashboard (banner hilang, fitur aktif sesuai plan)
```

**Anti-abuse:**
- 1 nomor = 1 akun verified
- Max 3 OTP/jam per user atau nomor
- Cooldown 60 detik antar OTP
- OTP expired 30 menit, max 5 percobaan verify
- Rate limit tidak terpakai jika pengiriman WA gagal

---

## REST API

Semua endpoint `/api/v1/*` butuh header:

```
Authorization: Bearer <API_KEY>
```

API key di-generate dari dashboard → Settings → API Keys.

### Session

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/v1/sessions` | List session count |
| `POST` | `/api/v1/sessions` | Create session baru |
| `GET` | `/api/v1/sessions/:id` | Status session |
| `GET` | `/api/v1/sessions/:id/qr` | Ambil QR code |
| `POST` | `/api/v1/sessions/:id/reconnect` | Reconnect session |
| `DELETE` | `/api/v1/sessions/:id` | Hapus session |

### Message

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/v1/sessions/:id/send` | Kirim text message |
| `POST` | `/api/v1/sessions/:id/send-media` | Kirim media (multipart) |

### Utility

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/v1/number-checker` | Cek batch nomor valid di WA |
| `GET` | `/api/v1/rate-limit/status` | Status rate limit API key |
| `GET` | `/api/v1/usage/stats` | Statistik pemakaian |
| `GET` | `/api/v1/usage/hourly` | Breakdown per jam |

### Contoh — Kirim Pesan

```bash
curl -X POST http://localhost:3000/api/v1/sessions/{sessionId}/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "6281234567890",
    "message": "Halo dari Wavvy!"
  }'
```

---

## Webhook Session

Setiap session dapat mengaktifkan webhook untuk event pesan:

1. Dashboard → pilih session → Settings → isi **Webhook URL**
2. Toggle **Enable Webhook**

Saat pesan masuk, server Wavvy akan POST JSON ke URL tersebut:

```json
{
  "sessionId": "abc-123",
  "from": "6281234567890",
  "message": "halo",
  "type": "text",
  "timestamp": 1712345678
}
```

---

## WhatsApp OTP (WABA) Setup

Fitur ini butuh akun **WhatsApp Business Platform** (bukan WA biasa) dari Meta:

1. Buat **WhatsApp Business Account** di [Meta Business Manager](https://business.facebook.com/)
2. Daftarkan nomor bisnis → dapatkan **Phone Number ID**
3. Generate **System User Access Token** (permanent)
4. Buat **template message** bernama `otp_verification` (kategori: AUTHENTICATION) dan submit untuk approval
5. Login Wavvy sebagai admin → **Settings → WhatsApp OTP**
6. Isi:
   - Enable toggle
   - Phone Number ID
   - Access Token
   - Business Account ID (opsional, untuk manage template dari UI)
   - Template Name (default: `otp_verification`)
   - Button Type (`url`, `copy_code`, atau `none` — sesuai template)
7. Save → fitur aktif

Lihat `WABA_SETUP_GUIDE.md` (jika tersedia) untuk panduan lebih detail.

---

## Deployment

### Docker (rekomendasi)

```bash
docker-compose up -d              # start
docker-compose logs -f app        # lihat log
docker-compose down               # stop
docker-compose pull && docker-compose up -d --build   # update
```

Volume yang di-persist:
- `sessions/` — auth state Baileys (**jangan hilang**, ini yang bikin session tetap login)
- `uploads/` — file yang di-upload user
- `db_data` — data MySQL

### Manual / PM2

```bash
npm install --production
pm2 start server.js --name wavvy
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx contoh)

```nginx
server {
    listen 80;
    server_name wavvy.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

Aktifkan HTTPS (Let's Encrypt) sebelum production.

---

## Troubleshooting

**Session selalu logout / QR terus muncul**
- Pastikan folder `sessions/` tidak di-delete / permission benar
- Cek `WA_QR_TIMEOUT` dan `WA_MAX_QR_ATTEMPTS` di `.env`

**OTP tidak terkirim**
- Cek `WABA_OTP_ENABLED=true`
- Verifikasi Access Token masih valid (System User Token tidak expire, tapi User Token expire 60 hari)
- Pastikan template `otp_verification` sudah **APPROVED** oleh Meta
- Lihat log: `docker-compose logs app | grep WABA`

**Database connection error saat startup**
- Pastikan MySQL running, credentials benar di `.env`
- Untuk Docker: pastikan `depends_on` + `healthcheck` MySQL sudah healthy
- Import `database.sql` manual jika bukan via Docker

**Upload file gagal**
- Cek `UPLOAD_MAX_SIZE` dan `UPLOAD_ALLOWED_TYPES`
- Nginx: set `client_max_body_size` ≥ batas upload
- Pastikan folder `uploads/` writable

**Campaign tidak berjalan sesuai jadwal**
- Cek proses cron scheduler (`node-cron`) di log
- `MSG_BETWEEN_DELAY` terlalu tinggi → campaign lambat
- Plan user mungkin kena message limit

---

## Lisensi

ISC — lihat `package.json`.

---

## Kontribusi

Isu dan pull request silakan via repository host. Sebelum submit, pastikan:
- Kode lolos linting (jika ada)
- `.env.example` di-update jika menambah variabel baru
- `database.sql` di-update jika ada schema change (plus file migration di `migrations/`)
