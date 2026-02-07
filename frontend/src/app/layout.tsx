import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://navisio.nl"),
  title: {
    default: "Navisio - Scheepsmarkt Intelligence",
    template: "%s | Navisio",
  },
  description:
    "Monitor binnenvaartschepen te koop bij 5 makelaars. Vergelijk prijzen, specificaties en markttrends.",
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: "Navisio",
    title: "Navisio - Scheepsmarkt Intelligence",
    description:
      "Monitor binnenvaartschepen te koop bij 5 makelaars. Vergelijk prijzen, specificaties en markttrends.",
    url: "https://navisio.nl",
  },
  twitter: {
    card: "summary_large_image",
    title: "Navisio - Scheepsmarkt Intelligence",
    description:
      "Monitor binnenvaartschepen te koop bij 5 makelaars. Vergelijk prijzen, specificaties en markttrends.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
