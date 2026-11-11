# Como testar destinatários no SAGA — versão de simulação

## Novidade

Na página `/bot-whatsapp`, a seção **5. Gerenciar destinatários de teste** permite cadastrar um telefone brasileiro com DDD, visualizar os testes ativos e desativá-los. Apenas ADMIN pode usar esses formulários.

Destinatários de teste recebem a flag `WhatsappAssinante.apenasSimulacao=true` no banco. A fila em modo REAL exige `apenasSimulacao=false`, e o processador também bloqueia envio real a um contato de teste. **Em modo SIMULACAO não são feitas chamadas à Meta nem enviados SMS ou WhatsApp.**

Inscrição real é separada: a pessoa envia `INSCREVER` ao número WhatsApp conectado, via webhook oficial, para habilitar os avisos; `SAIR` revoga a inscrição.

## Atualizar a instalação do Windows

1. Pare o servidor anterior no VS Code com `Ctrl + C`.
2. Extraia este ZIP em uma pasta **nova** e abra a pasta interna `saga-main` no VS Code (a pasta com `package.json`).
3. Copie o `.env` local da pasta anterior para a pasta nova. Não copie para outra pessoa nem compartilhe em prints. Confirme que aponta para o **seu banco de testes**.
4. Confirme `WHATSAPP_MODE="SIMULACAO"` no `.env`.
5. No terminal da pasta `saga-main`, execute os comandos abaixo:

   ```powershell
   npm install
   npx prisma generate
   npx prisma db push
   npm run dev
   ```

   **Atenção:** `prisma db push` nesta versão é necessário porque foi adicionado o campo booleano `apenasSimulacao` com valor padrão falso. Execute **somente em seu banco Neon de testes**; não execute no banco da faculdade em produção.

6. Acesse `http://localhost:3000/bot-whatsapp` com a conta ADMIN.
7. Role para a seção 5; cadastre seu próprio número com DDD, confirme a autorização e clique **Adicionar destinatário de teste**. O topo deverá mostrar 1 destinatário elegível em simulação.
8. Na seção 2, para um aviso pendente, clique em **Preparar 1 destinatário**. Na seção 3, revise e confirme a **simulação**. Depois clique em **Processar até 10 mensagens da fila**.
9. Espere ver `SIMULADO: 1` no lote. **Nenhum WhatsApp real chegará ao telefone**. Isso valida apenas a fila e o fluxo interno.
10. Você pode usar a opção **Desativar** para remover o número da lista ativa. Mensagens ainda pendentes para esse número serão canceladas.

### Dicas

- Se você cadastrar o telefone *depois* de preparar o lote, o novo contato não entra nesse lote já criado. Para o teste, adicione o contato **antes** de preparar um aviso novo.
- Como um aviso só pode ter um lote, não haverá botão para criar um segundo lote no mesmo aviso. Crie outro aviso de teste se precisar repetir a preparação.
- O novo campo `apenasSimulacao` não exclui registros antigos. Em um banco de testes já existente, Prisma adicionará esse campo com padrão `false`.
- Para disparos reais futuramente, além da autorização do aluno, será necessária a configuração oficial da Meta, templates adequados, hospedagem HTTPS e testes de integração.
