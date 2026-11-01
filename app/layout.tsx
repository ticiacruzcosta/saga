import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAGA - Sistema de Avisos e Gestão Acadêmica | Faculdade Unisapiens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Os mesmos ícones do protótipo (Font Awesome) */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
