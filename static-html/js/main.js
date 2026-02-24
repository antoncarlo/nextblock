/**
 * NextBlock Static HTML - Main JavaScript
 * Version: 1.0.0
 */

document.addEventListener('DOMContentLoaded', function() {
    // Header scroll effect
    const header = document.getElementById('header');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('nb-header--scrolled');
        } else {
            header.classList.remove('nb-header--scrolled');
        }
    });

    // Mobile menu toggle
    const mobileToggle = document.getElementById('mobile-toggle');
    const nav = document.getElementById('nav');
    
    if (mobileToggle && nav) {
        mobileToggle.addEventListener('click', function() {
            nav.classList.toggle('is-open');
            mobileToggle.classList.toggle('is-active');
        });

        // Close menu when clicking a link
        nav.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                nav.classList.remove('is-open');
                mobileToggle.classList.remove('is-active');
            });
        });
    }

    // Section visibility on scroll
    const sections = document.querySelectorAll('.nb-section');
    
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const sectionObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, observerOptions);
    
    sections.forEach(function(section) {
        sectionObserver.observe(section);
    });

    // Protocol Stack Cards Navigation
    const protocolCards = document.querySelectorAll('.nb-protocol__cards .nb-card');
    const prevBtn = document.getElementById('prev-card');
    const nextBtn = document.getElementById('next-card');
    let activeCardIndex = 0;

    function updateActiveCard(index) {
        protocolCards.forEach(function(card, i) {
            if (i === index) {
                card.classList.remove('nb-card--glass');
                card.classList.add('nb-card--active');
            } else {
                card.classList.remove('nb-card--active');
                card.classList.add('nb-card--glass');
            }
        });
        activeCardIndex = index;
    }

    if (prevBtn && nextBtn && protocolCards.length > 0) {
        prevBtn.addEventListener('click', function() {
            const newIndex = activeCardIndex === 0 ? protocolCards.length - 1 : activeCardIndex - 1;
            updateActiveCard(newIndex);
        });

        nextBtn.addEventListener('click', function() {
            const newIndex = activeCardIndex === protocolCards.length - 1 ? 0 : activeCardIndex + 1;
            updateActiveCard(newIndex);
        });

        protocolCards.forEach(function(card, index) {
            card.addEventListener('click', function() {
                updateActiveCard(index);
            });
        });
    }

    // Waitlist Role Cards
    const roleCards = document.querySelectorAll('.nb-waitlist__roles .nb-card');
    const interestSelect = document.getElementById('interest');

    roleCards.forEach(function(card) {
        card.addEventListener('click', function() {
            roleCards.forEach(function(c) {
                c.classList.remove('nb-card--active');
                c.classList.add('nb-card--glass');
            });
            card.classList.remove('nb-card--glass');
            card.classList.add('nb-card--active');

            // Update select based on role
            const role = card.dataset.role;
            if (interestSelect && role) {
                interestSelect.value = role;
            }
        });
    });

    // Form submission
    const waitlistForm = document.getElementById('waitlist-form');
    const formSuccess = document.getElementById('form-success');

    if (waitlistForm) {
        waitlistForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(waitlistForm);
            const data = {};
            formData.forEach(function(value, key) {
                data[key] = value;
            });

            // Simulate form submission
            // In production, replace this with actual API call
            console.log('Form submitted:', data);

            // Show success message
            waitlistForm.style.display = 'none';
            if (formSuccess) {
                formSuccess.style.display = 'block';
            }
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const headerHeight = header.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});
