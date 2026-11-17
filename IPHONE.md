# Installare Unbeatable sull'iPhone

Unbeatable è un'app iOS vera: un progetto Xcode nativo (Capacitor) che contiene l'interfaccia dell'app.
Le notifiche sono notifiche iOS native e arrivano anche con l'app chiusa. Tutti i dati restano sull'iPhone.

## Cosa serve
- Il Mac con **Xcode** (gratis dal Mac App Store) e **Node.js 20+** (da nodejs.org)
- L'iPhone e un cavo USB
- Un **Apple ID** (va bene quello normale)

## Primo avvio (una volta sola)
1. Copia la cartella `discipline-os` sul Mac (chiavetta, AirDrop o un repository Git), poi nel Terminale:
   ```bash
   cd discipline-os
   npm install
   npm run ios:sync
   npm run ios:open
   ```
2. In Xcode seleziona il progetto **App** → scheda **Signing & Capabilities** → in **Team** aggiungi il tuo Apple ID.
   Se Xcode segnala che l'identificativo `app.unbeatable.ios` è già in uso, cambialo con uno tuo (es. `com.tuonome.unbeatable`).
3. Collega l'iPhone, sbloccalo e accetta "Autorizza questo computer".
4. Sull'iPhone attiva **Impostazioni → Privacy e sicurezza → Modalità sviluppatore** (si riavvia).
5. In Xcode scegli il tuo iPhone in alto e premi **▶ Run**.
6. Al primo avvio, sull'iPhone: **Impostazioni → Generali → VPN e gestione dispositivi** → autorizza il tuo profilo sviluppatore.

## Aggiornare l'app dopo una modifica
```bash
npm run ios:sync
```
poi **▶ Run** in Xcode. I tuoi dati restano sul telefono.

## Da sapere
- **Apple ID gratuito:** l'app firmata resta valida **7 giorni**; dopo basta ricollegare l'iPhone e premere di nuovo Run (i dati non si perdono).
- **Apple Developer Program (99 $/anno):** l'app resta valida un anno e puoi installarla tramite **TestFlight** senza cavo.
- **Backup:** i dati vivono solo nell'app. Usa *Impostazioni → Dati e privacy → Esporta* e salva il file su iCloud Drive.
  Se elimini l'app, i dati vengono cancellati.
- Gli orari delle preghiere non vengono calcolati: aggiungili come blocchi nel Planner.
