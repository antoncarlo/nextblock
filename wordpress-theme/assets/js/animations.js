/**
 * NextBlock Theme Animations
 *
 * @package NextBlock
 */

(function() {
    'use strict';

    // Intersection Observer for scroll animations
    document.addEventListener('DOMContentLoaded', function() {
        initScrollAnimations();
        initMarquee();
        initVideoPlayback();
    });

    /**
     * Scroll-triggered animations using Intersection Observer
     */
    function initScrollAnimations() {
        const observerOptions = {
            root: null,
            rootMargin: '-50px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    
                    // Animate SVG paths
                    const paths = entry.target.querySelectorAll('.animate-draw-line');
                    paths.forEach((path, index) => {
                        path.style.animationDelay = (index * 0.2) + 's';
                        path.classList.add('is-animated');
                    });
                }
            });
        }, observerOptions);

        // Observe all sections
        document.querySelectorAll('.nb-section').forEach(section => {
            observer.observe(section);
        });

        // Observe decorative grids
        document.querySelectorAll('.nb-decorative-grid').forEach(grid => {
            observer.observe(grid);
        });

        // Observe animated elements
        document.querySelectorAll('.animate-fade-in-up').forEach(el => {
            el.style.opacity = '0';
            observer.observe(el);
        });
    }

    /**
     * Initialize marquee animation
     */
    function initMarquee() {
        const marquee = document.querySelector('.nb-marquee__track');
        if (!marquee) return;

        // Clone items for seamless loop
        const items = marquee.innerHTML;
        marquee.innerHTML = items + items;
    }

    /**
     * Video playback rate
     */
    function initVideoPlayback() {
        const video = document.querySelector('.nb-hero__video video');
        if (video) {
            video.playbackRate = 0.5;
        }
    }

    /**
     * Add visible class styles
     */
    const style = document.createElement('style');
    style.textContent = `
        .animate-fade-in-up {
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        
        .animate-fade-in-up.is-visible {
            opacity: 1;
            transform: translateY(0);
        }
        
        .animate-draw-line {
            stroke-dasharray: 2000;
            stroke-dashoffset: 2000;
        }
        
        .animate-draw-line.is-animated {
            animation: drawLine 2s ease-out forwards;
        }
        
        @keyframes drawLine {
            to {
                stroke-dashoffset: 0;
            }
        }
    `;
    document.head.appendChild(style);

})();
