# JK Chennai Cloudflare Free customer accounts

This Worker is deliberately separate from `crm/`. It stores customer logins, saved products, delivery addresses and website order history in its own D1 database.

## Free services used

- Cloudflare Worker at `account.jkchennai.in`
- D1 database `jk-chennai-accounts`
- Turnstile widget for login bot protection
- one daily Cron Trigger for expired-session cleanup

## One-time Cloudflare deployment

Run these commands from this `account` folder using Wrangler 4:

```powershell
wrangler login
wrangler d1 create jk-chennai-accounts
wrangler d1 migrations apply jk-chennai-accounts --remote
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET
wrangler deploy --minify
```

When `wrangler d1 create` returns the database UUID, place it in `wrangler.jsonc` as `database_id` for the `DB` binding before applying the remote migration.

The owner order page is `https://account.jkchennai.in/owner/orders`. It uses the same private owner username and password as the existing JK Chennai customer-contact admin. The account Worker receives read-only login access to that CRM database; customer account and order information stays in the separate account D1 database.

## Turnstile

In Cloudflare, create a free Turnstile widget for these hostnames:

- `jkchennai.in`
- `www.jkchennai.in`

Store the public site key and private secret with the commands above.

## Google OAuth

Create a Google OAuth 2.0 Web application and set:

- Authorized JavaScript origin: `https://jkchennai.in`
- Authorized redirect URI: `https://account.jkchennai.in/auth/google/callback`

Store the client ID and client secret through Wrangler secrets. The browser receives neither secret.

## Local verification

```powershell
wrangler d1 migrations apply jk-chennai-accounts --local
wrangler dev --port 8787
```

Run the storefront on port `8766`; `account.html` automatically uses the local Worker at `http://127.0.0.1:8787` on localhost. Google login remains disabled locally unless local development secrets are added to an ignored `.dev.vars` file.

## Privacy and limitations

- Customer accounts are optional; guest WhatsApp checkout still works.
- The Worker stores order status and payment references, never card numbers, CVV, UPI PINs or Google passwords.
- Orders created in D1 do not automatically reduce the static catalog stock.
- Payment and courier status stay manual until verified third-party webhooks are added.
