<?php
/**
 * Front Page Template
 *
 * @package NextBlock
 */

get_header();
?>

<main id="primary" class="nb-main">
    
    <!-- Hero Section -->
    <section class="nb-hero nb-section">
        <div class="nb-hero__video">
            <?php 
            $video_id = get_theme_mod('hero_video');
            if ($video_id) :
                $video_url = wp_get_attachment_url($video_id);
            ?>
            <video autoplay muted playsinline loop>
                <source src="<?php echo esc_url($video_url); ?>" type="video/mp4">
            </video>
            <?php endif; ?>
        </div>

        <div class="nb-hero__content">
            <h1 class="nb-hero__title animate-fade-in-up">
                <?php echo esc_html(get_theme_mod('hero_title', 'The Universal Marketplace for Insurance-Linked Assets.')); ?>
            </h1>

            <div class="nb-hero__actions animate-fade-in-up delay-200">
                <a href="<?php echo esc_url(get_theme_mod('cta_link', '#waitlist')); ?>" class="nb-btn nb-btn--primary">
                    <?php echo esc_html(get_theme_mod('cta_text', __('Request Early Access', 'nextblock'))); ?>
                </a>
                <a href="#how-it-works" class="nb-btn nb-btn--outline">
                    <?php esc_html_e('Learn More', 'nextblock'); ?>
                </a>
            </div>
        </div>

        <div class="nb-hero__scroll">
            <div class="nb-hero__scroll-indicator">
                <div class="nb-hero__scroll-dot"></div>
            </div>
        </div>
    </section>

    <!-- Key Benefits Marquee -->
    <section class="nb-marquee">
        <div class="nb-marquee__track">
            <?php
            $keywords = array('Permissionless', 'Open-Source', 'On-Chain', 'Transparent', 'Immutable', 'Composable');
            $partners = array(
                array('name' => 'Base', 'icon' => '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/></svg>'),
                array('name' => 'Ethereum', 'icon' => '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 10L10 13L17 10L10 2Z" stroke="currentColor" stroke-width="1.5"/><path d="M10 13L3 10L10 18L17 10L10 13Z" stroke="currentColor" stroke-width="1.5"/></svg>'),
                array('name' => 'Chainlink', 'icon' => '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="currentColor" stroke-width="1.5"/></svg>'),
            );
            
            // Duplicate for seamless scroll
            for ($i = 0; $i < 2; $i++) :
                $partner_index = 0;
                foreach ($keywords as $keyword) :
            ?>
                <span class="nb-marquee__item"><?php echo esc_html($keyword); ?></span>
                <?php if (isset($partners[$partner_index])) : ?>
                    <span class="nb-marquee__item nb-marquee__partner">
                        <?php echo $partners[$partner_index]['icon']; ?>
                        <?php echo esc_html($partners[$partner_index]['name']); ?>
                    </span>
                    <?php $partner_index++; ?>
                <?php endif; ?>
            <?php endforeach; endfor; ?>
        </div>
    </section>

    <!-- Features Section (Problem/Solution) -->
    <section class="nb-features nb-section nb-section--dark">
        <?php get_template_part('template-parts/decorative', 'grid', array('variant' => 'dark')); ?>
        
        <div class="nb-container">
            <div class="nb-features__header">
                <span class="section-label section-label--light"><?php esc_html_e('The Opportunity', 'nextblock'); ?></span>
                <h2><?php esc_html_e('From Silos to a', 'nextblock'); ?><br><?php esc_html_e('Liquid Marketplace', 'nextblock'); ?></h2>
            </div>

            <div class="nb-features__cards">
                <div class="nb-card nb-card--active">
                    <div class="nb-card__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <span class="nb-card__label"><?php esc_html_e('The Problem', 'nextblock'); ?></span>
                    <h3 class="nb-card__title"><?php esc_html_e('Trapped Capital, Opaque Risk', 'nextblock'); ?></h3>
                    <p class="nb-card__content">
                        <?php esc_html_e('The traditional reinsurance market is capital-intensive, illiquid, and inaccessible. For reinsurers, billions in capital are trapped in inefficient structures. For investors, access to this stable, uncorrelated asset class is restricted to a select few.', 'nextblock'); ?>
                    </p>
                </div>

                <div class="nb-card nb-card--glass">
                    <div class="nb-card__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    </div>
                    <span class="nb-card__label"><?php esc_html_e('The Solution', 'nextblock'); ?></span>
                    <h3 class="nb-card__title"><?php esc_html_e('Permissionless Vaults, Composable Risk', 'nextblock'); ?></h3>
                    <p class="nb-card__content">
                        <?php esc_html_e('NextBlock provides the open-source infrastructure to change this. We enable any entity—from established reinsurers to specialized asset managers—to curate and launch their own tokenized risk vaults.', 'nextblock'); ?>
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- Stats Section -->
    <section id="about" class="nb-stats nb-section nb-section--alt">
        <?php get_template_part('template-parts/decorative', 'grid', array('variant' => 'light')); ?>
        
        <div class="nb-container">
            <div class="nb-stats__header">
                <span class="section-label"><?php esc_html_e('The Market', 'nextblock'); ?></span>
                <h2 class="nb-stats__title">
                    <?php esc_html_e('An Untapped', 'nextblock'); ?><br>
                    <span><?php esc_html_e('Financial Primitive', 'nextblock'); ?></span>
                </h2>
            </div>

            <div class="nb-stats__grid">
                <div class="nb-stats__line hide-mobile"></div>

                <?php
                $stats = array(
                    array('value' => '$30T', 'label' => __('Global Insurance AUM', 'nextblock'), 'desc' => __('Global insurance assets under management, one of the largest capital pools in the world.', 'nextblock')),
                    array('value' => '$700B+', 'label' => __('Reinsurance Capital', 'nextblock'), 'desc' => __('The total capital base of the global reinsurance industry, foundational to global financial stability.', 'nextblock')),
                    array('value' => '<1%', 'label' => __('On-Chain', 'nextblock'), 'desc' => __('The fraction of insurance-linked assets currently accessible on-chain. A massive opportunity awaits.', 'nextblock')),
                );

                foreach ($stats as $index => $stat) :
                ?>
                <div class="nb-stats__item">
                    <div class="nb-stats__content">
                        <div class="nb-stats__value"><?php echo esc_html($stat['value']); ?></div>
                        <div class="nb-stats__label"><?php echo esc_html($stat['label']); ?></div>
                        <p class="nb-stats__description"><?php echo esc_html($stat['desc']); ?></p>
                    </div>
                    <div class="nb-stats__node hide-mobile">
                        <div class="nb-stats__node-inner"></div>
                    </div>
                    <div class="nb-stats__spacer"></div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <!-- Protocol Stack Section -->
    <section id="how-it-works" class="nb-protocol nb-section nb-section--dark" style="background-image: url('<?php echo esc_url(NEXTBLOCK_URI . '/assets/images/protocol-stack-lion.png'); ?>'); background-size: contain; background-position: center; background-repeat: no-repeat; background-color: #FAFAF8;">>
        <div class="nb-protocol__overlay">
            <?php get_template_part('template-parts/decorative', 'grid', array('variant' => 'dark')); ?>
            
            <div class="nb-container">
                <div class="nb-protocol__header">
                    <span class="section-label section-label--light"><?php esc_html_e('How It Works', 'nextblock'); ?></span>
                    <h2><?php esc_html_e('The Insurance-Linked', 'nextblock'); ?><br><?php esc_html_e('Protocol Stack', 'nextblock'); ?></h2>
                </div>

                <div class="nb-protocol__cards">
                    <?php
                    $cards = array(
                        array('icon' => 'shield', 'label' => __('The Protocol', 'nextblock'), 'title' => __('NextBlock Core', 'nextblock'), 'content' => __('A simple, immutable, and open-source set of smart contracts on Base.', 'nextblock')),
                        array('icon' => 'compass', 'label' => __('The Curators', 'nextblock'), 'title' => __('Risk Architects', 'nextblock'), 'content' => __('Reinsurers, asset managers, and specialized funds act as Curators.', 'nextblock')),
                        array('icon' => 'key', 'label' => __('The Investors', 'nextblock'), 'title' => __('Curated Yield', 'nextblock'), 'content' => __('Institutional and accredited investors can access a diverse marketplace.', 'nextblock')),
                    );

                    foreach ($cards as $index => $card) :
                        $is_active = $index === 0;
                    ?>
                    <div class="nb-card <?php echo $is_active ? 'nb-card--active' : 'nb-card--glass'; ?>">
                        <span class="nb-card__label"><?php echo esc_html($card['label']); ?></span>
                        <h3 class="nb-card__title"><?php echo esc_html($card['title']); ?></h3>
                        <?php if ($is_active) : ?>
                        <p class="nb-card__content"><?php echo esc_html($card['content']); ?></p>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <!-- Vision Section -->
    <section class="nb-vision nb-section nb-section--light">
        <?php get_template_part('template-parts/decorative', 'grid', array('variant' => 'light')); ?>
        
        <div class="nb-vision__grid">
            <div class="nb-vision__content">
                <span class="section-label"><?php esc_html_e('Our Vision', 'nextblock'); ?></span>
                <h2><?php esc_html_e('From Venice to the Blockchain', 'nextblock'); ?></h2>
                <p>
                    <?php esc_html_e('The modern insurance market was born in the coffeehouses and trading houses of Venice, where merchants pooled capital to share maritime risk. Centuries later, NextBlock brings this foundational principle on-chain — permissionless, transparent, and composable.', 'nextblock'); ?>
                </p>
                <a href="#" class="nb-vision__link">
                    <?php esc_html_e('Read our thesis', 'nextblock'); ?> →
                </a>
            </div>
            
            <div class="nb-vision__image">
                <img src="<?php echo esc_url(NEXTBLOCK_URI . '/assets/images/our-vision-venice.png'); ?>" alt="<?php esc_attr_e('Venetian merchant at desk with Grand Canal view', 'nextblock'); ?>">
            </div>
        </div>
    </section>

    <!-- Waitlist Section -->
    <section id="waitlist" class="nb-waitlist nb-section nb-section--dark">
        <?php get_template_part('template-parts/decorative', 'grid', array('variant' => 'dark')); ?>
        
        <div class="nb-container">
            <div class="nb-waitlist__header">
                <span class="section-label section-label--light"><?php esc_html_e('Join the Waitlist', 'nextblock'); ?></span>
                <h2><?php esc_html_e('Be Part of the New', 'nextblock'); ?><br><?php esc_html_e('Capital Market', 'nextblock'); ?></h2>
                <p class="nb-waitlist__subtitle">
                    <?php esc_html_e('We are currently in private beta, working with leading reinsurers and asset managers. Request early access to join as a curator, investor, or partner.', 'nextblock'); ?>
                </p>
            </div>

            <div class="nb-waitlist__grid">
                <!-- Role Cards -->
                <div class="nb-waitlist__roles">
                    <?php
                    $roles = array(
                        array('icon' => 'compass', 'label' => __('For Curators', 'nextblock'), 'title' => __('Build Your Strategy', 'nextblock')),
                        array('icon' => 'key', 'label' => __('For Investors', 'nextblock'), 'title' => __('Diversify Your Portfolio', 'nextblock')),
                        array('icon' => 'handshake', 'label' => __('For Partners', 'nextblock'), 'title' => __('Join the Ecosystem', 'nextblock')),
                    );

                    foreach ($roles as $index => $role) :
                        $is_active = $index === 0;
                    ?>
                    <div class="nb-card <?php echo $is_active ? 'nb-card--active' : 'nb-card--glass'; ?>">
                        <span class="nb-card__label"><?php echo esc_html($role['label']); ?></span>
                        <h3 class="nb-card__title"><?php echo esc_html($role['title']); ?></h3>
                    </div>
                    <?php endforeach; ?>
                </div>

                <!-- Form -->
                <div class="nb-waitlist__form-card">
                    <?php get_template_part('template-parts/waitlist', 'form'); ?>
                </div>
            </div>
        </div>
    </section>

</main>

<?php
get_footer();
