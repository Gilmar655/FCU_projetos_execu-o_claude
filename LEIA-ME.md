# Publicar o painel FCU no GitHub Pages

Arquivos que importam (envie para a RAIZ do repositório, sem pastas):

- `index.html`  – o painel completo (visual, gráficos, mapa, logomarca, fontes e bibliotecas já estão dentro dele)
- `data.js`     – os dados da FCU (único arquivo que muda a cada atualização)
- `.nojekyll`   – opcional

## Passo a passo
1. Extraia o ZIP.
2. No repositório, clique em **Add file › Upload files** e arraste `index.html`, `data.js` (e `.nojekyll`, se aparecer).
3. Em "Commit changes", confirme na branch `main` (arquivos de mesmo nome são substituídos).
4. Aguarde 1 a 2 minutos e abra o endereço do site com **Ctrl+F5**.

Pastas antigas de envios anteriores (`css`, `js`, `lib`, `fonts`) deixam de ser usadas e podem ser apagadas.

## Logomarca
A logomarca da Enel Brasil já vem embutida. Para usar uma imagem melhor, envie um arquivo `logo.png` (fundo branco ou transparente, cerca de 400 px de largura) para a mesma pasta: o painel passa a usá-la sozinho.

## Se algo der errado
O painel mostra uma caixa com a mensagem do erro em vez de ficar em branco. "Arquivo data.js não encontrado" significa que o `data.js` não está na mesma pasta do `index.html`.

## Atualizar os dados
1. **Importar** › carregue a nova exportação da FCU (.xlsx ou .csv).
2. **Exportar › Base para publicar (data.js)** e substitua apenas o `data.js` no repositório.

## Link da visão
O botão **Copiar link da visão** gera um endereço que reabre o painel na mesma aba e com os mesmos filtros.
