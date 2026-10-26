# Changelog

Versioning: `ANNO.MESE.REVISIONE` (es. `2026.10.1`). La revisione riparte da 1 a ogni nuovo mese
e cresce a ogni rilascio dello stesso mese. Tag git: `v2026.10.1`.

## 2026.10.2 — 2026-10-26

- Rimossa dalla home la scritta/footer "LibreChat" (resta un footer personalizzato se configurato)

- Integrazione **Cortecs** (<https://cortecs.ai>) come endpoint personalizzato (`willama.example.yaml`)
- **Dashboard consumi e costi** (menu account → "Consumi e costi", rotta `/usage`):
  consumi personali per modello e per giorno; per gli admin anche costi di tutti gli utenti
- Prezzi presi da OpenRouter e Cortecs (con tariffe di riserva di LibreChat), **ricarico +20%** di default
  (`WILLAMA_COST_MARKUP_PERCENT`)
- **Monitoraggio anonimo del traffico verso l'AI** per gli admin: solo contatori giornalieri
  (messaggi, dimensione, dati sensibili rilevati: email, telefono, IBAN, carte, codice fiscale, IP, chiavi API);
  disattivabile con `WILLAMA_TRAFFIC_MONITOR=false`

## 2026.10.1 — 2026-10-25

Prima release di Willama-chat, basata su LibreChat v0.8.9-rc1 (`a378657`).

- Nuovo logo, favicon e icone PWA; titolo applicazione `Willama-chat`
- Tema: colore principale indigo per pulsanti di invio/azione (chiaro e scuro)
- Italiano come lingua predefinita
- Configurazione di esempio con OpenRouter (`willama.example.yaml`)
- Guida all'installazione in italiano (`docs/INSTALL.it.md`)
