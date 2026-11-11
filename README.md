# SAGA — Sistema de Avisos e Gestão Acadêmica

Projeto de Extensão IV · Centro Universitário Unisapiens

Sistema web para a coordenação **montar a oferta de disciplinas do semestre sem choques** de horário, professor,
laboratório ou turma, acompanhar as aulas do dia e preparar os avisos para os grupos de WhatsApp das turmas. Inclui também um módulo experimental de disparos pela API oficial do WhatsApp com consentimento explícito.

**Acesse:** https://saga-liard.vercel.app

---

## Sumário

1. [Como acessar](#1-como-acessar)
2. [O que o sistema faz](#2-o-que-o-sistema-faz)
3. [Rodar no seu computador](#3-rodar-no-seu-computador)
4. [Como o site é publicado](#4-como-o-site-é-publicado)
5. [Organização do código](#5-organização-do-código)
6. [Problemas comuns](#6-problemas-comuns)

---

## 1. Como acessar

1. Abra **https://saga-liard.vercel.app** e clique em **Criar nova conta**.
2. Preencha nome, e-mail e senha (mínimo de 8 caracteres).
3. A conta fica **aguardando aprovação**. Um administrador libera em *Sistema → Usuários*. Depois disso, é só entrar.

Perfis:

| Perfil | Pode |
|---|---|
| **Usuário** | usar todas as telas do sistema |
| **Administrador** | o mesmo, e ainda aprovar, desativar e excluir contas, redefinir senhas e tornar alguém administrador |

Segurança: senhas guardadas só como hash (scrypt), sessão de 12 horas e bloqueio de 5 minutos após 5 senhas erradas seguidas.
Cada pessoa troca a própria senha no ícone de chave, no rodapé do menu.

---

## 2. O que o sistema faz

| Tela | O que faz |
|---|---|
| **Dashboard** | Aulas do dia. Clicando na data abre um calendário, que pode colorir os dias pela ocupação das salas. O lápis troca a sala ou o professor **só daquele dia**; *Aviso* gera a mensagem para o grupo da turma. |
| **Grade do Semestre** | Oferta completa, com filtros e conflitos. **Realocar** sugere outro dia/horário/sala livre; **Resolver Conflitos** sugere uma mudança para cada conflito. Também: escolher o semestre, **gerar o próximo**, **publicar** e exportar para **Excel** ou **PDF**. |
| **Horário da Semana** | Quadro de segunda a sábado, com linhas por turma, professor ou sala. Pode ser impresso. |
| **Importar Planilha** | Lê o `.xlsx` da oferta, detecta **cursos novos automaticamente** (com nomes e siglas na prévia), mostra aulas, cadastros e choques, e só grava após a confirmação. Veja `docs/IMPORTACAO_CURSOS_AUTOMATICA.md`. |
| **Histórico de Avisos** | Mensagens geradas. Avisos ainda não enfileirados podem ser enviados manualmente; os colocados na fila são gerenciados pelo bot. |
| **Status do Bot** | Acesso ao painel de integração com a Meta: inscrições voluntárias, alterações/cancelamentos, filas com aprovação e imagens PNG dos horários. |
| **Cadastros** | Cursos e Turmas, Professores (com os dias em que não podem dar aula), Salas e Laboratórios, Ofertas e Disciplinas: cadastrar, editar e excluir. |
| **Usuários** | Só administradores: contas de acesso. |

Outros detalhes: tema escuro (lua/sol no topo), atalho **/** para a busca e aviso ao fechar uma janela com alterações não salvas.

### Regras de conflito

| Regra | Resultado |
|---|---|
| Professor em duas aulas no mesmo horário | bloqueia |
| Professor num dia em que não pode dar aula | bloqueia |
| Sala/laboratório ocupado no mesmo horário | bloqueia |
| Mesma turma com duas aulas no mesmo horário | bloqueia |
| Vagas acima da capacidade do laboratório ou do teto da disciplina | bloqueia |
| Disciplina com sala fixa em outra sala | bloqueia |
| Disciplinas em rodízio no mesmo laboratório | alerta |
| Aula híbrida que coincide com outra (pode alternar semanas) | alerta |
| Laboratório sem capacidade cadastrada / professor que nunca deu a disciplina | alerta |
| Aula assíncrona (EAD) | não gera choque |
| Comunalidade (turma que assiste à aula de outro curso) | não conta como choque duplo |

### Ciclo do semestre

1. **Importar** a planilha de oferta, ou **gerar** o próximo semestre a partir do atual (2026.2 → 2027.1 → 2027.2…).
   O gerador avança os períodos, puxa as disciplinas da matriz, escolhe professores e encaixa os horários sem choque.
2. **Revisar** o rascunho na Grade: resolver conflitos e definir o que ficou "A definir".
3. **Publicar**: o semestre passa a valer para todos e o anterior é arquivado.

Semestre publicado nunca é sobrescrito pelo gerador. Reimportar a planilha com *Substituir* desfaz as realocações feitas na tela.

---

## 3. Rodar no seu computador

Para quem vai mexer no código. Precisa de **Node.js LTS** (nodejs.org) e **Git**.

```
git clone https://github.com/ticiacruzcosta/saga.git
cd saga
npm install
```

Crie o arquivo **`.env`** a partir do **`.env.example`** e preencha com os endereços do banco.
**Peça esses endereços para a Letícia em conversa particular**: eles têm a senha do banco e nunca devem ir para o GitHub
nem para o grupo.

```
npm run dev
```

Abra **http://localhost:3000** e entre com a sua conta do site.

> ⚠️ **O seu computador usa o mesmo banco do site no ar.** O que você cadastrar, editar ou excluir testando aparece para
> todo mundo. Para testar à vontade, crie um *branch* no Neon (uma cópia do banco) e use o endereço dele no seu `.env`.

| Comando | Para quê |
|---|---|
| `npm run dev` | sistema no modo de desenvolvimento (atualiza sozinho ao salvar) |
| `npm test` | testes automáticos: regras de choque, gerador, realocação, leitura da planilha, datas |
| `npm run build` | confere se o projeto monta para produção (o mesmo que a Vercel faz) |
| `npm run banco:studio` | abre o banco numa tela visual (Prisma Studio) |
| `npm run banco:tabelas` | aplica no banco as mudanças feitas em `prisma/schema.prisma` |

---

## 4. Como o site é publicado

| Parte | Onde fica |
|---|---|
| Código | GitHub: `ticiacruzcosta/saga` |
| Site | **Vercel** (plano Hobby), funções em São Paulo (`gru1`, ver `vercel.json`) |
| Banco | **Neon** (PostgreSQL, plano Free), região São Paulo |

- **Atualizar o site:** cada `git push` na branch `main` faz a Vercel montar e publicar a versão nova sozinha (cerca de 1 minuto).
  Se a montagem falhar, a versão anterior continua no ar. O andamento aparece em *Deployments*, no painel da Vercel.
- **Endereço do banco:** fica nas variáveis `DATABASE_URL` (conexão com *pool*, usada pelo site) e `DIRECT_URL` (conexão direta,
  usada para criar e alterar tabelas): no `.env` de cada computador e em *Settings → Environment Variables*, na Vercel.
- **Primeiro acesso do dia mais lento:** no plano gratuito, o Neon desliga quando ninguém usa e leva alguns segundos para ligar de novo.
- **Backup:** o Neon guarda o histórico das alterações. Em *Backup & Restore*, no painel, dá para voltar o banco a um momento anterior.
- **Auditoria:** quem cadastrou, editou, excluiu, importou ou publicou fica registrado na tabela `atividades` (visível em *Tables*, no Neon).

### Recriar o banco a partir das planilhas (avançado)

As planilhas originais ficam em `dados-fonte/`. O `seed.py` (Python 3 + `openpyxl`) monta um banco local `prisma/dev.db` a partir delas,
e o `migrar` copia esse banco para o Neon:

```
pip install openpyxl
npm run banco
npm run migrar -- --substituir
```

> ⚠️ O último comando **apaga todo o banco do site no ar** (contas, avisos, alterações) e por isso pede para digitar `APAGAR`.
> No dia a dia, use a tela **Importar Planilha**, que troca só a oferta.

---

## 5. Organização do código

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 (PostgreSQL) · ExcelJS.

```
app/
  page.tsx            exige login, carrega os dados e entrega para a tela
  login/page.tsx      tela de login
  auth.ts             entrar, criar conta, sair e administrar usuários
  actions.ts          nova oferta, edição, exclusão, cadastros, dashboard e avisos
  importacao.ts       importação da planilha
  realocacao.ts       realocar / resolver conflitos
  ofertas.ts          semestres: escolher, gerar e publicar
  api/exportar/       download da oferta em .xlsx
components/
  SagaApp.tsx         estrutura (menu, cabeçalho), Dashboard, Grade, cadastros e janelas
  telas/              uma tela por arquivo (Semana, Importar, Histórico, Usuários, Bot)
  avisos.tsx          avisos rápidos e confirmações no estilo do sistema
  CalendarioDia.tsx   calendário do Dashboard
  TelaLogin.tsx       formulário de login e de criação de conta
lib/
  validacao-choque.ts regras de conflito
  realocacao.ts       busca de horário/sala livre
  gerar-oferta.ts     montagem do próximo semestre
  planilha-oferta.ts  leitura do .xlsx
  auth.ts             senha, sessão e perfis
  atividade.ts        registro de atividades
  dados.ts, vm.ts     leitura do banco e preparo dos dados da tela
prisma/schema.prisma  modelo do banco
scripts/              migração do banco local para o Neon
tests/                testes automáticos
dados-fonte/          planilhas originais da oferta
docs/                 protótipo visual (HTML)
seed.py               carga inicial a partir das planilhas
```

O visual segue a identidade da instituição (azul `#1A2332` e laranja `#F39200`): as peças (botões, campos, cartões,
janelas, tabelas) ficam definidas em `app/globals.css`, que também tem o tema escuro.

### Modelo de dados

- **Curso**, **Disciplina** (formato, tipo de sala, sala fixa, rodízio, duração, teto de alunos) e **MatrizItem** (curso × período × disciplina).
- **Professor**, **Ambiente** (salas e laboratórios) e **GrupoAlunos** (turma de alunos, ex.: SIST. DE INFORM. 4º A).
- **Oferta** (semestre: rascunho, publicada ou arquivada) e **Turma** (uma aula da oferta). `consomeDeId` liga a turma que assiste à aula de outro curso.
- **Alteracao** (trocas do dia e realocações) e **Aviso** (mensagens de WhatsApp).
- **Usuario** (perfil ADMIN ou USUARIO), **Sessao** (login) e **Atividade** (auditoria).

---

## 6. Problemas comuns

| Mensagem | Solução |
|---|---|
| `'npm' não é reconhecido` | instale o Node.js e reabra o VS Code |
| `Environment variable not found: DATABASE_URL` | falta o arquivo `.env` (veja a seção 3) |
| `Cannot find module '.prisma/client'` | `npx prisma generate` |
| `EPERM: operation not permitted` ao gerar o Prisma | feche o `npm run dev` (ele trava o arquivo) e rode de novo |
| erro estranho depois de atualizar o código | pare o servidor (`Ctrl + C`), apague a pasta `.next` e rode `npm run dev` |
| `Port 3000 is already in use` | feche o outro terminal com o site ligado |
| site demora no primeiro acesso do dia | normal: o banco do Neon estava "dormindo" (veja a seção 4) |


---

## Integração WhatsApp — MVP (2026)

O pacote inclui a integração **no próprio SAGA** (não é um segundo site), em modo de simulação por padrão. Acesse **Status do Bot → Abrir administração do bot** como `ADMIN`, ou entre em `/bot-whatsapp`.

Leia **[docs/WHATSAPP_INTEGRACAO.md](docs/WHATSAPP_INTEGRACAO.md)** para instalar com um banco Neon de desenvolvimento, configurar webhook/Cloud API, testar, consultar a imagem de horários e conhecer as limitações. **Nunca use `prisma db push` apontando para produção sem revisão, backup e migração adequada.**
