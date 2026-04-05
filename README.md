# FormTo — Open Source

Self-hosted form backend. Add one `action` attribute to any HTML form and start collecting submissions.

```html
<form action="https://your-domain.com/f/contact-abc123" method="POST">
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>
```

Submissions land in your dashboard. Notifications via email, Telegram, Slack, or webhooks.

## Quick start

Requires Docker and Docker Compose.

```bash
git clone https://github.com/yourusername/formto
cd formto

cp formto.env.example formto.env
# edit formto.env — set DOMAIN, POSTGRES_PASSWORD, JWT_SECRET

docker compose up -d
```

Open `https://your-domain.com` → first-run setup wizard → create your account → create your first form.

HTTPS is automatic — Caddy obtains and renews Let's Encrypt certificates.

## Configuration

All settings live in `formto.env`. Minimum required:

```env
DOMAIN=forms.example.com
POSTGRES_PASSWORD=<generate with: openssl rand -base64 32>
JWT_SECRET=<generate with: openssl rand -hex 32>
```

SMTP, Telegram, and Slack credentials can be configured per-account in the UI (Account → Notifications).

## Running without a domain

On a VPS with IP only, edit `Caddyfile` and replace `{$DOMAIN}` with `:80`, then leave `DOMAIN=` empty in `formto.env`. Access the app at `http://your-server-ip`.

## Useful commands

```bash
docker compose up -d              # start
docker compose down               # stop
docker compose logs -f backend    # logs
docker compose up -d --build      # rebuild after updates

# backup / restore
docker compose exec postgres pg_dump -U formto formto > backup.sql
cat backup.sql | docker compose exec -T postgres psql -U formto formto
```

## Updating

```bash
git pull
docker compose up -d --build
```

Schema migrations run automatically on boot.

## License

[AGPL-3.0](./LICENSE)
