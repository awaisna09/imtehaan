import { supabase } from './supabase-config.js';
const initializeScorePage = () => {
  document.querySelector('.home-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  const e = document.querySelector('.submit-btn'),
    t = document.querySelector('.form-section'),
    n = document.querySelector('.loading-spinner'),
    a = document.querySelector('.status-message'),
    o = t.querySelectorAll('.form-input, .form-textarea'),
    r = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    i = (e) => /^[+]?[0-9]{10,}$/.test(e.replace(/[\s-]/g, ''));
  e.addEventListener('click', async () => {
    try {
      if (
        !(() => {
          let e = !0;
          return (
            o.forEach((t) => {
              const n = t.nextElementSibling;
              t.value.trim()
                ? 'email' !== t.type || r(t.value)
                  ? 'contact' !== t.id || i(t.value)
                    ? (n.textContent = '')
                    : ((n.textContent = 'Please enter a valid phone number'),
                      (e = !1))
                  : ((n.textContent = 'Please enter a valid email'), (e = !1))
                : ((n.textContent = 'This field is required'), (e = !1));
            }),
            e
          );
        })()
      )
        return;
      if (!navigator.onLine) throw new Error('No internet connection');
      n.classList.remove('hidden'),
        (a.textContent = 'Submitting...'),
        (a.style.color = '#00E67F');
      const t = document.getElementById('firstName').value,
        c = document.getElementById('lastName').value,
        s = document.getElementById('email').value,
        l = document.getElementById('contact').value,
        d = document.getElementById('message').value;
      (e.disabled = !0), (e.textContent = 'Submitting...');
      const { data: m, error: u } = await supabase
        .from('recommendations')
        .select('count')
        .limit(1);
      if (u) throw new Error('Unable to connect to the database');
      const { data: y, error: f } = await supabase
        .from('recommendations')
        .insert({
          first_name: t,
          last_name: c,
          email: s,
          contact: l,
          remarks: d,
        })
        .select();
      if (f) throw f;
      n.classList.add('hidden'),
        (a.textContent = 'Thank you for your feedback!'),
        (a.style.color = '#00E67F'),
        o.forEach((e) => (e.value = '')),
        document
          .querySelectorAll('.validation-message')
          .forEach((e) => (e.textContent = ''));
    } catch (e) {
      n.classList.add('hidden'),
        (a.style.color = '#ff4444'),
        'No internet connection' === e.message
          ? (a.textContent =
              'Please check your internet connection and try again.')
          : 'Unable to connect to the database' === e.message
            ? (a.textContent =
                'Unable to connect to the database. Please try again later.')
            : (a.textContent = 'An error occurred. Please try again.');
    } finally {
      (e.disabled = !1), (e.textContent = 'SUBMIT');
    }
  });
};
document.addEventListener('DOMContentLoaded', initializeScorePage);
