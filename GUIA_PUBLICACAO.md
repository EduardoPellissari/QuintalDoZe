# Publicar sistema (GitHub + Render)

## 1) Criar repositório no GitHub
1. Entre no GitHub e crie um repositório novo (pode ser público).
2. Não marque para criar README inicial.

## 2) Subir este projeto para o GitHub
Na pasta do projeto, rode:

```bash
git init
git add .
git commit -m "Primeira versão do sistema de pedidos"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## 3) Deploy no Render
1. Entre em https://dashboard.render.com/
2. Clique em **New** -> **Blueprint** (ou **Web Service**).
3. Conecte sua conta GitHub e escolha o repositório.
4. Se usar Blueprint, o arquivo `render.yaml` já configura build/start automaticamente.
5. Clique em **Deploy**.

## 4) Link público
Após o deploy, o Render gera uma URL `https://...onrender.com`.

## Observações importantes
- Este projeto grava dados em `data/db.json`.
- Em plano free, o serviço pode dormir quando ficar sem acesso por alguns minutos.
- Se quiser manter dados em produção sem perda, depois vale migrar para um banco externo.
