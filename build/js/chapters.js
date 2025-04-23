function createChapterCard(e) {
  const t = document.createElement('a');
  return (
    (t.href = `topics.html?chapter=${encodeURIComponent(e.name)}`),
    (t.className = 'chapter-card'),
    t.setAttribute('role', 'listitem'),
    t.setAttribute('aria-label', `${e.name} chapter`),
    (t.innerHTML = `\n        <div class="chapter-content">\n            <div class="chapter-header">\n                <h3 class="chapter-title">${e.name}</h3>\n            </div>\n            <p class="chapter-subtitle">${e.description}</p>\n        </div>\n    `),
    t
  );
}
async function updateCourseProgress() {
  document.getElementById('progressContainer');
  const e = document.getElementById('progressBar'),
    t = document.getElementById('progressText'),
    n = document.getElementById('progressSpinner'),
    r = document.getElementById('progressError');
  try {
    (n.style.display = 'block'), (a.style.display = 'none');
    const { data: r, error: a } = await supabase
      .from('user_progress')
      .select('overall_progress')
      .single();
    if (a) throw a;
    const s = r?.overall_progress || 0;
    (e.style.width = `${s}%`), (t.textContent = `${s}% Complete`);
  } catch (e) {
    r.style.display = 'block';
  } finally {
    n.style.display = 'none';
  }
}
async function loadChapters() {
  const e = document.getElementById('chaptersLoadingSpinner'),
    t = document.getElementById('chaptersError'),
    n = document.getElementById('chaptersList');
  try {
    (e.style.display = 'block'), (t.style.display = 'none'), (n.innerHTML = '');
    const { data: r, error: a } = await supabase
      .from('final_topics')
      .select('name')
      .order('name');
    if (a) throw a;
    if (!r || 0 === r.length) throw new Error('No chapters found');
    [...new Set(r.map((e) => e.name))].forEach((e) => {
      const t = createChapterCard({ name: e, description: 'Chapter content' });
      n.appendChild(t);
    });
  } catch (e) {
    (t.style.display = 'block'),
      (t.textContent = e.message || 'Failed to load chapters');
  } finally {
    e.style.display = 'none';
  }
}
document.addEventListener('DOMContentLoaded', () => {
  updateCourseProgress(), loadChapters();
});
