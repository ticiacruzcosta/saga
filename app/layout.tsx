import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAGA - Sistema de Avisos e Gestão Acadêmica | Faculdade Unisapiens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Ícones (Font Awesome) e par tipográfico #1 do Pinterest: Montserrat (Bold) + Lora (Regular/SemiBold) */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@400;500;600;700;800;900&display=swap" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
