# OpenNOW End-to-End Test Checklist

## Setup

1. Create a proxy user in the admin panel (`/admin`)
2. Copy the OpenNOW URL from the users table
3. OpenNOW → **Settings → Video** → enable **Session proxy** → paste URL

## Verify

- [ ] Game catalog loads
- [ ] Library / featured games load
- [ ] Session creation works
- [ ] Streaming still works (direct, not proxied)
- [ ] Smoke test script passes

## Notes

OpenNOW skips background catalog cache refresh when the proxy URL includes credentials. This is expected.
