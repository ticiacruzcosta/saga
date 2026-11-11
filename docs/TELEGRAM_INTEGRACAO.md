# SAGA + Telegram — guia de instalação (Windows / VS Code)

## O que foi preservado

O SAGA original, a importação automática de cursos, o banco de dados existente no Neon, as páginas administrativas, os avisos e a integração anterior com o WhatsApp foram mantidos. O WhatsApp deve permanecer com `WHATSAPP_MODE=SIMULACAO`. Os 4 números de teste do WhatsApp **não** serão inscritos no Telegram automaticamente (são sistemas diferentes, e o Telegram exige interação do próprio aluno).

## Instalar sem perder o banco

1. Extraia o ZIP para uma **pasta nova** e abra a pasta interna `saga-main` no VS Code.
2. Copie o `.env` da sua instalação antiga para a nova pasta `saga-main`. Não envie o `.env` para outras pessoas ou para o GitHub.
3. No `.env` antigo, garanta `WHATSAPP_MODE=SIMULACAO`; acrescente os itens do `.env.telegram.example`.
4. Crie um bot pelo Telegram em https://t.me/BotFather usando `/newbot` e copie o TOKEN fornecido para `TELEGRAM_BOT_TOKEN` no `.env` (nunca no chat).
5. Execute na pasta `saga-main`:

   ```powershell
   npm install
   npx prisma generate
   ```

6. **Confirme que DATABASE_URL e DIRECT_URL apontam para seu Neon de testes**, e somente então execute:

   ```powershell
   npx prisma db push
   ```

   Esse comando acrescenta tabelas `telegram_*`. As turmas e os avisos existentes permanecem no banco. **Nunca execute no banco de produção sem aprovação/backup.**

7. Em um terminal, inicie o site:

   ```powershell
   npm run dev
   ```

8. Em um **segundo terminal** na mesma pasta, rode:

   ```powershell
   npm run telegram:polling
   ```

9. Abra o bot no Telegram e envie `/start`. O bot deve responder, e o SAGA mostrará um inscrito na página `http://localhost:3000/bot-telegram`.

> IMPORTANTE: O **modo SIMULACAO só afeta os envios de avisos em lote**. Os comandos recebidos pelo Telegram e as respostas individuais (incluindo imagens) são mensagens **reais**. Não execute com dados sigilosos.

## Comandos para alunos

- `/start` — confirmar inscrição para avisos de todas as turmas
- `/turmas` ou `/turmas 2` — lista de turmas e seus IDs
- `/turma 12` — selecionar turma para consultar imagem
- `/horario` — imagem PNG do dia atual
- `/segunda`, `/terca`, `/quarta`, `/quinta`, `/sexta`, `/sabado` — imagem PNG do próximo dia correspondente
- `/avisos` — últimos cinco avisos gerais
- `/sair` — desativar notificações e cancelar mensagens pendentes
- `/help` — ajuda

O bot responde somente em conversa privada e o aluno precisa iniciar a conversa. Os avisos gerais vão a **todos os inscritos**, enquanto as imagens são filtradas pela turma escolhida pelo aluno. Se não houver oferta publicada ou dados da turma, a consulta explica que ainda não há horário.

## Testar os disparos

1. Entre como ADMIN e abra `http://localhost:3000/bot-telegram`.
2. Escolha um aviso pendente e clique em **Preparar**. Isso fotografa os alunos inscritos naquele momento.
3. Confira o conteúdo e confirme o **modo SIMULACAO**.
4. Clique em Processar. Deve aparecer `SIMULADO`, sem mensagens em massa reais.
5. Para realizar um teste real controlado, use apenas inscritos voluntariamente (por `/start`) e configure `TELEGRAM_MODE=REAL`, reinicie o servidor e prepare **um novo aviso**. O envio real requer confirmar explicitamente o novo lote. Lotes confirmados em simulação **nunca mudam automaticamente** para reais.

## Depois de publicar o SAGA em um domínio HTTPS

Na hospedagem (por exemplo, Vercel), configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DATABASE_URL`, `DIRECT_URL` e as variáveis usuais do projeto.

Não use polling e webhook ao mesmo tempo. Para habilitar o webhook, pare o polling e execute:

```powershell
npm run telegram:webhook -- https://SEU-SITE.vercel.app
```

Para voltar a desenvolver localmente, remova o webhook antes de iniciar o polling:

```powershell
npm run telegram:webhook -- --delete
npm run telegram:polling
```

O webhook em `/api/telegram/webhook` exige o header secreto fornecido pelo Telegram. Para processamento periódico de avisos em produção, use `POST /api/telegram/processar` com `Authorization: Bearer <TELEGRAM_WORKER_SECRET>` por um agendador configurado por você; o site não programa envios sozinho.

## Segurança e limitações

- O token BotFather dá controle do bot. Nunca compartilhe o token. Se ele vazar, revogue pelo BotFather.
- Não copie números de WhatsApp para o Telegram. Cada aluno precisa iniciar seu bot e pode sair a qualquer momento.
- Este canal é **separado** do WhatsApp. Um aviso do SAGA pode ter um lote por canal.
- Não existe confirmação de leitura como na interface do usuário; `ENVIADO` significa que a API aceitou a mensagem, não que o aluno leu.
- Para uma demonstração acadêmica, confirme com os participantes que receberão avisos de teste. Antes do uso real pela faculdade, peça autorização institucional.
- O webhook exige site HTTPS público. Localmente, use `telegram:polling`.
- Não publique o `.env` nem a pasta `node_modules`/`.next`.
- Se uma tentativa de envio falhar, a fila registra `FALHOU` e não reenvia automaticamente. A revisão de erros deve ser manual para evitar duplicação.
