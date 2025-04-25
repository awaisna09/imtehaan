// Notes functionality
export function initializeNotesPopup() {
  console.log('Initializing notes popup...');

  const expandNotesBtn = document.querySelector('.expand-notes-btn');
  const notesPopup = document.querySelector('.notes-popup');
  const closePopupBtn = document.querySelector('.close-popup');
  const saveNotesBtn = document.querySelector('.save-notes-btn');
  const detailedNotes = document.querySelector('.detailed-notes');

  console.log('Elements found:', {
    expandNotesBtn: !!expandNotesBtn,
    notesPopup: !!notesPopup,
    closePopupBtn: !!closePopupBtn,
    saveNotesBtn: !!saveNotesBtn,
    detailedNotes: !!detailedNotes,
  });

  if (
    !expandNotesBtn ||
    !notesPopup ||
    !closePopupBtn ||
    !saveNotesBtn ||
    !detailedNotes
  ) {
    console.error('Missing required elements for notes popup');
    return;
  }

  // Open popup
  expandNotesBtn.onclick = function () {
    console.log('Expand notes button clicked');
    notesPopup.style.display = 'flex';
    notesPopup.style.opacity = '1';
  };

  // Close popup
  closePopupBtn.onclick = function () {
    console.log('Close button clicked');
    notesPopup.style.display = 'none';
    notesPopup.style.opacity = '0';
  };

  // Save notes
  saveNotesBtn.onclick = function () {
    console.log('Save button clicked');
    notesPopup.style.display = 'none';
    notesPopup.style.opacity = '0';
  };

  // Close when clicking outside
  notesPopup.onclick = function (e) {
    if (e.target === notesPopup) {
      console.log('Clicked outside popup');
      notesPopup.style.display = 'none';
      notesPopup.style.opacity = '0';
    }
  };

  // Close with Escape key
  document.onkeydown = function (e) {
    if (e.key === 'Escape' && notesPopup.style.display === 'flex') {
      console.log('Escape key pressed');
      notesPopup.style.display = 'none';
      notesPopup.style.opacity = '0';
    }
  };
}
