# Importação de cursos novos no SAGA

## O que mudou

Na tela **Importar Planilha**, o SAGA agora identifica automaticamente os cursos presentes na planilha de oferta. Cursos novos deixam de ser ignorados e aparecem na prévia com uma sigla sugerida. A confirmação **2. Importar** cria os cursos, professores, disciplinas, grupos e aulas na **mesma transação**. **1. Conferir Arquivo** não grava nenhum dado.

A equivalência de nomes usa normalização de maiúsculas/acentos/pontuação e aliases exatos para nomes abreviados previamente usados no SAGA, como `ENG. COMPUTAÇÃO` e `ENGENHARIA DE COMPUTAÇÃO`. Cursos não cadastrados como `Direito`, `Medicina` e `Psicologia` podem ser importados sem modificar o código.

Se a sigla sugerida coincidir com outra sigla, o SAGA adiciona um número (por exemplo, `DIR2`). Se houver dois cursos equivalentes já cadastrados, a importação é bloqueada para uma correção manual, evitando associar aulas ao cadastro errado.

## Como testar, sem afetar o site oficial

1. Feche o servidor local com `Ctrl+C` no terminal do VS Code.
2. Extraia **SAGA-WhatsApp-importador-atualizado.zip** para uma pasta nova. Abra a subpasta `saga-main` no VS Code.
3. Copie **somente seu `.env` local** da instalação anterior para a nova pasta `saga-main`. **Não envie nem publique esse arquivo**. Confira que `DATABASE_URL` e `DIRECT_URL` apontam para seu banco Neon de **testes**, e `WHATSAPP_MODE="SIMULACAO"`.
4. Execute `npm install` e `npm run dev`. **Não é necessário `prisma db push` por causa desta alteração**, pois não mudamos o schema.
5. Acesse `http://localhost:3000` e abra **Importar Planilha**.
6. Escolha `dados-fonte/OFERTA_2026_2.xlsx` e o semestre `2026.2`; clique em **1. Conferir Arquivo**.
7. A prévia deve apresentar **Cursos novos encontrados**, cada nome e sigla sugerida, além de disciplinas, professores, laboratórios, turmas, alertas e possíveis choques.
8. Confira os nomes e sinais de conflito. Somente então clique em **2. Importar**. Isso salvará o resultado no banco de testes.
9. Volte ao **Status do Bot** e confira se há disciplinas no campo de seleção. O envio permanece em simulação.

**Importante:** Esta alteração não importa uma planilha de cursos arbitrária: ela lê o formato `.xlsx` da **oferta** já suportado pelo SAGA, com colunas `CURSO`, `DISCIPLINA`, `PERIODO`, horários, dias etc. Outros layouts poderão exigir um mapeamento de colunas adicional.

## Testes locais

```bash
npm install
npm test
```

Testes de unidade foram adicionados em `tests/cursos-importacao.test.ts`, para a criação de cursos arbitrários, aliases, colisões de sigla e distinção de cursos parecidos.

## Arquivos alterados

- `lib/cursos-importacao.ts`: novo planejador de cursos e sugestão de siglas.
- `app/importacao.ts`: usa os cursos planejados sem descartar linhas e cria os novos registros na transação.
- `components/telas/TelaImportar.tsx`: prévia visual dos novos cursos e siglas.
- `lib/tipos.ts`: novo campo `cursosNovos`.
- `tests/cursos-importacao.test.ts`: testes de unidade.
