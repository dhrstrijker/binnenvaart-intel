import { Checkout } from "@polar-sh/nextjs";

export const GET = Checkout({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  successUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://navisio.vercel.app") + "/checkout/success",
  server: "production",
});
