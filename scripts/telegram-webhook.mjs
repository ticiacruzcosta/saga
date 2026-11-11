// Executar com: npm run telegram:webhook -- https://seu-dominio.vercel.app
// Com --delete, remove o webhook antes de voltar ao polling local.
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const modo = process.argv[2];
if (!token) { console.error("Configure TELEGRAM_BOT_TOKEN no .env."); process.exit(1); }
if (modo !== "--delete" && (!secret || !/^[a-zA-Z0-9_-]{12,256}$/.test(secret))) { console.error("Configure TELEGRAM_WEBHOOK_SECRET com 12+ caracteres alfanuméricos no .env."); process.exit(1); }
if (modo !== "--delete" && !/^https:\/\/[^/]+\.[^/]+\/?$/.test(modo ?? "")) { console.error("Informe uma URL HTTPS pública, sem caminho adicional."); process.exit(1); }
const endpoint = modo === "--delete" ? "deleteWebhook" : "setWebhook";
const body = modo === "--delete" ? { drop_pending_updates: false } : { url: `${modo.replace(/\/$/, "")}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"] };
const res = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const json = await res.json().catch(() => ({}));
if (!res.ok || !json.ok) { console.error("Telegram recusou a configuração:", json.description ?? res.status); process.exit(1); }
console.log(modo === "--delete" ? "Webhook removido. Agora o polling pode ser usado." : "Webhook configurado para o site. Não execute polling simultaneamente.");
