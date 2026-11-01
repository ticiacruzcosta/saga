# SAGA — Sistema de Avisos e Gestão Acadêmica

Projeto de Extensão IV · Centro Universitário Unisapiens 

Sistema web para a coordenação **montar a oferta de disciplinas do semestre sem choques** de horário,
professor, laboratório ou turma, acompanhar as aulas do dia e gerar avisos para os grupos de WhatsApp.

## Funcionalidades

| Tela | O que faz |
|---|---|
| **Dashboard** | Aulas do dia, com calendário (clique na data) que pode colorir os dias pela ocupação das salas. O lápis registra troca de sala ou professor só daquele dia; *Aviso* gera a mensagem de WhatsApp. |
| **Grade do Semestre** | Oferta completa com filtros e conflitos. **Realocar** sugere outro dia/horário/sala livre para uma aula; **Resolver Conflitos** sugere uma mudança para cada conflito. Seletor de semestre, **Gerar próximo semestre**, **Publicar** e exportar para **Excel** (no formato da planilha, pode ser importado de volta) ou **PDF**. |
| **Horário da Semana** | Quadro de segunda a sábado, com linhas por turma, professor ou sala. Pode ser impresso. |
| **Importar Planilha** | Lê o `.xlsx` da oferta, mostra o que vai mudar (turmas, cadastros novos, choques) e só grava quando confirmado. |
| **Histórico de Avisos** | Mensagens geradas e seu status. |
| **Usuários** (só administradores) | Aprovar, desativar, excluir contas e tornar alguém administrador. Contas criadas na tela de login ficam aguardando aprovação. |
| **Cadastros** | Cursos & Turmas, Professores (com os dias em que não pode dar aula), Salas & Laboratórios e Ofertas & Disciplinas: cadastrar, editar e excluir. |

Também: trocar a própria senha (ícone de chave no rodapé do menu), tema escuro (lua/sol no topo), atalho **/** para a busca,
aviso ao fechar uma janela com alterações não salvas e bloqueio de 5 minutos após 5 senhas erradas seguidas.

### Regras de conflito

| Regra | Resultado |
|---|---|
| Professor em duas aulas no mesmo horário | bloqueia |
| Sala/laboratório ocupado no mesmo horário | bloqueia |
| Mesma turma com duas aulas no mesmo horário | bloqueia |
| Vagas acima da capacidade do laboratório ou do teto da disciplina | bloqueia |
| Disciplina com sala fixa em outra sala | bloqueia |
| Disciplinas em rodízio no mesmo laboratório | alerta |
| Aula híbrida que coincide com outra (pode alternar semanas) | alerta |
| Laboratório sem capacidade cadastrada / professor que nunca deu a disciplina | alerta |
| Aula assíncrona (EAD) | não gera choque |
| Comunalidade (turma que assiste aula de outro curso) | não conta como choque duplo |

### Ciclo do semestre

1. **Importar** a planilha de oferta, ou **gerar** o próximo semestre a partir do atual (2026.2 → 2027.1 → 2027.2…).
   O gerador avança os períodos, puxa as disciplinas da matriz, escolhe professores e encaixa horários sem choque.
2. **Revisar** o rascunho na Grade: resolver conflitos e definir o que ficou "A definir".
3. **Publicar**: o semestre passa a valer para todos e o anterior é arquivado.

Semestre publicado não é sobrescrito pelo gerador. Reimportar a planilha com *Substituir* desfaz as realocações feitas na tela.

## Tecnologias

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 com SQLite · ExcelJS.
O script de carga inicial (`seed.py`) usa Python 3 com `openpyxl`.

## Como rodar

Requisitos: **Node.js LTS**. Python 3 só é necessário para recriar o banco do zero.

```
npm install
npm run dev
```

Acesse **http://localhost:3000**. No primeiro acesso, sem nenhum usuário cadastrado, a tela de login pede nome, e-mail e senha
(mínimo de 8 caracteres) para criar a conta de **administrador**. Depois disso, a tela passa a pedir só e-mail e senha.
Outras pessoas usam **Criar nova conta** na tela de login; a conta nasce como usuário comum e fica aguardando até um administrador aprovar em *Sistema → Usuários*.

O banco fica em `prisma/dev.db` e não vai para o Git. Para criá-lo (ou recriá-lo do zero) a partir das planilhas de `dados-fonte/`:

```
pip install openpyxl
npm run banco
```

O resultado esperado é `127 de 127 linhas conferem com a planilha`. Também é gerado `conferencia.xlsx` com os possíveis choques
da planilha original. **Atenção:** `npm run banco` apaga o banco inteiro. No dia a dia, use a tela *Importar Planilha*.

| Comando | Para quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | versão de produção |
| `npm run banco` | recria o banco a partir das planilhas |
| `npm run banco:studio` | abre o banco numa interface visual (Prisma Studio) |
| `npm test` | testes automáticos (regras de choque, gerador, realocação, leitura da planilha, datas) |
| `npx prisma db push` | aplica mudanças feitas em `prisma/schema.prisma` |

### Publicar na internet (Vercel + Neon)

Endereço publicado: **https://saga-liard.vercel.app** (as funções rodam em São Paulo, `gru1`, perto do banco: ver `vercel.json`).

O banco é PostgreSQL no **Neon** e o site roda na **Vercel**; os endereços do banco ficam no `.env` (modelo em `.env.example`), que não vai para o Git.

1. **Neon** (neon.tech): crie um projeto (região São Paulo) e copie as duas conexões em *Connect*: a *pooled* vai em `DATABASE_URL`, a direta em `DIRECT_URL`.
2. Crie o arquivo `.env` a partir do `.env.example` e cole os endereços.
3. `npm run migrar`: cria as tabelas no Neon e copia todos os dados do banco local antigo (`prisma/dev.db`).
   Para repetir apagando o que já está no Neon: `npm run migrar -- --substituir`.
4. **Vercel** (vercel.com): *Add New → Project*, importe o repositório do GitHub, cadastre `DATABASE_URL` e `DIRECT_URL` em
   *Environment Variables* e clique em *Deploy*. Em *Settings → Functions*, escolha a região São Paulo (`gru1`), perto do banco.
   A partir daí, cada `git push` na branch `main` publica a nova versão sozinho.

O `npm run banco` (recriar tudo a partir das planilhas) continua gerando o `prisma/dev.db`; depois dele, `npm run migrar -- --substituir` leva o resultado para o Neon.

### Link público (acesso de qualquer lugar)

Dois cliques em **`LINK-PUBLICO.cmd`**: ele prepara a versão de produção (se o código mudou), liga o site e cria um link
`https://….trycloudflare.com` com o Cloudflare Tunnel (o link já fica copiado). Precisa do `cloudflared`
(`winget install --id Cloudflare.cloudflared`). O link **muda a cada vez** e só funciona enquanto o computador e as janelas
"SAGA - site" e "SAGA - link publico" estiverem abertos. Quem recebe o link cria a conta na tela de login e um administrador aprova.
Antes, feche o `npm run dev` (os dois usam a porta 3000).

### Usar na rede da faculdade

Num computador da coordenação:

```
npm run build
npm start -- -H 0.0.0.0
```

Os demais acessam por `http://IP-DO-COMPUTADOR:3000` (IP em `ipconfig`). Para publicar na internet seria preciso
trocar o SQLite por um banco online (ex.: PostgreSQL) e servir o site por HTTPS.

## Estrutura

```
app/
  page.tsx          exige login, carrega os dados e entrega para a tela
  login/page.tsx    tela de login (ou de primeiro acesso)
  auth.ts           entrar, primeiro acesso e sair
  actions.ts        nova oferta, edição, exclusão, cadastros e dashboard
  importacao.ts     importação da planilha
  realocacao.ts     realocar / resolver conflitos
  ofertas.ts        semestres: escolher, gerar, publicar
  api/exportar/     download da oferta em .xlsx
components/
  SagaApp.tsx       estrutura, Dashboard, Grade, cadastros e janelas compartilhadas
  telas/            uma tela por arquivo (Semana, Importar, Histórico, Usuários...)
  CalendarioDia.tsx calendário do dashboard
  TelaLogin.tsx     formulário de login
lib/
  auth.ts              senha (scrypt), sessão e bloqueio de login
  atividade.ts         registro de atividades e dados para desfazer
  validacao-choque.ts  regras de conflito
  realocacao.ts        busca de horário/sala livre
  gerar-oferta.ts      montagem do próximo semestre
  planilha-oferta.ts   leitura do .xlsx
  dados.ts, vm.ts      leitura do banco e preparo dos dados da tela
prisma/schema.prisma   modelo do banco
dados-fonte/           planilhas originais
docs/                  protótipo
seed.py                carga inicial do banco
tests/                 testes automáticos (npm test)
```

### Modelo de dados

- **Curso**, **Disciplina** (regras: formato, tipo de sala, sala fixa, rodízio, duração, teto de alunos) e **MatrizItem** (curso × período × disciplina).
- **Professor**, **Ambiente** (salas e laboratórios) e **GrupoAlunos** (turma de alunos, ex.: SIST. DE INFORM. 4º A).
- **Oferta** (semestre: rascunho, publicada ou arquivada) e **Turma** (uma aula da oferta). `consomeDeId` liga a turma que assiste à aula de outro curso.
- **Alteracao** (trocas do dia e realocações) e **Aviso** (mensagens de WhatsApp).
- **Usuario** (perfil ADMIN ou USUARIO; senha guardada só como hash) e **Sessao** (token do login, válido por 12 horas).
- **Atividade** (quem fez o quê, com os dados para desfazer) e **DiaSemAula** (feriados e recessos).

## Problemas comuns

| Mensagem | Solução |
|---|---|
| `'npm' não é reconhecido` | instale o Node.js e reabra o VS Code |
| `Cannot find module '.prisma/client'` | `npx prisma generate` |
| página vazia ou `no such table` | `npm run banco` |
| erro estranho depois de atualizar o código | pare o servidor (`Ctrl + C`), apague a pasta `.next` e rode `npm run dev` |
| `Port 3000 is already in use` | feche o outro terminal com o site ligado |
| `'python' não é reconhecido` | use `py seed.py --recriar --relatorio conferencia.xlsx` |
