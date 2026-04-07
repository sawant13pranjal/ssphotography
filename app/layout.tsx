import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SS Photo & Films | Capturing Timeless Stories",
  description: "SS Photo & Films is a premium photography studio specializing in Wedding, Maternity, and Corporate events. Capturing raw, unscripted, and authentic moments since 2017.",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

import { AuthProvider } from "@/lib/authContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link 
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Manrope:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500&family=Elsie:wght@400;900&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-background text-foreground font-manrope selection:bg-gold selection:text-white">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
