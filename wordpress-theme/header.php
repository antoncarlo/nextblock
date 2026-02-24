<?php
/**
 * The header template
 *
 * @package NextBlock
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<!-- Decorative Background Lines -->
<div class="nb-decorative-lines" aria-hidden="true">
    <svg class="nb-decorative-lines__svg" style="position: absolute; inset: 0; width: 100%; height: 100%;">
        <defs>
            <pattern id="dotGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="rgba(27, 58, 107, 0.12)" />
            </pattern>
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="rgba(27, 58, 107, 0.22)" />
                <stop offset="50%" stop-color="rgba(74, 108, 247, 0.18)" />
                <stop offset="100%" stop-color="rgba(27, 58, 107, 0.1)" />
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotGrid)" style="opacity: 0.6" />
    </svg>
</div>

<!-- Header -->
<header id="masthead" class="nb-header">
    <div class="nb-header__inner">
        <!-- Logo -->
        <a href="<?php echo esc_url(home_url('/')); ?>" class="nb-header__logo" rel="home">
            <?php
            if (has_custom_logo()) {
                the_custom_logo();
            } else {
                echo esc_html(get_bloginfo('name'));
            }
            ?>
        </a>

        <!-- Navigation -->
        <nav class="nb-header__nav" aria-label="<?php esc_attr_e('Primary Navigation', 'nextblock'); ?>">
            <?php
            wp_nav_menu(array(
                'theme_location' => 'primary',
                'menu_class'     => 'nb-header__menu',
                'container'      => false,
                'fallback_cb'    => false,
                'items_wrap'     => '%3$s',
                'walker'         => new NextBlock_Nav_Walker(),
            ));
            ?>
            <a href="<?php echo esc_url(get_theme_mod('cta_link', '#waitlist')); ?>" class="nb-header__cta">
                <?php echo esc_html(get_theme_mod('cta_text', __('Request Early Access', 'nextblock'))); ?>
            </a>
        </nav>

        <!-- Mobile Toggle -->
        <button class="nb-header__mobile-toggle" aria-label="<?php esc_attr_e('Toggle Menu', 'nextblock'); ?>">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" x2="21" y1="6" y2="6"/>
                <line x1="3" x2="21" y1="12" y2="12"/>
                <line x1="3" x2="21" y1="18" y2="18"/>
            </svg>
        </button>
    </div>
</header>
