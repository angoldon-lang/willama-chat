# Willama-chat

Willama-chat è la nostra versione di chat AI self-hosted, basata su
[LibreChat](https://github.com/LibreChat-AI/LibreChat) (licenza MIT, commit upstream `a378657`, v0.8.9-rc1).

## Avvio rapido (Docker)

```bash
cp .env.example .env      # APP_TITLE è già impostato su "Willama-chat"
docker compose up -d      # http://localhost:3080
```

Sviluppo locale: `npm ci && npm run backend:dev` e `npm run frontend:dev`.
Configurazione modelli/endpoint: `librechat.example.yaml` → `librechat.yaml`.

## Personalizzazioni rispetto a LibreChat

- Titolo applicazione: `APP_TITLE=Willama-chat` (`.env.example`)
- Nome container Docker: `Willama-chat`
- Prossimi passi: logo/asset in `client/public/assets`, tema, lingue (it), endpoint predefiniti.

## Attribuzione

Questo progetto è un fork di LibreChat. La licenza MIT originale è conservata in `LICENSE`;
la documentazione upstream è in `README.librechat.md`. Per sincronizzare con upstream:

```bash
git remote add upstream https://github.com/LibreChat-AI/LibreChat.git
git fetch upstream && git merge upstream/main
```
