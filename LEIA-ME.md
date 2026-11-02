# Publicar o painel FCU no GitHub Pages

Este pacote tem apenas 2 arquivos que importam:

- `index.html`  – o painel completo (visual, gráficos, mapa, fontes e bibliotecas já estão dentro dele)
- `data.js`     – os dados da FCU (é o único arquivo que muda a cada atualização)

## Passo a passo
1. Extraia o ZIP.
2. No repositório (FCU_projetos_execu-o_claude), clique em **Add file › Upload files**.
3. Arraste **somente** `index.html`, `data.js` e (se aparecer) `.nojekyll` para a raiz do repositório. Não envie pastas.
4. Em "Commit changes", confirme na branch `main`. Se já existirem arquivos com esses nomes, eles são substituídos.
5. Aguarde 1 a 2 minutos (aba Actions mostra o andamento) e abra https://gilmar655.github.io/FCU_projetos_execu-o_claude/
6. Atualize com **Ctrl+F5** para ignorar o cache do navegador.

Pastas antigas do envio anterior (`css`, `js`, `lib`, `fonts`) deixam de ser usadas e podem ser apagadas.

## Se algo der errado
O painel mostra uma caixa com a mensagem do erro em vez de ficar em branco. Os dois erros mais comuns:
- "Arquivo data.js não encontrado": o `data.js` não está na mesma pasta do `index.html` ou foi renomeado.
- A página abre o repositório em vez do painel: confira em Settings › Pages se a publicação usa a branch `main` e a pasta `/ (root)`.

## Mapa de ruas
Publicado no GitHub, o fundo é o OpenStreetMap. Aberto direto do computador, usa o mapa de ruas da Esri (o OpenStreetMap bloqueia esse acesso). Se o fundo falhar, o painel troca sozinho. Há também o botão de camadas no mapa.

## Atualizar os dados
1. **Importar** › carregue a nova exportação da FCU (.xlsx ou .csv).
2. **Exportar › Base para publicar (data.js)** e substitua apenas o `data.js` no repositório.
