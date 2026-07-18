# Remote access via Cloudflare Tunnel

By default, MindBase runs locally and is reachable only on your LAN. To capture from your phone while on cellular data (or from a friend's network, or from a coworking space), expose your local server through a Cloudflare Tunnel.

This is the official, free, recommended way for self-hosted MindBase users to enable off-LAN device access without opening ports on your router or running a relay service.

## Quick start (ephemeral tunnel)

```bash
brew install cloudflared        # or: see https://github.com/cloudflare/cloudflared#installing-cloudflared

# In one terminal — keep MindBase running:
pnpm -F @mindbase/server dev

# In another:
cloudflared tunnel --url http://localhost:4321
```

After a few seconds, cloudflared prints a URL like:

```
https://<random-words>.trycloudflare.com
```

Use that URL as your "Server URL" in the MindBase mobile app or browser-ext options. Captures from anywhere will now reach your server.

The tunnel is **ephemeral**: it disappears when you stop the cloudflared process, and the URL changes each run. Good for testing.

## Permanent tunnel (recommended for daily use)

For a stable URL like `https://mindbase.your-domain.com`:

1. Install cloudflared (above).
2. Authenticate with your Cloudflare account: `cloudflared tunnel login` — opens a browser, asks you to pick a domain you own.
3. Create the tunnel: `cloudflared tunnel create mindbase`
4. Configure routing in `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-uuid-from-step-3>
   credentials-file: ~/.cloudflared/<tunnel-uuid>.json
   ingress:
     - hostname: mindbase.your-domain.com
       service: http://localhost:4321
     - service: http_status:404
   ```
5. Add a DNS route: `cloudflared tunnel route dns mindbase mindbase.your-domain.com`
6. Run as a service: `sudo cloudflared service install`

The tunnel now runs in the background; your devices use `https://mindbase.your-domain.com` as the server URL.

## Why Cloudflare Tunnel and not ngrok / port-forwarding / a relay

- Free for personal use.
- TLS handled by Cloudflare — devices speak HTTPS, the tunnel encrypts to Cloudflare, then localhost.
- No router config / no exposed ports.
- No central relay service that has access to your data — Cloudflare proxies the bytes but never decrypts them in transit beyond standard TLS.

## Privacy note

Your captures pass through Cloudflare's edge. Cloudflare can see HTTPS metadata (your domain, source IP, byte volumes) but not the bodies. If this is unacceptable, run a self-hosted alternative like Tailscale (Funnel) — same architecture, runs on Tailscale's infra, similar guarantees.

## Troubleshooting

**`Connection refused` from the tunnel:** the local server isn't running on the expected port. Run `curl http://localhost:4321/api/devices/pair-code` locally to check.

**`522 Connection timed out` from devices:** local server crashed or restarted. Check the cloudflared logs and your server logs.

**Devices show "missing token":** the device was paired against `localhost:4321` but is now hitting the cloudflare URL. Re-pair through the new server URL, OR set `serverUrl` in the device's settings to the cloudflare URL before pairing.
