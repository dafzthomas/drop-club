# Drop Club

Drop Club is a fair, verifiable prize-draw app. The Next.js app runs on Vercel and Convex owns the application data, transactional ticket inventory, draw records, and audit trail.

## Local development

Install dependencies and create a local environment file:

```bash
npm install
cp .env.example .env.local
```

Start a Convex development deployment in one terminal:

```bash
npx convex dev
```

Then start Next.js in another:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default development admin is `admin@example.com`; add it to `DEV_ADMIN_EMAILS` in the Convex deployment environment when needed.

## Verification

The project has separate typecheck, lint, build, and runtime checks. The runtime check builds the app, starts the production server, and exercises the real HTTP journey against the configured Convex deployment:

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run runtime-e2e
```

The runtime check uses the development payment path when Stripe credentials are not configured. It does not expose magic-link tokens or session cookies in its output.

## Production

Deploy the Convex functions to the production deployment, configure the Vercel environment variables from `.env.example`, and deploy the linked Vercel project:

```bash
npx convex deploy --typecheck enable
vercel deploy --prod
```

Required values are `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_API_SECRET`, `MAGIC_LINK_PEPPER`, and `DEV_ADMIN_EMAILS`. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to enable Stripe checkout in place of the development payment path.
