# Deployment Guide

## Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set root directory to `apps/web`
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-builds on push to `main`

## Database (Supabase)

1. Create a new Supabase project at https://supabase.com
2. Run migrations:
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```
3. Enable Realtime on `flights_current` table
4. Copy the project URL and anon key to your `.env` files

## Ingestor (Raspberry Pi)

### Option A: systemd (recommended)

```bash
# On the Raspberry Pi
sudo cp infra/systemd/mia-ingestor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mia-ingestor
sudo systemctl start mia-ingestor

# Check status
sudo systemctl status mia-ingestor
journalctl -u mia-ingestor -f
```

### Option B: Docker

```bash
docker build -t mia-ingestor -f infra/docker/Dockerfile.ingestor .
docker run -d --name mia-ingestor --env-file .env mia-ingestor
```

## Monitoring

- **Ingestor logs**: `journalctl -u mia-ingestor -f`
- **Supabase dashboard**: Monitor database usage and realtime connections
- **Vercel dashboard**: Monitor frontend deployments and analytics

## Security Hardening (Phase 4)

Use the production checklist in [`docs/security-hardening-checklist.md`](security-hardening-checklist.md) before every release cut.
