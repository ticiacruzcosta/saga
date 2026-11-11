// Local development only. Runs without exposing localhost to the Internet.
// Stop with Ctrl+C. Do not run while a webhook is set up.
import { chamadaTelegram } from "../lib/telegram/api";
import { receberAtualizacao } from "../lib/telegram/handler";

type Info = { url: string };
type Update = { update_id: number };

async function main() {
  const info = await chamadaTelegram<Info>("getWebhookInfo", {});
  if (info.url) throw new Error("Há um webhook configurado. Desative-o antes do polling local; veja docs/TELEGRAM_INTEGRACAO.md.");
  console.log("Telegram SAGA: ouvindo comandos. Abra o bot e envie /start. Pare com Ctrl+C.");
  let offset = 0;
  let ligado = true;
  process.on("SIGINT", () => { ligado = false; });
  process.on("SIGTERM", () => { ligado = false; });
  while (ligado) {
    try {
      const updates = await chamadaTelegram<Update[]>("getUpdates", { timeout: 12, offset, limit: 20, allowed_updates: ["message"] });
      for (const update of updates) {
        await receberAtualizacao(update);
        offset = update.update_id + 1;
      }
    } catch (e) {
      console.error("Polling Telegram:", e instanceof Error ? e.message : "erro");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.log("Polling parado.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "erro"); process.exitCode = 1; });
