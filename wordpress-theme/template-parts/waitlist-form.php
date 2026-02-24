<?php
/**
 * Waitlist Form Template Part
 *
 * @package NextBlock
 */
?>

<form id="nb-waitlist-form" class="nb-form" method="post">
    <div class="nb-form__group">
        <label for="full_name" class="nb-form__label"><?php esc_html_e('Full Name', 'nextblock'); ?> *</label>
        <input type="text" id="full_name" name="full_name" class="nb-form__input" required>
    </div>

    <div class="nb-form__group">
        <label for="email" class="nb-form__label"><?php esc_html_e('Email', 'nextblock'); ?> *</label>
        <input type="email" id="email" name="email" class="nb-form__input" required>
    </div>

    <div class="nb-form__group">
        <label for="company" class="nb-form__label"><?php esc_html_e('Company / Organization', 'nextblock'); ?> *</label>
        <input type="text" id="company" name="company" class="nb-form__input" required>
    </div>

    <div class="nb-form__group">
        <label for="interest" class="nb-form__label"><?php esc_html_e('I am interested as a...', 'nextblock'); ?> *</label>
        <select id="interest" name="interest" class="nb-form__select" required>
            <option value=""><?php esc_html_e('Select your role', 'nextblock'); ?></option>
            <option value="curator"><?php esc_html_e('Curator (Reinsurer / Asset Manager)', 'nextblock'); ?></option>
            <option value="investor"><?php esc_html_e('Investor (Institutional / Accredited)', 'nextblock'); ?></option>
            <option value="partner"><?php esc_html_e('Partner (Technology / Strategic)', 'nextblock'); ?></option>
            <option value="other"><?php esc_html_e('Other', 'nextblock'); ?></option>
        </select>
    </div>

    <div class="nb-form__group">
        <label for="message" class="nb-form__label"><?php esc_html_e('Message (Optional)', 'nextblock'); ?></label>
        <textarea id="message" name="message" class="nb-form__textarea" rows="3" placeholder="<?php esc_attr_e('Tell us about your interest...', 'nextblock'); ?>"></textarea>
    </div>

    <input type="hidden" name="action" value="nextblock_waitlist">
    <?php wp_nonce_field('nextblock_nonce', 'nonce'); ?>

    <button type="submit" class="nb-form__submit">
        <?php esc_html_e('Request Early Access', 'nextblock'); ?>
    </button>

    <div id="nb-form-message" class="nb-form__message" style="display: none; margin-top: 16px; text-align: center;"></div>
</form>
