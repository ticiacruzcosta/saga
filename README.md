# SAGA — Sistema de Avisos e Gestão Acadêmica

Projeto de Extensão IV · Faculdade Unisapiens

Sistema web para a coordenação **montar a oferta de disciplinas do semestre sem choques** de horário,
professor, laboratório ou turma, acompanhar as aulas do dia e gerar avisos para os grupos de WhatsApp.

## Funcionalidades

| Tela | O que faz |
|---|---|
| **Dashboard** | Aulas do dia, com calendário (clique na data) que pode colorir os dias pela ocupação das salas. O lápis registra troca de sala ou professor só daquele dia; *Aviso* gera a mensagem de WhatsApp. |
| **Grade do Semestre** | Oferta completa com filtros e conflitos. **Realocar** sugere outro dia/horário/sala livre para uma aula; **Resolver Conflitos** sugere uma mudança para cada conflito. Seletor de semestre, **Gerar próximo semestre** e **Publicar**. |
| **Horário da Semana** | Quadro de segunda a sábado, com linhas por turma, professor ou sala. Pode ser impresso. |
| **Importar Planilha** | Lê o `.xlsx` da oferta, mostra o que vai mudar (turmas, cadastros novos, choques) e só grava quando confirmado. |
| **Histórico de Avisos** | Mensagens geradas e seu status. |
| **Cadastros** | Cursos & Turmas, Professores, Salas & Laboratórios e Ofertas & Disciplinas: cadastrar, editar e excluir. |

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

Acesse **http://localhost:3000**.

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
| `npx prisma db push` | aplica mudanças feitas em `prisma/schema.prisma` |

### Usar na rede da faculdade

Num computador da coordenação:

```
npm run build
npm start -- -H 0.0.0.0
```

Os demais acessam por `http://IP-DO-COMPUTADOR:3000` (IP em `ipconfig`). Para publicar na internet seria preciso
trocar o SQLite por um banco online (ex.: PostgreSQL) e, antes de tudo, criar login.

## Estrutura

```
app/
  page.tsx          carrega os dados e entrega para a tela
  actions.ts        nova oferta, edição, exclusão, cadastros e dashboard
  importacao.ts     importação da planilha
  realocacao.ts     realocar / resolver conflitos
  ofertas.ts        semestres: escolher, gerar, publicar
components/
  SagaApp.tsx       a interface (todas as telas)
  CalendarioDia.tsx calendário do dashboard
lib/
  validacao-choque.ts  regras de conflito
  realocacao.ts        busca de horário/sala livre
  gerar-oferta.ts      montagem do próximo semestre
  planilha-oferta.ts   leitura do .xlsx
  dados.ts, vm.ts      leitura do banco e preparo dos dados da tela
prisma/schema.prisma   modelo do banco
dados-fonte/           planilhas originais
docs/                  documentação, ata da reunião, protótipo e perguntas em aberto
seed.py                carga inicial do banco
```

### Modelo de dados

- **Curso**, **Disciplina** (regras: formato, tipo de sala, sala fixa, rodízio, duração, teto de alunos) e **MatrizItem** (curso × período × disciplina).
- **Professor**, **Ambiente** (salas e laboratórios) e **GrupoAlunos** (turma de alunos, ex.: SIST. DE INFORM. 4º A).
- **Oferta** (semestre: rascunho, publicada ou arquivada) e **Turma** (uma aula da oferta). `consomeDeId` liga a turma que assiste à aula de outro curso.
- **Alteracao** (trocas do dia e realocações) e **Aviso** (mensagens de WhatsApp).

## Limitações conhecidas

- **Sem login**: qualquer pessoa com acesso ao endereço pode alterar dados. Use apenas na rede interna até existir autenticação.
- **Bot de WhatsApp não implementado**: os avisos ficam como *Pendente* no histórico.
- **Cursos sem matriz** (Eng. Civil, Elétrica, Eng. Software, Big Data, Jogos Digitais): não entram no gerador de semestre; dependem da planilha.
- **Quantidade de alunos por turma** não preenchida: o sistema ainda não confere lotação nem sugere divisão em turmas A/B.

As perguntas em aberto para a coordenação estão em [docs/perguntas-e-proximos-passos.md](docs/perguntas-e-proximos-passos.md).

## Problemas comuns

| Mensagem | Solução |
|---|---|
| `'npm' não é reconhecido` | instale o Node.js e reabra o VS Code |
| `Cannot find module '.prisma/client'` | `npx prisma generate` |
| página vazia ou `no such table` | `npm run banco` |
| erro estranho depois de atualizar o código | pare o servidor (`Ctrl + C`), apague a pasta `.next` e rode `npm run dev` |
| `Port 3000 is already in use` | feche o outro terminal com o site ligado |
| `'python' não é reconhecido` | use `py seed.py --recriar --relatorio conferencia.xlsx` |
