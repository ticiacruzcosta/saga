<div align="center">

# SAGA — Sistema de Avisos e Gestão Acadêmica
### Projeto de Extensão IV · Centro Universitário Unisapiens

Sistema web desenvolvido para a coordenação acadêmica gerenciar a oferta de disciplinas sem choques de horário, alocação de professores ou laboratórios, além de acompanhar o andamento das aulas e gerar avisos automatizados para os grupos de WhatsApp das turmas.

**Acesse a aplicação em produção:** [saga-liard.vercel.app](https://saga-liard.vercel.app)

</div>

---

## 📋 Sumário
1. [Visão Geral e Perfis de Acesso](#1-visão-geral-e-perfis-de-acesso)
2. [O que o Sistema Faz](#2-o-que-o-sistema-faz)
3. [Regras de Conflito e Ciclo do Semestre](#3-regras-de-conflito-e-ciclo-do-semestre)
4. [Rodando no seu Computador (Desenvolvimento)](#4-rodando-no-seu-computador-desenvolvimento)
5. [Deploy e Infraestrutura](#5-deploy-e-infraestrutura)
6. [Organização do Código](#6-organização-do-código)
7. [Problemas Comuns e Soluções](#7-problemas-comuns-e-soluções)

---

## 1. Visão Geral e Perfis de Acesso

* **Primeiro Acesso:** Acesse o link do sistema, clique em **Criar nova conta**, preencha nome, e-mail e senha (mínimo de 8 caracteres). A conta ficará aguardando aprovação por um administrador (`Sistema → Usuários`).

| Perfil | Permissões |
| :--- | :--- |
| **Usuário** | Utiliza todas as telas operacionais do sistema. |
| **Administrador** | Acesso total: aprova, desativa e exclui contas, redefine senhas, gerencia permissões e realiza auditorias. |

> **Segurança:** Senhas armazenadas com hash seguro (`scrypt`), sessões com duração de 12 horas e mecanismo de bloqueio temporário de 5 minutos após 5 tentativas incorretas consecutivas.

---

## 2. O que o Sistema Faz

* **Dashboard:** Visualização das aulas do dia. Permite consultar o calendário de ocupação de salas, realizar ajustes pontuais por dia (troca rápida de sala/professor) e gerar mensagens prontas para os grupos de WhatsApp.
* **Grade do Semestre:** Oferta completa com filtros avançados e gestão de conflitos. Conta com sugestões automáticas de realocação, publicação de semestres e exportação para Excel (`.xlsx`) ou PDF.
* **Horário da Semana:** Quadro dinâmico de segunda a sábado (filtrado por turma, professor ou sala), pronto para impressão.
* **Importação de Planilhas:** Leitura de arquivos `.xlsx` de oferta com prévia de alterações (novas aulas, cadastros e choques) antes da gravação definitiva.
* **Histórico de Avisos:** Registro de mensagens geradas com controle de status de envio para o WhatsApp.
* **Cadastros Base:** Gestão completa (CRUD) de Cursos, Turmas, Professores (incluindo restrições de dias indisponíveis), Ambientes (salas e laboratórios), Ofertas e Disciplinas.

---

## 3. Regras de Conflito e Ciclo do Semestre

### Validações Automáticas
* ❌ **Bloqueiam:** Professor em horário duplicado; Professor em dia indisponível; Sala/laboratório ocupado no mesmo horário; Turma com aulas concorrentes; Vagas excedendo a capacidade do laboratório ou teto da disciplina; Disciplina alocada em sala fixa divergente.
* ⚠️ **Alertam:** Disciplinas em rodízio no mesmo laboratório; Aulas híbridas concomitantes; Laboratórios sem capacidade cadastrada ou professor inédito na disciplina.
* ℹ️ **Neutras:** Aulas assíncronas (EAD) e comunalidade (turmas assistindo aulas conjuntas de outro curso).

### Ciclo Semestral
1. **Importação ou Geração:** Importação via planilha ou avanço automático pelo gerador de semestre (ex.: `2026.2 → 2027.1`).
2. **Revisão:** Análise do rascunho na Grade, resolução de conflitos e alocação de pendências.
3. **Publicação:** O semestre torna-se oficial e o anterior é arquivado de forma segura.

---

## 4. Rodando no seu Computador (Desenvolvimento)

Para executar o projeto localmente, certifique-se de ter instalado o **Node.js LTS** (`nodejs.org`) e o **Git**.

```bash
# Clone o repositório
git clone [https://github.com/ticiacruzcosta/saga.git](https://github.com/ticiacruzcosta/saga.git)
cd saga

# Instale as dependências
npm install
