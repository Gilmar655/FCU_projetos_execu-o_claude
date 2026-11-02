# FCU · Projetos e execução (painel)

## Publicar no GitHub Pages (repositório Gilmar655/FCU_Projetos_Execu-o)
1. Abra o repositório no GitHub › **Add file › Upload files**.
2. Arraste TODO o conteúdo desta pasta (não o ZIP): `index.html`, `data.js`, `.nojekyll`, `LEIA-ME.md` e as pastas `css`, `js`, `lib`, `fonts`.
3. Em "Commit changes", confirme na branch `main` (arquivos de mesmo nome são substituídos).
4. Aguarde o GitHub Pages terminar e abra https://gilmar655.github.io/FCU_Projetos_Execu-o/ (Ctrl+F5 para limpar o cache).

Arquivos antigos da raiz (`app.js`, `styles.css`, `excel.js` etc.) deixam de ser usados e podem ser apagados depois.

## Mapa de ruas
- Publicado no GitHub (https), o fundo padrão é o **OpenStreetMap**.
- Aberto direto do computador (dois cliques no `index.html`), o OpenStreetMap devolve erro 403 por política dele; por isso o painel usa automaticamente o mapa de **ruas da Esri**.
- Se o fundo falhar por qualquer motivo, o painel troca sozinho para a Esri. No botão de camadas (canto do mapa) dá para escolher OpenStreetMap, Ruas (Esri) ou Satélite.
- Cada projeto abre no Google Maps, no Waze e em rota; no detalhe do projeto o Google Maps aparece embutido.
- **KML (Google Meu Maps):** baixa os projetos filtrados; em maps.google.com/mymaps use *Criar novo mapa › Importar*.

## Atualizar os dados
1. **Importar** › carregue a nova exportação da FCU (.xlsx ou .csv) e, se necessário, o cadastro de equipamentos.
2. **Exportar › Base para publicar (data.js)** e substitua o `data.js` no repositório.
