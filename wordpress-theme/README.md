# NextBlock WordPress Theme

A premium institutional finance WordPress theme for insurance-linked assets marketplace. Features elegant curved SVG animations, responsive design, and modern dark/light sections.

## Features

- **Modern Design**: Clean, institutional finance aesthetic with elegant animations
- **Responsive**: Fully responsive across all devices
- **Customizable**: WordPress Customizer support for easy modifications
- **SEO Ready**: Clean, semantic HTML structure
- **Performance**: Optimized assets and minimal dependencies
- **Accessibility**: WCAG compliant markup

## Installation

1. Download the theme folder
2. Upload to `/wp-content/themes/` via FTP or WordPress admin
3. Activate the theme in WordPress admin → Appearance → Themes
4. Configure the theme via Appearance → Customize

## Theme Customization

### Hero Section
- Hero Title
- Background Video (upload via Media Library)
- CTA Button Text
- CTA Button Link

### Social Links
- Twitter URL
- Discord URL
- Telegram URL
- LinkedIn URL

## Required Setup

### Navigation Menus
1. Go to Appearance → Menus
2. Create a menu and assign it to "Primary Menu" location

### Front Page
1. Create a page (any title)
2. Go to Settings → Reading
3. Set "Your homepage displays" to "A static page"
4. Select your page as the Homepage

### Images
Copy the following images to `/assets/images/`:
- `protocol-stack-lion.png` - Winged Lion of Saint Mark (Protocol Stack section)
- `our-vision-venice.png` - Vision section illustration

### Video
Upload your hero background video via the Customizer (no overlay applied).
The footer also uses a decorative video frieze.

## File Structure

```
nextblock/
├── assets/
│   ├── css/
│   │   └── theme.css
│   ├── js/
│   │   ├── main.js
│   │   └── animations.js
│   ├── images/
│   │   ├── footer-frieze.png
│   │   └── our-vision-venice.png
│   └── svg/
├── template-parts/
│   ├── waitlist-form.php
│   └── decorative-grid.php
├── functions.php
├── header.php
├── footer.php
├── front-page.php
├── index.php
├── style.css
├── screenshot.png
└── README.md
```

## Waitlist Submissions

The theme includes a custom post type for managing waitlist submissions:
- View submissions in WordPress admin → Waitlist Submissions
- Submissions are automatically emailed to admin
- Data is stored securely as private posts

## Customizing Styles

### CSS Variables
Modify these in `style.css`:

```css
:root {
    --nb-primary: #1B3A6B;
    --nb-primary-light: #4A6CF7;
    --nb-background-light: #FAFAF8;
    --nb-background-dark: #0F1218;
}
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Credits

- Fonts: Google Fonts (DM Sans, Inter)
- Icons: Lucide Icons

## License

GNU General Public License v2 or later

## Support

For support, please visit https://nextblock.io
