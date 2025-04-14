document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    // Observe all elements that need animation
    document.querySelectorAll('.tutor-content, .tutor-content h2, .feature, .feature h3, .feature p, .tutor-illustration, .tutor-illustration img').forEach(element => {
        observer.observe(element);
    });
}); 