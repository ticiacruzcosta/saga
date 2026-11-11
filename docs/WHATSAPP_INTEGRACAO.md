# SAGA + WhatsApp — integração diretamente no projeto original

A integração faz parte do Next.js existente (`app/bot-whatsapp`, `app/api/whatsapp`, `lib/whatsapp`). **Não é um site separado.** Reutiliza `Oferta`, `Turma`, `Alteracao`, `Aviso`, `GrupoAlunos`, autenticação e banco Prisma do SAGA.

## Começar sem envio real

1. Extraia o projeto atualizado. Instale Node.js LTS e execute `npm install` na pasta principal.
2. Crie um **branch de desenvolvimento no Neon** e use as URLs dele em `DATABASE_URL` e `DIRECT_URL` de um `.env` local baseado no `.env.example`. **Não use as credenciais do banco de produção.**
3. Adicione ao mesmo `.env` as variáveis de `.env.bot.example`. Deixe `WHATSAPP_MODE=SIMULACAO`. Não inclua `.env` em commits/ZIPs.
4. Revise as alterações de `prisma/schema.prisma` (novos modelos `WhatsappAssinante`, `WhatsappLote`, `WhatsappMensagem`, `WhatsappEvento`). **Somente no banco de testes**, execute `npx prisma generate` e `npx prisma db push`. Para produção, preparar migração revisada.
5. `npm run dev` e acesse `http://localhost:3000`. Entre como ADMIN e clique em **Status do Bot → Abrir administração do bot**, ou abra `/bot-whatsapp`.
6. Com dados fictícios, teste criação de ocorrência, preparo de lote, confirmação **SIMULAÇÃO** e processamento. A simulação NÃO chama a Meta e NÃO marca o aviso original como enviado.

**Importante:** o painel exige perfil ADMIN. O botão Aviso e o histórico manual anteriores continuam disponíveis; um aviso já enfileirado não deve ser enviado também por via manual.

## Fluxo de trabalho

1. O administrador cria um aviso pelo botão **Aviso** do Dashboard, ou uma ocorrência (cancelamento / sala / horário) no painel do bot. Trocas de sala/professor do Dashboard também geram **um aviso pendente** quando há mudança efetiva.
2. Na tela `/bot-whatsapp`, revisa o aviso e seleciona **Preparar**. O sistema fotografa a mensagem e gera um destinatário por número **inscrito voluntariamente** — a inscrição é global, independentemente da turma do aviso.
3. Marca a confirmação e aprova o lote. O modo `REAL` ou `SIMULACAO` é congelado no banco neste momento. Alterar o `.env` depois NÃO transforma uma simulação confirmada em envio real.
4. Processa pelo botão no painel ou pela rota de worker autenticada. O status de cada mensagem fica no banco; no modo real, a Meta informa envio, entrega e leitura pelo webhook.
5. O aluno pode enviar `HORARIO` ou `SEGUNDA`, `TERCA`, `QUARTA`, `QUINTA`, `SEXTA`, `SABADO` e recebe a imagem PNG do semestre publicado. O arquivo é servido pelo mesmo SAGA com link assinado e validade de 15 minutos; não é necessário deixar a grade pública.

## Configurar a API oficial da Meta

- Tenha um app Meta com WhatsApp Business Platform, número de teste ou de produção e um **template aprovado** para comunicados institucionais, contendo uma variável `{{1}}` no corpo.
- Configure `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE=pt_BR` e `WHATSAPP_APP_SECRET`.
- Configure o webhook HTTPS `https://SEU_SITE/api/whatsapp/webhook`, inscreva o campo `messages` e use o mesmo `WHATSAPP_VERIFY_TOKEN` na Meta. POSTs são validados com HMAC (`X-Hub-Signature-256`).
- Para PNG por WhatsApp, configure `WHATSAPP_SITE_URL=https://SEU_SITE` e `WHATSAPP_IMAGE_SECRET` com pelo menos 32 caracteres aleatórios. O PNG só abre para usuários logados ou quem receber um URL de curta duração assinado.
- Use o número oficial para divulgar: `INSCREVER` (autorização para receber avisos), `SAIR` (cancelamento), `HORARIO`, `SEGUNDA` ... `SABADO`. **Nunca importe contatos de grupos sem consentimento.**
- Só depois de testar com número(s) controlado(s), ative `WHATSAPP_MODE=REAL`. O painel ainda exige confirmação explícita antes de enfileirar disparos reais. Templates fora da janela de atendimento podem exigir aprovação, categoria adequada e cobrança conforme regras da Meta.

### Modelo de template sugerido para submeter à Meta

```text
SAGA | Aviso acadêmico Unisapiens:
{{1}}
Para deixar de receber avisos, responda SAIR.
```

O nome e a língua devem ser os mesmos aprovados no gerenciador da Meta. Não há garantia de aprovação.

## API

| Método | Endpoint | Proteção / resultado |
| --- | --- | --- |
| GET | `/api/whatsapp/webhook` | Confere token de verificação (`hub.challenge`). |
| POST | `/api/whatsapp/webhook` | Valida HMAC do corpo e trata comandos/entrega. |
| POST | `/api/whatsapp/processar` | Exige `Authorization: Bearer <WHATSAPP_WORKER_SECRET>`; processa até 15 itens. |
| GET | `/api/whatsapp/horario?dia=SEXTA&data=YYYY-MM-DD&pagina=1` | PNG do semestre publicado, exige login; link assinado temporário para envio à Meta. |
| GET | `/bot-whatsapp` | Painel ADMIN, com formulários e prévia de PNG. |

### Worker

O MVP processa a fila **quando um administrador clica no botão**. Se quiser processamento contínuo, configure separadamente um job HTTPS que faça POST com `WHATSAPP_WORKER_SECRET` (intervalo e frequência compatíveis com a hospedagem); o projeto **não ativa cron automaticamente**. Nunca use GET nem exponha o segredo em frontend.

## Segurança e limitações

- **Envio real não testado neste pacote**: requer credenciais, template aprovado, conexão, testes e autorização da instituição.
- Telefone e horários são dados pessoais/operacionais. Restrinja acesso ao banco e siga os requisitos de consentimento, privacidade e retenção (LGPD).
- Não envie avisos durante o cadastro: primeiro revise e confirme os destinatários.
- Quem enviar `SAIR` é desativado e suas mensagens ainda pendentes são canceladas. Um destinatário pode ter dado opt-out entre a preparação do lote e o envio; o worker verifica novamente antes de cada envio.
- Links PNG assinados expiram em 15 minutos; a imagem representa a oferta publicada e alterações para a data solicitada. Se houver mais de 24 linhas, a imagem usa paginação e a resposta automática usa a primeira página.
- Uma simulação concluída **não pode** ser promovida a envio real nem reaproveitada; gere novo aviso autorizado para esse teste.
- Mensagens em `PROCESSANDO` após interrupção precisam ser reconciliadas com a Meta antes de retentar (evita disparos duplicados). Falhas ficam para investigação, **sem retentativa automática**.
- O campo `Aviso.status` representa o status resumido do lote; para detalhar falhas por contato consulte `WhatsappMensagem` no banco. Webhook pode receber status assíncronos.
- Não configure o arquivo `.env` com acesso ao banco produtivo ao executar `npx prisma db push`.

## Testes e entrega acadêmica

```bash
npm run test:bot
npm test
npm run build
```

Execute `npx prisma generate` antes do build. Consulte `docs/PLANO_DE_TESTES.md` e documente requisições simuladas, respostas do webhook, PNG e painel com dados anonimizados.

**O projeto entregue é uma cópia modificada do ZIP do usuário. O repositório remoto do GitHub e o site Vercel não foram alterados.**

## Cadastro de destinatários de teste no painel (nova seção 5)

Consulte `docs/DESTINATARIOS_TESTE.md`. O modelo `WhatsappAssinante` agora possui `apenasSimulacao` com valor padrão `false`. Contatos cadastrados manualmente no painel têm `apenasSimulacao=true` e são excluídos de qualquer envio real. Em um **banco de testes**, execute `npx prisma db push` para atualizar a tabela.
