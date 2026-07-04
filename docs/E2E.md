# OpenNOW End-to-End Test Checklist

Run this after deploying the VPS stack and obtaining sponsor credentials from the portal.

## Prerequisites

- Active GitHub Sponsorship of `zortos293`
- Proxy URL copied from the portal dashboard
- OpenNOW installed locally

## Steps

1. Open OpenNOW → **Settings → Video**
2. Enable **Session proxy**
3. Paste the full proxy URL (`http://user:pass@host:3128`)
4. Save settings and restart OpenNOW if prompted

## Verify proxied traffic

- [ ] Game catalog loads without errors
- [ ] Library / featured games load
- [ ] Session creation succeeds for a test title
- [ ] Queue polling works if applicable to your tier

## Verify direct traffic (not proxied)

- [ ] NVIDIA login still works
- [ ] Game streaming starts after session creation
- [ ] Signaling/WebRTC connects (stream video/audio present)

## Proxy enforcement

- [ ] Smoke test script passes against the VPS proxy
- [ ] Non-NVIDIA domains are rejected through the proxy

## Notes

OpenNOW intentionally skips background catalog cache refresh when a credentialed proxy is configured. This is expected behavior.
