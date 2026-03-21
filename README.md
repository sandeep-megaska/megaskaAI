This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment

Megaska AI Studio image and try-on generation requires:

- `GOOGLE_API_KEY` (Gemini/Imagen/Nano Banana backends)
- `LAOZHANG_API_KEY` (required only when `laozhang_gemini` is selected)
- `LAOZHANG_BASE_URL` (optional, default: `https://api.laozhang.ai/v1`)
- `LAOZHANG_IMAGE_MODEL` (optional, default: `gemini-3-pro-image-preview`)

If your environment still uses `GEMINI_API_KEY`, `/api/generate` supports it as a fallback, but `GOOGLE_API_KEY` is the recommended canonical variable.

Google Cloud billing-backed header spend requires (server-side only):

- `GOOGLE_BILLING_BQ_PROJECT_ID`
- `GOOGLE_BILLING_BQ_DATASET`
- `GOOGLE_BILLING_BQ_TABLE`
- `GOOGLE_BILLING_ACCOUNT_ID` (optional)
- Google auth with BigQuery read access (for example `GOOGLE_APPLICATION_CREDENTIALS`)
