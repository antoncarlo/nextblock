<?php
/**
 * The footer template
 *
 * @package NextBlock
 */

$social_icons = nextblock_social_icons();
?>

<!-- Footer -->
<footer id="colophon" class="nb-footer">
    <!-- Decorative Frieze -->
    <?php if (file_exists(NEXTBLOCK_DIR . '/assets/images/footer-frieze.png')) : ?>
    <div class="nb-footer__frieze">
        <img src="<?php echo esc_url(NEXTBLOCK_URI . '/assets/images/footer-frieze.png'); ?>" alt="" aria-hidden="true">
    </div>
    <?php endif; ?>

    <!-- Main Footer Content -->
    <div class="nb-footer__main">
        <!-- Brand Column -->
        <div class="nb-footer__brand">
            <a href="<?php echo esc_url(home_url('/')); ?>" class="nb-header__logo">
                <?php echo esc_html(get_bloginfo('name')); ?>
            </a>
            <p><?php echo esc_html(get_bloginfo('description')); ?></p>
            
            <div class="nb-footer__social">
                <?php foreach (array('twitter', 'discord', 'telegram', 'linkedin') as $social) :
                    $url = get_theme_mod('social_' . $social, '#');
                    if ($url && $url !== '#') :
                ?>
                    <a href="<?php echo esc_url($url); ?>" target="_blank" rel="noopener noreferrer" aria-label="<?php echo esc_attr(ucfirst($social)); ?>">
                        <?php echo $social_icons[$social]; ?>
                    </a>
                <?php endif; endforeach; ?>
            </div>
        </div>

        <!-- Protocol Links -->
        <div class="nb-footer__column">
            <h4 class="nb-footer__heading"><?php esc_html_e('Protocol', 'nextblock'); ?></h4>
            <ul class="nb-footer__links">
                <li><a href="#"><?php esc_html_e('Protocol Overview', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Documentation', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('GitHub', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Security Audits', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Bug Bounty', 'nextblock'); ?></a></li>
            </ul>
        </div>

        <!-- Resources Links -->
        <div class="nb-footer__column">
            <h4 class="nb-footer__heading"><?php esc_html_e('Resources', 'nextblock'); ?></h4>
            <ul class="nb-footer__links">
                <li><a href="#"><?php esc_html_e('Blog', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('FAQ', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Brand Kit', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Careers', 'nextblock'); ?></a></li>
            </ul>
        </div>

        <!-- Legal Links -->
        <div class="nb-footer__column">
            <h4 class="nb-footer__heading"><?php esc_html_e('Legal', 'nextblock'); ?></h4>
            <ul class="nb-footer__links">
                <li><a href="#"><?php esc_html_e('Terms of Service', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Privacy Policy', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Cookie Policy', 'nextblock'); ?></a></li>
                <li><a href="#"><?php esc_html_e('Risk Disclaimer', 'nextblock'); ?></a></li>
            </ul>
        </div>
    </div>

    <!-- Disclaimer -->
    <div class="nb-footer__disclaimer">
        <p>
            <?php esc_html_e('NextBlock is an open-source protocol. The information provided on this website does not constitute investment advice, financial advice, trading advice, or any other sort of advice. You should not treat any of the content as such. Insurance-linked assets involve significant risk. Past performance is not indicative of future results.', 'nextblock'); ?>
        </p>
    </div>

    <!-- Bottom Bar -->
    <div class="nb-footer__bottom">
        <div class="nb-footer__bottom-inner">
            <p>&copy; <?php echo date('Y'); ?> <?php echo esc_html(get_bloginfo('name')); ?>. <?php esc_html_e('All rights reserved.', 'nextblock'); ?></p>
            <p><?php esc_html_e('Built on Base · Secured by Ethereum', 'nextblock'); ?></p>
        </div>
    </div>
</footer>

<?php wp_footer(); ?>
</body>
</html>
