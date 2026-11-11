import { request as httpsRequest } from "node:https";

/**
 * Transporte exclusivo dos avisos em lote: usa HTTPS nativo do Node.js,
 * evitando a instrumentação de fetch dentro de Server Actions do Next.js.
 * Não faz retentativas automáticas, pois um timeout pode ocorrer após a
 * mensagem ter chegado ao Telegram (reenviar poderia duplicá-la).
 *
 * requestFn é injetável somente para testes sem comunicação externa.
 */
export function enviarMensagemHttps(token, chatId, texto, requestFn = httpsRequest) {
  if (!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token)) {
    return Promise.reject(new Error("Token Telegram ausente ou inválido."));
  }
  if (!/^\d+$/.test(String(chatId))) {
    return Promise.reject(new Error("Identificador de chat Telegram inválido."));
  }

  const corpo = JSON.stringify({ chat_id: String(chatId), text: String(texto).slice(0, 4000) });
  return new Promise((resolve, reject) => {
    let concluido = false;
    function finalizar(erro, valor) {
      if (concluido) return;
      concluido = true;
      if (erro) reject(erro);
      else resolve(valor);
    }

    // O token aparece apenas no caminho HTTPS; não registre options em logs.
    const opcoes = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) },
    };

    let req;
    try {
      req = requestFn(opcoes, res => {
        const partes = [];
        let tamanho = 0;
        res.on("data", parte => {
          tamanho += parte.length;
          if (tamanho > 128 * 1024) {
            req.destroy(Object.assign(new Error("Resposta Telegram muito grande."), { code: "RESPOSTA_GRANDE" }));
          } else partes.push(parte);
        });
        res.on("error", erro => finalizar(new Error(`Erro na resposta HTTPS Telegram (${erro?.code ?? "REDE"}).`)));
        res.on("end", () => {
          if (concluido) return;
          let dados;
          try { dados = JSON.parse(Buffer.concat(partes).toString("utf8")); }
          catch { finalizar(new Error(`Resposta inválida da API Telegram (HTTP ${res.statusCode ?? "?"}).`)); return; }
          const codigo = dados?.error_code ?? res.statusCode ?? "?";
          if (res.statusCode !== 200 || !dados?.ok || !Number.isSafeInteger(dados?.result?.message_id)) {
            // Description da API não contém token e é limitada para o banco.
            const descricao = String(dados?.description ?? "resposta não confirmada").slice(0, 150);
            finalizar(new Error(`Telegram (${codigo}): ${descricao}`));
            return;
          }
          finalizar(null, { message_id: dados.result.message_id });
        });
      });
      req.setTimeout(20000, () => req.destroy(Object.assign(new Error("Tempo esgotado."), { code: "TIMEOUT" })));
      req.on("error", erro => finalizar(new Error(`Falha HTTPS Telegram (${erro?.code ?? "REDE"}).`)));
      req.end(corpo);
    } catch (erro) {
      finalizar(new Error(`Falha ao iniciar HTTPS Telegram (${erro?.code ?? "REDE"}).`));
    }
  });
}
