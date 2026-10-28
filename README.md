# FÁRA Finanzas

App para registrar trabajos, cobros, gastos y equipo de FÁRA. Funciona sin internet y se instala en el teléfono.

- Los datos se guardan en el teléfono.
- Con internet, se respaldan en Google Sheets (ver `GUIA-SHEETS.md`) y se actualiza el dólar MEP.
- Se publica gratis con GitHub Pages.

## Instalar en Android

1. Abrí el enlace de la app en Chrome.
2. Menú de los tres puntos > **Agregar a pantalla principal** (o **Instalar app**).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | La página |
| `styles.css` | Estética, con el sistema de diseño FÁRA |
| `app.js` | Toda la lógica |
| `sw.js` | Guarda una copia para usarla sin internet |
| `manifest.webmanifest` | Nombre e ícono al instalarla |
| `apps-script/Code.gs` | Script que va dentro del Google Sheet |
