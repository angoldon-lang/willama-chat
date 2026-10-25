# Willama-chat — Guida all'installazione

Versione documentata: **2026.10.1**

## 1. Requisiti

| Componente | Note |
|---|---|
| Docker + Docker Compose v2 | Metodo consigliato (include MongoDB, Meilisearch, RAG) |
| Git | per scaricare il progetto |
| Chiave API OpenRouter | creala su <https://openrouter.ai/keys> |
| Node.js 20+ e npm | solo per lo sviluppo locale senza Docker |

## 2. Installazione con Docker

```bash
git clone https://github.com/angoldon-lang/willama-chat.git
cd willama-chat

# 1. Variabili d'ambiente
cp .env.example .env
```

Modifica `.env`:

1. Genera i segreti (uno per ciascuna variabile `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`, `JWT_REFRESH_SECRET`):
   usa il generatore su <https://www.librechat.ai/toolkit/creds_generator> oppure
   `openssl rand -hex 32` (per `CREDS_IV` usa `openssl rand -hex 16`).
2. Decommenta e imposta `OPENROUTER_KEY=sk-or-v1-...`
3. (Consigliato in produzione) `DOMAIN_CLIENT` e `DOMAIN_SERVER` con il tuo URL, e
   `ALLOW_REGISTRATION=false` dopo aver creato gli utenti.

```bash
# 2. Configurazione modelli (OpenRouter)
cp willama.example.yaml librechat.yaml

# 3. Build dell'immagine (include logo, tema e lingua) e avvio — la prima build richiede alcuni minuti
docker compose up -d --build
```

Apri <http://localhost:3080>, registra il primo utente (diventa amministratore) e scegli
l'endpoint **OpenRouter** dal selettore dei modelli.

## 3. Operazioni comuni

```bash
docker compose logs -f api          # log applicazione
git pull && docker compose up -d --build       # aggiornamento
docker compose down                 # stop (i dati restano in ./data-node)
npm run create-user                 # crea utente (dentro il container: docker exec -it Willama-chat npm run create-user)
```

Backup: copia `./data-node` (MongoDB), `./uploads`, `./images`, `.env` e `librechat.yaml`.

## 4. Sviluppo locale (senza Docker per l'app)

```bash
npm ci
npm run build:data-provider && npm run build:api && npm run build:client-package
npm run backend:dev      # http://localhost:3080  (richiede MongoDB in esecuzione, MONGO_URI in .env)
npm run frontend:dev     # http://localhost:3090
```

## 5. Verifica di OpenRouter

1. Con la chiave in `.env` e `librechat.yaml` montato, riavvia: `docker compose up -d --force-recreate api`.
2. Nei log (`docker compose logs api`) non devono comparire errori di validazione di `librechat.yaml`.
3. In chat, il selettore deve mostrare **OpenRouter** con la lista completa dei modelli
   (`fetch: true`). Invia un messaggio: la risposta deve arrivare in streaming e la
   conversazione ottiene un titolo automatico.
4. Controllo diretto della chiave:
   `curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_KEY"`

Problemi frequenti: elenco modelli vuoto → chiave mancante/errata o `.env` non letto;
errore 401 → chiave non valida; errore 402 → credito OpenRouter esaurito.

## 6. Versioni e rilasci

Schema `ANNO.MESE.REVISIONE` (es. `2026.10.1`). Per un nuovo rilascio aggiorna `VERSION`,
`package.json` (root, `api`, `client`), `package-lock.json`, `helm/librechat/Chart.yaml`
e `CHANGELOG.md`, poi:

```bash
git tag v2026.10.2 && git push origin v2026.10.2
```
