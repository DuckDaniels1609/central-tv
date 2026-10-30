# Central TV

Arquivos da Central TV (app da TV Samsung do Daniel). A TV baixa `versao.json` e, quando a versão muda, os arquivos de `app/`.

- `app/corpo.html`: telas
- `app/style.css`, `app/app.js`, `app/data.js`: visual, lógica e dados
- `app/tvconfig.js`: configuração exportada do Editor da Central TV

Ficam só na TV, nunca aqui: músicas, fundos, link da agenda e chaves do SmartThings.
Para publicar uma mudança: altere os arquivos e aumente o `v` em `versao.json`.
