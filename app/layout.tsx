import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAGA - Sistema de Avisos e Gestão Acadêmica | Faculdade Unisapiens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Ícones (Font Awesome) e fontes da identidade visual (Plus Jakarta Sans + Nunito) */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Nunito:wght@600;700;800;900&display=swap" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
