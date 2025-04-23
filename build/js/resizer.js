document.addEventListener('DOMContentLoaded', function () {
  const e = document.querySelector('.resizer'),
    t = document.querySelector('.chat-interface');
  let n,
    o,
    d = !1;
  function s(e) {
    if (!d) return;
    const s = o - (e.clientX - n);
    s > 200 && s < 800 && (t.style.width = `${s}px`);
  }
  function u() {
    (d = !1),
      document.body.classList.remove('resizing'),
      document.removeEventListener('mousemove', s),
      document.removeEventListener('mouseup', u);
  }
  e.addEventListener('mousedown', function (e) {
    (d = !0),
      (n = e.clientX),
      (o = parseInt(getComputedStyle(t).width, 10)),
      document.addEventListener('mousemove', s),
      document.addEventListener('mouseup', u),
      document.body.classList.add('resizing');
  });
});
