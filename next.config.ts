import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A planilha do Allan tem ~700 KB; o padrão do Next para ações é 1 MB.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // O exceljs roda no servidor do jeito que vem do npm (sem empacotar).
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
