# JK Chennai secure customer contacts

This Worker extends the GitHub Pages store without putting customer data in GitHub. Cloudflare D1 stores employees, secure sessions, contacts and audit history.

## Security model

- Individual administrator and employee accounts; no shared password.
- PBKDF2-SHA-256 password hashing with unique random salts.
- One-hour `HttpOnly`, `Secure`, `SameSite=Strict` sessions.
- Per-session CSRF tokens required for every write request.
- Five failed logins trigger a 15-minute block.
- D1 prepared statements, output escaping, validation and normalization.
- Employees can create contacts only. Administrator endpoints enforce the admin role server-side.
- Duplicate normalized phone numbers and non-empty email addresses are rejected by database indexes.
- Login, submission, edit/delete, employee changes and CSV exports are written to `audit_log`.
- Customer APIs return `Cache-Control: no-store` and are never public.

## Deployment checklist

1. Install dependencies: `npm install`.
2. Sign in: `npx wrangler login`.
3. Create D1: `npx wrangler d1 create jk-chennai-contacts` and put its ID in `wrangler.jsonc`.
4. Apply migrations: `npx wrangler d1 migrations apply jk-chennai-contacts --remote`.
5. In a private terminal, set `JKC_ADMIN_USERNAME`, `JKC_ADMIN_NAME`, and `JKC_ADMIN_PASSWORD`; redirect `node scripts/create_admin.mjs` to a temporary SQL file, apply it with Wrangler, then securely delete that temporary file.
6. Deploy with `npm run deploy`.
7. After the domain is moved to Cloudflare DNS, add routes for `jkchennai.in/form*`, `jkchennai.in/api/*`, and `jkchennai.in/admin/contacts*`. Until then, test on the assigned `workers.dev` address.

Never commit passwords, exported customer CSV files, database backups or generated administrator SQL.
