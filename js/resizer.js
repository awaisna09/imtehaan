document.addEventListener('DOMContentLoaded', function () {
  const resizer = document.querySelector('.resizer');
  const chatInterface = document.querySelector('.chat-interface');
  let isResizing = false;
  let startX;
  let startWidth;

  resizer.addEventListener('mousedown', initResize);

  function initResize(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(chatInterface).width, 10);

    // Add event listeners
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);

    // Add resizing class to prevent text selection while resizing
    document.body.classList.add('resizing');
  }

  function resize(e) {
    if (!isResizing) return;

    // Calculate new width
    const width = startWidth - (e.clientX - startX);

    // Set minimum and maximum width constraints
    if (width > 200 && width < 800) {
      chatInterface.style.width = `${width}px`;
    }
  }

  function stopResize() {
    isResizing = false;
    document.body.classList.remove('resizing');

    // Remove event listeners
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  }
});
