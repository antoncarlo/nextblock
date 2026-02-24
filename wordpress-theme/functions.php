<?php
/**
 * NextBlock Theme Functions
 *
 * @package NextBlock
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// Theme Constants
define('NEXTBLOCK_VERSION', '1.0.0');
define('NEXTBLOCK_DIR', get_template_directory());
define('NEXTBLOCK_URI', get_template_directory_uri());

/**
 * Theme Setup
 */
function nextblock_setup() {
    // Add theme support
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('custom-logo', array(
        'height'      => 60,
        'width'       => 200,
        'flex-height' => true,
        'flex-width'  => true,
    ));
    add_theme_support('html5', array(
        'search-form',
        'comment-form',
        'comment-list',
        'gallery',
        'caption',
        'style',
        'script',
    ));
    add_theme_support('customize-selective-refresh-widgets');
    add_theme_support('editor-styles');
    add_theme_support('wp-block-styles');
    add_theme_support('responsive-embeds');

    // Register menus
    register_nav_menus(array(
        'primary'   => __('Primary Menu', 'nextblock'),
        'footer'    => __('Footer Menu', 'nextblock'),
    ));

    // Set content width
    if (!isset($content_width)) {
        $content_width = 1200;
    }
}
add_action('after_setup_theme', 'nextblock_setup');

/**
 * Enqueue Scripts and Styles
 */
function nextblock_scripts() {
    // Google Fonts
    wp_enqueue_style(
        'nextblock-fonts',
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap',
        array(),
        null
    );

    // Main stylesheet
    wp_enqueue_style(
        'nextblock-style',
        get_stylesheet_uri(),
        array(),
        NEXTBLOCK_VERSION
    );

    // Additional theme styles
    wp_enqueue_style(
        'nextblock-theme',
        NEXTBLOCK_URI . '/assets/css/theme.css',
        array('nextblock-style'),
        NEXTBLOCK_VERSION
    );

    // Theme scripts
    wp_enqueue_script(
        'nextblock-animations',
        NEXTBLOCK_URI . '/assets/js/animations.js',
        array(),
        NEXTBLOCK_VERSION,
        true
    );

    wp_enqueue_script(
        'nextblock-main',
        NEXTBLOCK_URI . '/assets/js/main.js',
        array('nextblock-animations'),
        NEXTBLOCK_VERSION,
        true
    );

    // Localize script
    wp_localize_script('nextblock-main', 'nextblockData', array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce'   => wp_create_nonce('nextblock_nonce'),
    ));
}
add_action('wp_enqueue_scripts', 'nextblock_scripts');

/**
 * Theme Customizer Settings
 */
function nextblock_customize_register($wp_customize) {
    // Hero Section
    $wp_customize->add_section('nextblock_hero', array(
        'title'    => __('Hero Section', 'nextblock'),
        'priority' => 30,
    ));

    // Hero Title
    $wp_customize->add_setting('hero_title', array(
        'default'           => 'The Universal Marketplace for Insurance-Linked Assets.',
        'sanitize_callback' => 'sanitize_text_field',
    ));

    $wp_customize->add_control('hero_title', array(
        'label'   => __('Hero Title', 'nextblock'),
        'section' => 'nextblock_hero',
        'type'    => 'textarea',
    ));

    // Hero Video
    $wp_customize->add_setting('hero_video', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ));

    $wp_customize->add_control(new WP_Customize_Media_Control($wp_customize, 'hero_video', array(
        'label'     => __('Hero Background Video', 'nextblock'),
        'section'   => 'nextblock_hero',
        'mime_type' => 'video',
    )));

    // CTA Button Text
    $wp_customize->add_setting('cta_text', array(
        'default'           => 'Request Early Access',
        'sanitize_callback' => 'sanitize_text_field',
    ));

    $wp_customize->add_control('cta_text', array(
        'label'   => __('CTA Button Text', 'nextblock'),
        'section' => 'nextblock_hero',
        'type'    => 'text',
    ));

    // CTA Button Link
    $wp_customize->add_setting('cta_link', array(
        'default'           => '#waitlist',
        'sanitize_callback' => 'esc_url_raw',
    ));

    $wp_customize->add_control('cta_link', array(
        'label'   => __('CTA Button Link', 'nextblock'),
        'section' => 'nextblock_hero',
        'type'    => 'url',
    ));

    // Social Links Section
    $wp_customize->add_section('nextblock_social', array(
        'title'    => __('Social Links', 'nextblock'),
        'priority' => 35,
    ));

    $social_links = array('twitter', 'discord', 'telegram', 'linkedin');
    foreach ($social_links as $social) {
        $wp_customize->add_setting('social_' . $social, array(
            'default'           => '#',
            'sanitize_callback' => 'esc_url_raw',
        ));

        $wp_customize->add_control('social_' . $social, array(
            'label'   => sprintf(__('%s URL', 'nextblock'), ucfirst($social)),
            'section' => 'nextblock_social',
            'type'    => 'url',
        ));
    }
}
add_action('customize_register', 'nextblock_customize_register');

/**
 * Register Widget Areas
 */
function nextblock_widgets_init() {
    register_sidebar(array(
        'name'          => __('Footer Widget Area 1', 'nextblock'),
        'id'            => 'footer-1',
        'description'   => __('Add widgets here for footer column 1.', 'nextblock'),
        'before_widget' => '<div id="%1$s" class="widget %2$s">',
        'after_widget'  => '</div>',
        'before_title'  => '<h4 class="widget-title nb-footer__heading">',
        'after_title'   => '</h4>',
    ));

    register_sidebar(array(
        'name'          => __('Footer Widget Area 2', 'nextblock'),
        'id'            => 'footer-2',
        'description'   => __('Add widgets here for footer column 2.', 'nextblock'),
        'before_widget' => '<div id="%1$s" class="widget %2$s">',
        'after_widget'  => '</div>',
        'before_title'  => '<h4 class="widget-title nb-footer__heading">',
        'after_title'   => '</h4>',
    ));

    register_sidebar(array(
        'name'          => __('Footer Widget Area 3', 'nextblock'),
        'id'            => 'footer-3',
        'description'   => __('Add widgets here for footer column 3.', 'nextblock'),
        'before_widget' => '<div id="%1$s" class="widget %2$s">',
        'after_widget'  => '</div>',
        'before_title'  => '<h4 class="widget-title nb-footer__heading">',
        'after_title'   => '</h4>',
    ));
}
add_action('widgets_init', 'nextblock_widgets_init');

/**
 * AJAX Handler for Waitlist Form
 */
function nextblock_handle_waitlist_submission() {
    check_ajax_referer('nextblock_nonce', 'nonce');

    $full_name = sanitize_text_field($_POST['full_name'] ?? '');
    $email     = sanitize_email($_POST['email'] ?? '');
    $company   = sanitize_text_field($_POST['company'] ?? '');
    $interest  = sanitize_text_field($_POST['interest'] ?? '');
    $message   = sanitize_textarea_field($_POST['message'] ?? '');

    // Validate
    if (empty($full_name) || empty($email) || empty($company) || empty($interest)) {
        wp_send_json_error(array('message' => __('Please fill in all required fields.', 'nextblock')));
    }

    if (!is_email($email)) {
        wp_send_json_error(array('message' => __('Please enter a valid email address.', 'nextblock')));
    }

    // Save to database (custom table or post type)
    $submission = array(
        'post_title'   => $full_name . ' - ' . $email,
        'post_content' => wp_json_encode(array(
            'full_name' => $full_name,
            'email'     => $email,
            'company'   => $company,
            'interest'  => $interest,
            'message'   => $message,
            'date'      => current_time('mysql'),
        )),
        'post_type'    => 'waitlist_submission',
        'post_status'  => 'private',
    );

    $post_id = wp_insert_post($submission);

    if ($post_id) {
        // Send notification email
        $admin_email = get_option('admin_email');
        $subject     = sprintf(__('[NextBlock] New Waitlist Submission from %s', 'nextblock'), $full_name);
        $body        = sprintf(
            "New waitlist submission:\n\nName: %s\nEmail: %s\nCompany: %s\nInterest: %s\nMessage: %s",
            $full_name,
            $email,
            $company,
            $interest,
            $message
        );
        wp_mail($admin_email, $subject, $body);

        wp_send_json_success(array('message' => __('Thank you! Your submission has been received.', 'nextblock')));
    } else {
        wp_send_json_error(array('message' => __('Something went wrong. Please try again.', 'nextblock')));
    }
}
add_action('wp_ajax_nextblock_waitlist', 'nextblock_handle_waitlist_submission');
add_action('wp_ajax_nopriv_nextblock_waitlist', 'nextblock_handle_waitlist_submission');

/**
 * Register Custom Post Type for Waitlist Submissions
 */
function nextblock_register_post_types() {
    register_post_type('waitlist_submission', array(
        'labels'       => array(
            'name'          => __('Waitlist Submissions', 'nextblock'),
            'singular_name' => __('Submission', 'nextblock'),
        ),
        'public'       => false,
        'show_ui'      => true,
        'show_in_menu' => true,
        'menu_icon'    => 'dashicons-email-alt',
        'supports'     => array('title'),
        'capabilities' => array(
            'create_posts' => false,
        ),
        'map_meta_cap' => true,
    ));
}
add_action('init', 'nextblock_register_post_types');

/**
 * Custom Admin Columns for Waitlist
 */
function nextblock_waitlist_columns($columns) {
    return array(
        'cb'       => '<input type="checkbox" />',
        'title'    => __('Submission', 'nextblock'),
        'email'    => __('Email', 'nextblock'),
        'company'  => __('Company', 'nextblock'),
        'interest' => __('Interest', 'nextblock'),
        'date'     => __('Date', 'nextblock'),
    );
}
add_filter('manage_waitlist_submission_posts_columns', 'nextblock_waitlist_columns');

function nextblock_waitlist_column_content($column, $post_id) {
    $content = json_decode(get_post_field('post_content', $post_id), true);
    
    switch ($column) {
        case 'email':
            echo esc_html($content['email'] ?? '');
            break;
        case 'company':
            echo esc_html($content['company'] ?? '');
            break;
        case 'interest':
            echo esc_html($content['interest'] ?? '');
            break;
    }
}
add_action('manage_waitlist_submission_posts_custom_column', 'nextblock_waitlist_column_content', 10, 2);

/**
 * Helper Functions
 */
function nextblock_get_svg($name) {
    $svg_path = NEXTBLOCK_DIR . '/assets/svg/' . $name . '.svg';
    if (file_exists($svg_path)) {
        return file_get_contents($svg_path);
    }
    return '';
}

function nextblock_social_icons() {
    return array(
        'twitter'  => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>',
        'discord'  => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
        'telegram' => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        'linkedin' => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',
    );
}
