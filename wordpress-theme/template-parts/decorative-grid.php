<?php
/**
 * Decorative Grid Template Part
 *
 * @package NextBlock
 */

$variant = $args['variant'] ?? 'light';
$is_dark = $variant === 'dark';

$base_color = $is_dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(27, 58, 107, 0.08)';
$accent_color = $is_dark ? 'rgba(74, 108, 247, 0.12)' : 'rgba(74, 108, 247, 0.1)';
$line_color = $is_dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(27, 58, 107, 0.1)';
?>

<div class="nb-decorative-grid nb-decorative-grid--bottom" aria-hidden="true">
    <svg width="100%" height="100%" viewBox="0 0 1400 300" preserveAspectRatio="xMidYMid slice">
        <defs>
            <linearGradient id="fadeUp-<?php echo esc_attr($variant); ?>" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="white" stop-opacity="1" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
            </linearGradient>
            <mask id="fadeMask-<?php echo esc_attr($variant); ?>">
                <rect width="100%" height="100%" fill="url(#fadeUp-<?php echo esc_attr($variant); ?>)" />
            </mask>
        </defs>

        <g mask="url(#fadeMask-<?php echo esc_attr($variant); ?>)">
            <!-- Organic curved grid lines -->
            <path d="M 0 150 Q 350 100, 700 150 T 1400 120" fill="none" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="1" class="animate-draw-line" />
            <path d="M 0 200 Q 300 170, 600 200 T 1200 180 Q 1350 170, 1400 190" fill="none" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="0.8" class="animate-draw-line delay-200" />
            <path d="M 0 250 Q 400 230, 800 250 T 1400 240" fill="none" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="0.6" class="animate-draw-line delay-300" />

            <!-- Vertical flowing lines -->
            <path d="M 200 0 Q 220 80, 200 160 T 180 300" fill="none" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="0.8" class="animate-draw-line delay-400" />
            <path d="M 600 0 Q 580 100, 620 180 T 600 300" fill="none" stroke="<?php echo esc_attr($accent_color); ?>" stroke-width="1" class="animate-draw-line delay-500" />
            <path d="M 1000 0 Q 1020 90, 980 170 T 1000 300" fill="none" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="0.8" class="animate-draw-line" />

            <!-- Decorative shapes -->
            <ellipse cx="300" cy="180" rx="60" ry="40" fill="none" stroke="<?php echo esc_attr($accent_color); ?>" stroke-width="1" />
            <circle cx="800" cy="200" r="30" fill="none" stroke="<?php echo esc_attr($base_color); ?>" stroke-width="1.5" />
            
            <!-- Small accent dots -->
            <circle cx="150" cy="120" r="3" fill="<?php echo esc_attr($accent_color); ?>" />
            <circle cx="450" cy="180" r="2" fill="<?php echo esc_attr($accent_color); ?>" />
            <circle cx="750" cy="140" r="4" fill="<?php echo esc_attr($accent_color); ?>" />
            <circle cx="950" cy="220" r="2.5" fill="<?php echo esc_attr($accent_color); ?>" />
            <circle cx="1200" cy="100" r="3" fill="<?php echo esc_attr($accent_color); ?>" />

            <!-- Diamond shapes -->
            <path d="M 500 230 L 515 245 L 500 260 L 485 245 Z" fill="none" stroke="<?php echo esc_attr($accent_color); ?>" stroke-width="1" />
            <path d="M 900 170 L 912 185 L 900 200 L 888 185 Z" fill="<?php echo esc_attr($base_color); ?>" stroke="<?php echo esc_attr($line_color); ?>" stroke-width="0.5" />
        </g>
    </svg>
</div>
