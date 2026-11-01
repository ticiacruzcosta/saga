# SAGA: perguntas para a coordenação e próximos passos

A coluna "Se não houver resposta" diz o que o sistema faz hoje ou o que será feito por padrão.

## 1. Planilha de oferta e importação

| # | Pergunta | Por que importa | Se não houver resposta |
|---|---|---|---|
| 1 | A planilha de cada semestre vai seguir o mesmo modelo (aba "Página1", mesmos nomes de coluna)? | O sistema acha as colunas pelo nome. Se a ordem mudar, tudo bem; se o **nome** mudar, a importação avisa e não grava. | Mantemos o modelo da 2026.2. |
| 2 | Ao reimportar um semestre em uso, podemos apagar as alterações já registradas (trocas do dia e realocações)? | *Substituir* troca as aulas pelas da planilha. A tela avisa antes. | Avisar e deixar a coordenação decidir (como está hoje). |
| 3 | Depois de realocar aulas pelo sistema, a planilha continua sendo a "fonte oficial"? | Reimportar com *Substituir* desfaz as realocações feitas na tela. | Avisar antes de substituir; no futuro, exportar a grade para Excel (item 20). |
| 4 | As linhas 53, 54, 56 e 125 (Fundamentos da Eng. e Arquitetura, Desenho Técnico, Química Geral, Optativa III - Meio Ambiente) não têm dia marcado. Ainda não têm horário ou faltou marcar? | Sem dia, essas aulas não entram na verificação de choque. | Importa sem dia e mostra a linha na lista "para conferir". |
| 5 | A coluna **TOTAL DE VAGAS** vai vir preenchida? | Está vazia na 2026.2. Sem ela, as regras de capacidade de laboratório e de teto de alunos não funcionam. | O sistema já lê a coluna; passa a conferir quando vier preenchida. |
| 6 | A planilha de ESTRUTURA (matriz, regras das disciplinas, salas) precisa ser importada pela tela também? | Hoje ela só entra pelo comando `npm run banco`. | Fica pelo comando, porque muda pouco. |
| 7 | Quando teremos as matrizes de Eng. Civil, Elétrica, Eng. Software, Big Data e Jogos Digitais? | 27 disciplinas estão sem código e esses cursos não entram no gerador de semestre. | Continuam pela planilha. |

## 2. Pendências da oferta 2026.2

| # | Pergunta | Se não houver resposta |
|---|---|---|
| 8 | LAB02 tem 35 ou 50 máquinas? A planilha tem `LAB02-50` em 7 linhas. | Usamos 35 (informado pela coordenação). |
| 9 | Qual a capacidade do LAB03? | Fica sem capacidade e o sistema só mostra um alerta amarelo. |
| 10 | O Projeto de Extensão IV do 8º de Sistemas deve durar 1 h (como as outras extensões) ou 2h45, como está na planilha? | Gera choque com o professor na terça. Se for 1 h, basta corrigir o horário na edição da aula. |
| 11 | LAB05 na sexta às 19h tinha Inteligência Artificial e Introdução a Redes 4º B. A mudança de uma delas para outro laboratório está confirmada? | Vale o que estiver no sistema. |
| 12 | Aulas híbridas do mesmo professor no mesmo horário (Cálculo e Matemática Computacional) alternam semanas? | Ficam como "Confirmar" (amarelo), sem bloquear. |

## 3. Próximo semestre (gerador)

| # | Pergunta | Por que importa | Se não houver resposta |
|---|---|---|---|
| 13 | Em 2027.1 abre turma nova de 1º período? Em quais cursos e quantas (A, B)? | O gerador só abre 1º período se a opção for marcada, e sempre uma turma A por curso com matriz. | Sem turma nova; a coordenação inclui depois. |
| 14 | Quantos alunos tem cada turma? | Sem isso o sistema não confere lotação nem sugere divisão em A/B. | Preencher em Cursos & Turmas. |
| 15 | Quem pode assumir as disciplinas que ninguém deu ainda? | No teste do 2027.1, 32 aulas ficaram com professor "A definir". | A coordenação define no rascunho antes de publicar. |
| 16 | Eng. Computação 9º período tem 6 aulas presenciais para 5 noites. Alguma vai para sábado, EAD ou divide noite? | É a única aula que o gerador não encaixou no 2027.1. | Fica sem dia para a coordenação decidir. |
| 17 | Algum professor tem dia em que não pode dar aula? | O gerador e a realocação já respeitam isso, mas nenhum dia está cadastrado. | Cadastrar nos professores. |

## 4. Funcionamento do sistema

| # | Pergunta | Por que importa | Sugestão |
|---|---|---|---|
| 18 | O sistema vai rodar num computador da coordenação ou na internet? | Na internet é preciso trocar o SQLite por um banco online (PostgreSQL). | Começar no computador da coordenação. |
| 19 | Quantas pessoas vão usar e com que permissão (ver / editar / importar)? | Define o login. Hoje não há login: qualquer pessoa com acesso pode alterar dados. | Dois perfis: coordenação (tudo) e consulta (só ver). |
| 20 | O aviso de WhatsApp sai automático ou alguém aprova antes? Qual número envia? | O bot ainda não foi feito; os avisos ficam "Pendente". | Aprovação manual no começo. |
| 21 | Quem guarda o backup do banco e com que frequência? | O banco é um arquivo só (`prisma/dev.db`). | Copiar o `dev.db` toda semana e antes de cada importação. |

## 5. Melhorias técnicas sugeridas

| # | Melhoria | Ganho | Esforço |
|---|---|---|---|
| 22 | Repositório Git privado | Histórico de cada mudança e volta fácil se algo quebrar. | Baixo |
| 23 | Login para a coordenação | Pré-requisito para abrir o sistema fora da sala da coordenação. | Médio |
| 24 | Exportar a grade para Excel no modelo da planilha | A coordenação continua com a planilha de sempre, já sem choques. | Médio |
| 25 | Registrar quem importou, editou ou excluiu, e quando | Auditoria das mudanças na oferta. | Baixo |
| 26 | `seed.py` criar as tabelas pelo Prisma e usar as regras de choque do TypeScript | Evita o banco e o relatório divergirem do sistema. | Baixo |
| 27 | Testes automáticos (conferência "127 de 127", regras de choque, gerador) | Garante que uma mudança não quebre o que já funciona. | Baixo |
