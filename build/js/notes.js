export function initializeNotesPopup() {
  const e = document.querySelector('.expand-notes-btn'),
    t = document.querySelector('.notes-popup'),
    o = document.querySelector('.close-popup'),
    n = document.querySelector('.save-notes-btn'),
    c = document.querySelector('.detailed-notes');
  e &&
    t &&
    o &&
    n &&
    c &&
    ((e.onclick = function () {
      (t.style.display = 'flex'), (t.style.opacity = '1');
    }),
    (o.onclick = function () {
      (t.style.display = 'none'), (t.style.opacity = '0');
    }),
    (n.onclick = function () {
      (t.style.display = 'none'), (t.style.opacity = '0');
    }),
    (t.onclick = function (e) {
      e.target === t && ((t.style.display = 'none'), (t.style.opacity = '0'));
    }),
    (document.onkeydown = function (e) {
      'Escape' === e.key &&
        'flex' === t.style.display &&
        ((t.style.display = 'none'), (t.style.opacity = '0'));
    }));
}
