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
2. Clique em **New** -> **Blueprint**.
3. Conecte sua conta GitHub e escolha o repositório.
4. O arquivo `render.yaml` já configura automaticamente:
   - serviço web
   - banco Postgres
   - variável `DATABASE_URL` ligada ao banco
5. Clique em **Deploy**.
6. No menu do Blueprint, sempre que fizer mudanças no código, use **Manual sync**.

## 4) Link público
Após o deploy, o Render gera uma URL `https://...onrender.com`.

## Observações importantes
- Sem `DATABASE_URL`, o sistema usa arquivo local `data/db.json`.
- Com `DATABASE_URL` (Render Blueprint), os dados ficam no Postgres.
- Em plano free, o serviço pode dormir quando ficar sem acesso por alguns minutos.
- O banco Postgres free do Render expira após 30 dias, então para uso contínuo é recomendado plano pago.
