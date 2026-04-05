<div align="center">

# FormTo

### The self-hosted form backend you'll actually enjoy running.

Add one `action` attribute to any HTML form and start collecting submissions.
No coding. No SaaS subscription. No vendor lock-in.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](#quick-start)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](#)

[Quick Start](#quick-start) · [Features](#features) · [Configuration](#configuration) · [Self-host](#self-hosting)

</div>

---

## What is FormTo?

FormTo is an **open-source, self-hosted alternative to Formspree, Formcarry and Basin**.
Point your HTML form at FormTo, and every submission is saved, searchable, exportable, and delivered to your inbox (or Telegram, or Slack, or any webhook).

```html
<form action="https://forms.example.com/f/contact-abc123" method="POST">
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>
```

That's it. No JavaScript. No API keys. Submissions appear in your dashboard instantly.

---

## Features

| | |
|---|---|
| 📥 **Submissions inbox** | Read, archive, reply by email, add internal notes, change status (new / in-progress / resolved) |
| 📧 **Email notifications** | Bring your own SMTP — Gmail, Mailgun, Postmark, Resend, anything |
| 💬 **Telegram & Slack** | Native integrations via bot token or incoming webhook |
| 🔗 **Webhooks** | POST every submission as JSON to Zapier, Make, n8n, Discord, or your own endpoint |
| 🎨 **Custom email templates** | Brand your notifications with HTML and your logo |
| 📊 **Analytics** | Submissions over time, per-form breakdown, top fields |
| 🌐 **Hosted form pages** | Share a standalone form at `/f/:endpoint` — no HTML required |
| 🛡️ **Spam protection** | Built-in honeypot, rate limiting, and block-by email/domain/IP |
| 🔒 **Auto-close** | Stop accepting submissions after N responses or on a specific date |
| 🏷️ **Tags & filters** | Organize forms with labels and search across everything |
| 📦 **CSV + JSON export** | Own your data — download it anytime |
| 🧙 **First-run wizard** | Zero config. Open the app, create your account, done |

---

## Quick Start

**Requires** Docker and Docker Compose. That's the only dependency.

```bash
# 1. Clone
git clone https://github.com/lumizone/formto
cd formto

# 2. Configure
cp formto.env.example formto.env
# Edit formto.env — set DOMAIN, POSTGRES_PASSWORD, JWT_SECRET

# 3. Launch
docker compose up -d
```

Open `https://your-domain.com` → the first-run setup wizard will greet you → create your account → create your first form.

> **HTTPS is automatic.** [Caddy](https://caddyserver.com) obtains and renews Let's Encrypt certificates for your domain. No certbot, no cron jobs, no `--renew` flags.

---

## Configuration

Everything lives in a single `formto.env` file.

### Required

```env
DOMAIN=forms.example.com
POSTGRES_PASSWORD=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -hex 32>
```

### Optional (SMTP fallback)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=FormTo <noreply@forms.example.com>
```

SMTP, Telegram and Slack credentials can also be configured **per account in the UI** (Account → Notifications), so you don't have to bake them into env vars.

### Running without a domain

On a VPS with IP only? Edit `Caddyfile`, replace `{$DOMAIN}` with `:80`, leave `DOMAIN=` empty. Access the app at `http://your-server-ip`.

---

## Self-hosting

### Architecture

```
                Internet
                    │
                    ▼
            ┌─────────────┐
            │   Caddy     │  ← auto HTTPS (Let's Encrypt)
            └──────┬──────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   ┌────────┐ ┌────────┐ ┌──────────┐
   │Frontend│ │Backend │ │ /f/*     │
   │ React  │ │Fastify │ │ (public  │
   │ :80    │ │ :3001  │ │  forms)  │
   └────────┘ └───┬────┘ └──────────┘
                  │
                  ▼
            ┌──────────┐
            │PostgreSQL│
            │    :16   │
            └──────────┘
```

### Everyday commands

```bash
docker compose up -d              # start
docker compose down               # stop
docker compose logs -f backend    # tail logs
docker compose up -d --build      # rebuild after pulling updates
```

### Backup & restore

```bash
# Backup
docker compose exec postgres pg_dump -U formto formto > backup_$(date +%F).sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U formto formto
```

### Updating

```bash
git pull
docker compose up -d --build
```

Schema migrations run automatically on boot — no manual steps.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS v4, Radix UI |
| **Backend** | Fastify, Node.js 20, postgres.js, jose (JWT), nodemailer |
| **Database** | PostgreSQL 16 |
| **Reverse proxy** | Caddy 2 (automatic HTTPS) |
| **Deployment** | Docker Compose |

---

## Security

FormTo ships with sensible defaults out of the box:

- 🔐 **Passwords** hashed with bcrypt
- 🎫 **JWT auth** (HS256, 7-day TTL) with startup warnings on default secrets
- 🕸️ **SSRF protection** on webhook URLs (DNS pinning, private-IP blocking)
- 🧱 **Rate limiting** on all public endpoints
- 🍯 **Honeypot** and spam detection on every form
- 🚫 **SQL injection–proof** — 100% parameterized queries (postgres.js tagged templates)
- 🛡️ **XSS-safe** email templates and hosted forms

Found a vulnerability? Please open a private security advisory on GitHub.

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[AGPL-3.0](./LICENSE) — free to use, modify, and self-host. If you distribute a modified version or run it as a public service, you must publish your changes under the same license.

---

<div align="center">

**Built with ❤️ for developers who value ownership of their data.**

⭐ Star this repo if you find it useful!

</div>
