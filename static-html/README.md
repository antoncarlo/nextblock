# NextBlock Static HTML

Versione statica HTML del sito NextBlock, pronta per essere caricata su qualsiasi hosting o integrata in WordPress come pagina statica.

## Struttura File

```
static-html/
├── index.html          # Pagina principale
├── css/
│   └── style.css       # Tutti gli stili
├── js/
│   └── main.js         # JavaScript per interazioni
├── images/
│   ├── protocol-stack-lion.png
│   └── our-vision-venice.png
├── videos/
│   ├── hero-background.mp4
│   └── footer-frieze.mp4
└── favicon.ico
```

## Come Usare

### Hosting Statico
1. Carica tutti i file su qualsiasi hosting web
2. Assicurati che la struttura delle cartelle sia mantenuta
3. Aggiungi i file video nella cartella `videos/`
4. Aggiungi le immagini nella cartella `images/`

### WordPress (Pagina Statica)
1. Crea una nuova pagina in WordPress
2. Usa un page builder o l'editor HTML
3. Incolla il contenuto di `index.html`
4. Carica CSS/JS tramite il tema o un plugin

### WordPress (Tema Completo)
Usa invece la cartella `wordpress-theme/` per un'integrazione completa con:
- Customizer WordPress
- Gestione waitlist con CPT
- Menu dinamici
- Widget areas

## Requisiti Asset

### Video
- `videos/hero-background.mp4` - Video sfondo hero
- `videos/footer-frieze.mp4` - Video decorativo footer

### Immagini
- `images/protocol-stack-lion.png` - Leone alato di San Marco
- `images/our-vision-venice.png` - Venezia per sezione vision

## Personalizzazione

### Colori
Modifica le variabili CSS in `css/style.css`:
```css
:root {
  --nb-primary: #1B3A6B;
  --nb-background-light: #FAFAF8;
  --nb-background-dark: #0F1218;
  /* ... */
}
```

### Testi
Modifica direttamente in `index.html`

### Form Waitlist
Il form attualmente mostra solo un messaggio di successo. Per funzionalità reale:
1. Integra con un servizio (Mailchimp, ConvertKit, etc.)
2. Oppure usa un backend PHP/Node.js

## Browser Supportati
- Chrome (ultimi 2 major)
- Firefox (ultimi 2 major)
- Safari (ultimi 2 major)
- Edge (ultimi 2 major)

## Licenza
Proprietario - NextBlock © 2024
