/**
 * NextBlock Theme Main JavaScript
 *
 * @package NextBlock
 */

(function() {
    'use strict';

    // DOM Ready
    document.addEventListener('DOMContentLoaded', function() {
        initHeader();
        initWaitlistForm();
        initCardInteractions();
        initSmoothScroll();
    });

    /**
     * Header scroll effects
     */
    function initHeader() {
        const header = document.querySelector('.nb-header');
        if (!header) return;

        let lastScroll = 0;

        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                header.classList.add('nb-header--scrolled');
            } else {
                header.classList.remove('nb-header--scrolled');
            }

            lastScroll = currentScroll;
        });

        // Mobile menu toggle
        const mobileToggle = document.querySelector('.nb-header__mobile-toggle');
        const nav = document.querySelector('.nb-header__nav');

        if (mobileToggle && nav) {
            mobileToggle.addEventListener('click', function() {
                nav.classList.toggle('is-open');
                mobileToggle.classList.toggle('is-active');
            });
        }
    }

    /**
     * Waitlist form AJAX submission
     */
    function initWaitlistForm() {
        const form = document.getElementById('nb-waitlist-form');
        if (!form) return;

        form.addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(form);
            const messageEl = document.getElementById('nb-form-message');
            const submitBtn = form.querySelector('.nb-form__submit');

            // Disable button
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            fetch(nextblockData.ajaxUrl, {
                method: 'POST',
                body: formData,
            })
            .then(response => response.json())
            .then(data => {
                messageEl.style.display = 'block';
                
                if (data.success) {
                    messageEl.style.color = '#10B981';
                    messageEl.textContent = data.data.message;
                    form.reset();
                } else {
                    messageEl.style.color = '#EF4444';
                    messageEl.textContent = data.data.message;
                }

                submitBtn.disabled = false;
                submitBtn.textContent = 'Request Early Access';
            })
            .catch(error => {
                messageEl.style.display = 'block';
                messageEl.style.color = '#EF4444';
                messageEl.textContent = 'An error occurred. Please try again.';
                
                submitBtn.disabled = false;
                submitBtn.textContent = 'Request Early Access';
            });
        });
    }

    /**
     * Card click interactions
     */
    function initCardInteractions() {
        const cardGroups = document.querySelectorAll('.nb-features__cards, .nb-protocol__cards, .nb-waitlist__roles');

        cardGroups.forEach(function(group) {
            const cards = group.querySelectorAll('.nb-card');

            cards.forEach(function(card, index) {
                card.addEventListener('click', function() {
                    // Remove active class from all cards in group
                    cards.forEach(c => {
                        c.classList.remove('nb-card--active');
                        c.classList.add('nb-card--glass');
                    });

                    // Add active class to clicked card
                    card.classList.remove('nb-card--glass');
                    card.classList.add('nb-card--active');
                });
            });
        });
    }

    /**
     * Smooth scroll for anchor links
     */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return;

                e.preventDefault();

                const target = document.querySelector(href);
                if (target) {
                    const headerHeight = document.querySelector('.nb-header')?.offsetHeight || 0;
                    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

})();
