console.log('Dashboard script loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    const menuBtn = document.getElementById('menuBtn');
    console.log('Menu button:', menuBtn);

    if (!menuBtn) {
        console.error('Menu button not found');
        return;
    }

    // Create menu content
    const menuContent = document.createElement('div');
    menuContent.className = 'menu-content';
    menuContent.style.display = 'none';
    menuContent.innerHTML = `
        <ul>
            <li><a href="dashboard.html">Dashboard</a></li>
            <li><a href="profile.html">Profile</a></li>
            <li><a href="settings.html">Settings</a></li>
            <li><a href="login.html">Logout</a></li>
        </ul>
    `;

    // Add menu to the user section
    const userSection = document.querySelector('.user-section');
    userSection.appendChild(menuContent);

    // Toggle menu visibility
    menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (menuContent.style.display === 'none') {
            menuContent.style.display = 'block';
        } else {
            menuContent.style.display = 'none';
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!menuContent.contains(e.target) && e.target !== menuBtn) {
            menuContent.style.display = 'none';
        }
    });

    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Error logging out:', error);
            }
        });
    }
}); 