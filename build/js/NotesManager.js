import config from './config.js';
class NotesManager {
  constructor() {
    (this.autoSaveTimeout = null),
      this.initializeElements(),
      this.initializeEventListeners();
  }
  initializeElements() {
    (this.notesHeader = document.querySelector('.notes-header')),
      (this.notesModal = document.querySelector('.notes-modal')),
      (this.modalOverlay = document.querySelector('.modal-overlay')),
      (this.modalClose = document.querySelector('.notes-modal-close')),
      (this.saveNotesBtn = document.querySelector('.save-notes-btn')),
      (this.quickNotes = document.querySelector('.quick-notes')),
      (this.detailedNotes = document.querySelector('.detailed-notes')),
      (this.exportBtn = document.createElement('button')),
      (this.exportBtn.className = 'export-notes-btn'),
      (this.exportBtn.textContent = 'Export Notes');
  }
  initializeEventListeners() {
    this.notesHeader &&
      this.notesModal &&
      this.modalOverlay &&
      this.modalClose &&
      this.saveNotesBtn &&
      (this.notesHeader.addEventListener('click', () => this.openModal()),
      this.modalClose.addEventListener('click', () => this.closeModal()),
      this.modalOverlay.addEventListener('click', () => this.closeModal()),
      document.addEventListener('keydown', (e) => {
        'Escape' === e.key &&
          this.notesModal.classList.contains('expanded') &&
          this.closeModal();
      }),
      this.quickNotes.addEventListener('input', () => this.autoSave()),
      this.detailedNotes.addEventListener('input', () => this.autoSave()),
      this.saveNotesBtn.addEventListener('click', () => this.saveNotes()),
      this.exportBtn.addEventListener('click', () => this.exportNotes()),
      this.saveNotesBtn.parentElement.appendChild(this.exportBtn));
  }
  openModal() {
    this.notesModal.classList.add('expanded'),
      this.modalOverlay.classList.add('expanded'),
      (document.body.style.overflow = 'hidden');
  }
  closeModal() {
    this.notesModal.classList.remove('expanded'),
      this.modalOverlay.classList.remove('expanded'),
      (document.body.style.overflow = '');
  }
  async loadSavedNotes(e) {
    try {
      const {
        data: { user: t },
      } = await supabase.auth.getUser();
      if (!t) return;
      const { data: s, error: o } = await supabase
        .from('user_notes')
        .select('quick_notes, detailed_notes')
        .eq('user_id', t.id)
        .eq('topic', e)
        .single();
      if (o && 'PGRST116' !== o.code) throw o;
      s &&
        ((this.quickNotes.value = s.quick_notes || ''),
        (this.detailedNotes.value = s.detailed_notes || ''));
    } catch (e) {
      this.showError('Failed to load notes. Please try again.');
    }
  }
  async saveNotes() {
    try {
      (this.saveNotesBtn.disabled = !0),
        (this.saveNotesBtn.textContent = 'Saving...');
      const {
        data: { user: e },
      } = await supabase.auth.getUser();
      if (!e) throw new Error('Please log in to save notes');
      const t = this.quickNotes.value.trim(),
        s = this.detailedNotes.value.trim();
      if (t.length > config.notes.maxLength.quick)
        throw new Error(
          `Quick notes cannot exceed ${config.notes.maxLength.quick} characters`
        );
      if (s.length > config.notes.maxLength.detailed)
        throw new Error(
          `Detailed notes cannot exceed ${config.notes.maxLength.detailed} characters`
        );
      const { data: o, error: a } = await supabase
        .from('user_notes')
        .select('id')
        .eq('user_id', e.id)
        .eq('topic', topicName)
        .single();
      if (a && 'PGRST116' !== a.code) throw a;
      if (o) {
        const { error: e } = await supabase
          .from('user_notes')
          .update({
            quick_notes: t,
            detailed_notes: s,
            updated_at: new Date().toISOString(),
          })
          .eq('id', o.id);
        if (e) throw e;
      } else {
        const { error: o } = await supabase
          .from('user_notes')
          .insert([
            {
              user_id: e.id,
              topic: topicName,
              quick_notes: t,
              detailed_notes: s,
              updated_at: new Date().toISOString(),
            },
          ]);
        if (o) throw o;
      }
      this.showSuccess('Notes saved successfully!');
    } catch (e) {
      this.showError(e.message || 'Failed to save notes. Please try again.');
    } finally {
      (this.saveNotesBtn.disabled = !1),
        (this.saveNotesBtn.textContent = 'Save Notes');
    }
  }
  autoSave() {
    clearTimeout(this.autoSaveTimeout),
      (this.autoSaveTimeout = setTimeout(() => {
        this.saveNotes();
      }, config.notes.autoSaveDelay));
  }
  exportNotes() {
    const e = {
        quickNotes: this.quickNotes.value,
        detailedNotes: this.detailedNotes.value,
        topic: topicName,
        timestamp: new Date().toISOString(),
      },
      t = new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' }),
      s = URL.createObjectURL(t),
      o = document.createElement('a');
    (o.href = s),
      (o.download = `notes-${topicName}-${new Date().toISOString()}.json`),
      o.click(),
      URL.revokeObjectURL(s);
  }
  showSuccess(e) {
    const t = document.createElement('div');
    (t.className = 'save-success'),
      (t.textContent = e),
      (t.style.color = '#00C46F'),
      (t.style.marginTop = '10px'),
      (t.style.textAlign = 'center');
    this.saveNotesBtn.parentElement.appendChild(t),
      setTimeout(() => {
        t.remove();
      }, 3e3);
  }
  showError(e) {
    const t = document.createElement('div');
    (t.className = 'save-error'),
      (t.textContent = e),
      (t.style.color = '#ff4444'),
      (t.style.marginTop = '10px'),
      (t.style.textAlign = 'center');
    this.saveNotesBtn.parentElement.appendChild(t),
      setTimeout(() => {
        t.remove();
      }, 3e3);
  }
}
export default NotesManager;
