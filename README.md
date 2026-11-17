# SAGA — Sistema de Avisos e Gestão Acadêmica

> **Faculdade Unisapiens · Porto Velho/RO**  
> **Curso:** Engenharia da Computação · **Disciplina:** Projeto de Extensão IV  
> **Professor Orientador:** Prof. Allan Kardec Gurgel do Amaral  
> **Cliente Atendido:** Coordenação Acadêmica do Núcleo de Engenharia e Tecnologia (ENGETEC)

🌐 ** Produção (Vercel):** [https://saga-liard.vercel.app](https://saga-liard.vercel.app)

---

## 📌 Sobre o Projeto

O **SAGA (Sistema de Avisos e Gestão Acadêmica)** é uma plataforma web *full-stack* responsiva desenvolvida para substituir o controle manual de horários e salas em planilhas eletrônicas na **Faculdade Unisapiens**.

A solução automatiza a consolidação da matriz semestral de oferta de disciplinas, previne choques de horários docentes, evita a superlotação de salas e laboratórios, gerencia rodízios práticos (`1x1` e `2x2`), permite travar ambientes específicos (*Lock*) e integra o disparo de avisos em tempo real aos estudantes via **Bot do Telegram** e **WhatsApp**.

---

## 👥 Equipe de Desenvolvimento

| Integrante | RA | Atribuição Principal no Projeto |
| :--- | :---: | :--- |
| **Leticia Cruz Costa** | `901000679` | **Backend & Banco de Dados:** Modelagem relacional, rotas/Server Actions, regras de negócio no servidor e deploy na Vercel. |
| **Leticia Farias Ribeiro** | `54269` | **Lógica de Negócio & Validações:** Motor de Integridade (detecção de choques, capacidade física, rodízios e filtros dinâmicos). |
| **Vitor Pelicer Martins** | `54215` | **Frontend & UX/UI:** Arquitetura visual responsiva, Design System (Light/Dark Mode), modais, sidebar e tabelas operacionais. |
| **Victor Matheus F. de Salas** | `901001013` | **Integração de Mensageria & API:** Comunicação via Bot/Webhook, estruturação de avisos dinâmicos por turma e validação de disparos. |
| **João Pedro Secundo de Sena** | `54276` | **Documentação, QA & Custos:** Levantamento de requisitos com a coordenação, plano de testes, documentação técnica e orçamento. |

---

## ✨ Principais Módulos e Funcionalidades

| Módulo | Descrição Operacional |
| :--- | :--- |
| **1. Dashboard Operacional (Hoje)** | Painel diário com calendário de ocupação, filtros rápidos (turno, prédio e busca), edição pontual de aula no dia (troca de sala/docente com indicador *Livre/Ocupado* em tempo real ou cancelamento de aula), trava de sala (*Lock*) e geração automática de comunicados. |
| **2. Grade do Semestre** | Matriz consolidada da oferta semestral (`2026.2`) com filtros combinados (Curso, Dia da Semana, Docente e Tipo de Ambiente), contador dinâmico de conflitos, realocação inteligente de salas, geração do próximo semestre e exportação em `.xlsx` / impressão. |
| **3. Horário da Semana** | Quadro panorâmico de segunda a sábado com agrupamento dinâmico por **Turma**, **Professor** ou **Sala / Laboratório**, busca por texto livre e layout formatado para impressão. |
| **4. Importar Planilha (`.XLSX`)** | Leitura automatizada da planilha de oferta com etapa prévia de conferência (**1. Conferir Arquivo** → **2. Importar**), detectando automaticamente cursos novos, turmas, comunalidades e eventuais choques antes de gravar no banco. |
| **5. Histórico de Avisos & Status do Bot** | Central de comunicações que registra avisos gerados nas trocas/cancelamentos, permite editar o texto antes do envio, limpar pendências e disparar notificações diretamente para os alunos inscritos no Bot do Telegram. |
| **6. Cadastros Base** | Gestão completa (em visualização de **Blocos** ou **Lista**) de **Cursos e Turmas**, **Professores** (com dias de indisponibilidade), **Salas e Laboratórios** (com capacidade máxima e prédio) e **Ofertas e Disciplinas**. |
| **7. Gestão de Usuários** | Controle de acesso exclusivo para administradores: aprovação de novos cadastros, alternância de perfil (`ADMIN` / `USUARIO`), desativação de contas e geração de senhas provisórias. |

---

## 🛡️ Motor de Integridade e Regras de Negócio

O validador de integridade (`lib/validacao-choque.ts`) audita a oferta em tempo real segundo as regras levantadas com a coordenação do ENGETEC:

- **RN01 — Restrição de Choque Docente:** Bloqueia a alocação do mesmo professor em duas turmas ou salas distintas no mesmo dia e horário (respeitando casos legítimos de *comunalidade*, onde uma turma assiste à aula de outro curso).
- **RN02 — Indisponibilidade Docente:** Alerta/bloqueia quando o professor é alocado em um dia da semana registrado como indisponível em seu cadastro.
- **RN03 — Lotação vs. Capacidade Física:** Verifica se o número de alunos da turma ultrapassa a capacidade máxima cadastrada para a sala/laboratório ou o limite da disciplina.
- **RN04 — Adequação Tecnológica, Salas Fixas (*Lock*) e Rodízio:** Garante que disciplinas práticas sejam alocadas em laboratórios, respeita ambientes travados manualmente pelo coordenador e controla pares de disciplinas em rodízio semanal/quinzenal (`1x1` ou `2x2`).

---

## 🛠️ Arquitetura e Tecnologias Utilizadas

- **Linguagem & Runtime:** TypeScript · Node.js LTS
- **Framework Full-Stack:** Next.js 16 (App Router, Server Actions e API Routes) · React 19
- **Estilização & UI:** Tailwind CSS 4 · Font Awesome 6 · Tema Claro/Escuro integrado
- **Banco de Dados & ORM:** PostgreSQL (hospedado no **Neon**) · Prisma ORM 6 (compatível com SQLite local para desenvolvimento)
- **Processamento de Planilhas:** ExcelJS (`lib/planilha-oferta.ts`)
- **Autenticação & Segurança:** Hash de senhas com `scrypt` + sal aleatório, sessões `httpOnly` de 12h no banco e bloqueio temporário contra força bruta
- **Hospedagem & CI/CD:** Vercel (região `gru1` — São Paulo)

---

## 📂 Estrutura de Pastas do Projeto

```text
saga/
├── app/
│   ├── page.tsx                 # Ponto de entrada autenticado; carrega o ViewModel e renderiza o SAGA
│   ├── login/page.tsx           # Tela de autenticação e solicitação de acesso
│   ├── auth.ts                  # Server Actions de autenticação e administração de usuários
│   ├── actions.ts               # Server Actions operacionais (Dashboard, cadastros, avisos, Telegram)
│   ├── importacao.ts            # Pré-conferência e confirmação de importação de planilhas .xlsx
│   ├── realocacao.ts            # Otimização de salas e resolução automática de conflitos
│   ├── ofertas.ts               # Gestão de semestres (selecionar, gerar próximo e publicar)
│   └── api/                     # Rotas de exportação (.xlsx) e Webhooks dos bots (Telegram/WhatsApp)
├── components/
│   ├── SagaApp.tsx              # Layout principal, Sidebar, Dashboard, Grade e Cadastros Base
│   ├── TelaLogin.tsx            # Interface de login e criação de conta
│   ├── CalendarioDia.tsx        # Calendário interativo de ocupação diária
│   └── telas/                   # Módulos dedicados (TelaSemana, TelaImportar, TelaHistorico, TelaUsuarios, TelaBot)
├── lib/
│   ├── validacao-choque.ts      # Motor de Integridade (regras de choque, lotação e rodízio)
│   ├── realocacao.ts            # Algoritmo de sugestão e realocação automática de ambientes
│   ├── gerar-oferta.ts          # Progresso de períodos e geração automática do semestre seguinte
│   ├── planilha-oferta.ts       # Parser de planilhas de oferta (.xlsx) e detecção de cursos novos
│   ├── vm.ts & dados.ts         # Consulta ao Prisma e montagem do ViewModel para a interface
│   ├── auth.ts                  # Criptografia scrypt, cookies de sessão e guarda de rotas
│   └── telegram/ & whatsapp/    # Clientes de API, filas de disparo e comandos dos bots
├── prisma/
│   └── schema.prisma            # Modelagem relacional completa do banco de dados
└── tests/                       # Testes automatizados do motor de conflitos, planilha e geração
```

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js LTS** (v20 ou superior)
- **Git**

### Passo a passo

1. **Clone o repositório e instale as dependências:**
   ```bash
   git clone https://github.com/ticiacruzcosta/saga.git
   cd saga
   npm install
   ```

2. **Configure as variáveis de ambiente:**
   Crie um arquivo `.env` na raiz do projeto (baseado no `.env.example`) com a string de conexão do banco (`DATABASE_URL` e `DIRECT_URL`) e, opcionalmente, o token do Bot do Telegram (`TELEGRAM_BOT_TOKEN`).

3. **Gere o cliente Prisma e inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

4. **Acesse no navegador:**
   Abra [http://localhost:3000](http://localhost:3000).

### Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor local de desenvolvimento em `http://localhost:3000` |
| `npm test` | Executa a suíte de testes automatizados (regras de choque, realocação, planilha e datas) |
| `npm run build` | Compila a aplicação para produção (mesmo processo executado pela Vercel) |
| `npm run banco:studio` | Abre o **Prisma Studio** para visualizar e editar registros do banco pelo navegador |
| `npm run banco:tabelas` | Sincroniza alterações do `prisma/schema.prisma` com o banco configurado |

---

## 🔮 Evoluções Previstas (Roadmap)

1. **Integração via Webhooks com o ERP da Unisapiens:** Sincronização automática de matrículas e disciplinas ofertadas sem necessidade de upload manual de planilhas `.xlsx`.
2. **Mapeamento de Acessibilidade Física (Salas PCD):** Inclusão de critérios de acessibilidade (andar térreo / blocos com elevador) no Motor de Integridade para turmas com estudantes com mobilidade reduzida.
3. **Importação Automática de Feriados (BrasilAPI):** Bloqueio automático de feriados nacionais, estaduais (RO) e municipais (Porto Velho) no calendário operacional do Dashboard.
