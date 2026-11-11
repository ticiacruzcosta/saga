# Checklist para a entrega — Integração WhatsApp & Testes de API

## Ambiente de testes (sem disparar mensagens reais)

- [ ] Banco Neon de desenvolvimento isolado, com dados fictícios.
- [ ] `WHATSAPP_MODE=SIMULACAO`; credenciais reais não são necessárias para preparar ou processar lotes.
- [ ] `npm run test:bot` sem falhas.
- [ ] `npm test` do SAGA continua passando.
- [ ] `npm run build` passa depois da alteração do Prisma.
- [ ] Admin acessa `/bot-whatsapp`; usuário comum não tem acesso.
- [ ] Criar alteração de sala e cancelar uma aula: verificar `Alteracao` e `Aviso` pendente.
- [ ] Preparar lote: cada inscrito recebe uma linha, sem números duplicados; lotes repetidos não duplicam registros.
- [ ] Confirmar e processar no modo simulação: mensagens com status `SIMULADO`, sem chamadas de rede à Meta.
- [ ] Confirmar que `Aviso.status` continua `PENDENTE` após simulação.
- [ ] Gerar a imagem de segunda a sábado e conferir cores, salas, professores e destaques por data.

## Testes da Meta / sandbox (somente com consentimento e números de teste)

- [ ] GET do webhook com token correto retorna `hub.challenge`; token incorreto retorna 403.
- [ ] POST sem `X-Hub-Signature-256` ou com HMAC incorreto retorna 401.
- [ ] POST com assinatura correta e comando `INSCREVER` cadastra número como ativo.
- [ ] Repetir mesmo `wamid` não gera duplo opt-in.
- [ ] Comando `SAIR` desativa o inscrito e cancela os envios pendentes.
- [ ] Comando `SEXTA` gera resposta com imagem via link HTTPS **assinado e temporário** (secret configurado).
- [ ] Com template aprovado e modo REAL, confirmar lote de teste com 1 número autorizado.
- [ ] Status `sent → delivered → read` atualiza a mesma mensagem e não retrocede.
- [ ] Credenciais inválidas produzem `FALHOU`, sem expor o token.
- [ ] Testar sem cron; se ativar worker externo, testar POST sem segredo (401) e com segredo (200).

## Evidências para relatório acadêmico

Capturar tela do painel, resultado dos testes de Node, imagem gerada do horário e exemplos *anonimizados* dos requests/responses do webhook e envio de template. **Não incluir token, App Secret, telefone real, número de matrícula ou string de conexão ao banco.**
