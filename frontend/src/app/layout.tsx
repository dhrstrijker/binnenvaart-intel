import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Navisio - Scheepsmarkt Intelligence",
  description:
    "Monitor binnenvaartschepen te koop bij 5 makelaars. Vergelijk prijzen, specificaties en markttrends.",
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
