import config from './config.js';

class NotesManager {
  constructor() {
    this.autoSaveTimeout = null;
    this.initializeElements();
    this.initializeEventListeners();
  }

  initializeElements() {
    this.notesHeader = document.querySelector('.notes-header');
    this.notesModal = document.querySelector('.notes-modal');
    this.modalOverlay = document.querySelector('.modal-overlay');
    this.modalClose = document.querySelector('.notes-modal-close');
    this.saveNotesBtn = document.querySelector('.save-notes-btn');
    this.quickNotes = document.querySelector('.quick-notes');
    this.detailedNotes = document.querySelector('.detailed-notes');
    this.exportBtn = document.createElement('button');
    this.exportBtn.className = 'export-notes-btn';
    this.exportBtn.textContent = 'Export Notes';
  }

  initializeEventListeners() {
    if (
      this.notesHeader &&
      this.notesModal &&
      this.modalOverlay &&
      this.modalClose &&
      this.saveNotesBtn
    ) {
      // Open modal
      this.notesHeader.addEventListener('click', () => this.openModal());

      // Close modal
      this.modalClose.addEventListener('click', () => this.closeModal());
      this.modalOverlay.addEventListener('click', () => this.closeModal());

      // Escape key to close modal
      document.addEventListener('keydown', (e) => {
        if (
          e.key === 'Escape' &&
          this.notesModal.classList.contains('expanded')
        ) {
          this.closeModal();
        }
      });

      // Auto-save functionality
      this.quickNotes.addEventListener('input', () => this.autoSave());
      this.detailedNotes.addEventListener('input', () => this.autoSave());

      // Save notes button
      this.saveNotesBtn.addEventListener('click', () => this.saveNotes());

      // Export notes button
      this.exportBtn.addEventListener('click', () => this.exportNotes());
      this.saveNotesBtn.parentElement.appendChild(this.exportBtn);
    }
  }

  openModal() {
    this.notesModal.classList.add('expanded');
    this.modalOverlay.classList.add('expanded');
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.notesModal.classList.remove('expanded');
    this.modalOverlay.classList.remove('expanded');
    document.body.style.overflow = '';
  }

  async loadSavedNotes(topicName) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log('No authenticated user found');
        return;
      }

      const { data, error } = await supabase
        .from('user_notes')
        .select('quick_notes, detailed_notes')
        .eq('user_id', user.id)
        .eq('topic', topicName)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        this.quickNotes.value = data.quick_notes || '';
        this.detailedNotes.value = data.detailed_notes || '';
      }
    } catch (error) {
      console.error('Error loading saved notes:', error);
      this.showError('Failed to load notes. Please try again.');
    }
  }

  async saveNotes() {
    try {
      this.saveNotesBtn.disabled = true;
      this.saveNotesBtn.textContent = 'Saving...';

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Please log in to save notes');
      }

      const quickNotesValue = this.quickNotes.value.trim();
      const detailedNotesValue = this.detailedNotes.value.trim();

      // Validate note lengths
      if (quickNotesValue.length > config.notes.maxLength.quick) {
        throw new Error(
          `Quick notes cannot exceed ${config.notes.maxLength.quick} characters`
        );
      }
      if (detailedNotesValue.length > config.notes.maxLength.detailed) {
        throw new Error(
          `Detailed notes cannot exceed ${config.notes.maxLength.detailed} characters`
        );
      }

      // Check if notes exist
      const { data, error: checkError } = await supabase
        .from('user_notes')
        .select('id')
        .eq('user_id', user.id)
        .eq('topic', topicName)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (data) {
        // Update existing notes
        const { error: updateError } = await supabase
          .from('user_notes')
          .update({
            quick_notes: quickNotesValue,
            detailed_notes: detailedNotesValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);

        if (updateError) throw updateError;
      } else {
        // Insert new notes
        const { error: insertError } = await supabase
          .from('user_notes')
          .insert([
            {
              user_id: user.id,
              topic: topicName,
              quick_notes: quickNotesValue,
              detailed_notes: detailedNotesValue,
              updated_at: new Date().toISOString(),
            },
          ]);

        if (insertError) throw insertError;
      }

      this.showSuccess('Notes saved successfully!');
    } catch (error) {
      console.error('Error saving notes:', error);
      this.showError(
        error.message || 'Failed to save notes. Please try again.'
      );
    } finally {
      this.saveNotesBtn.disabled = false;
      this.saveNotesBtn.textContent = 'Save Notes';
    }
  }

  autoSave() {
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.saveNotes();
    }, config.notes.autoSaveDelay);
  }

  exportNotes() {
    const notes = {
      quickNotes: this.quickNotes.value,
      detailedNotes: this.detailedNotes.value,
      topic: topicName,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(notes, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${topicName}-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showSuccess(message) {
    const successMsg = document.createElement('div');
    successMsg.className = 'save-success';
    successMsg.textContent = message;
    successMsg.style.color = '#00C46F';
    successMsg.style.marginTop = '10px';
    successMsg.style.textAlign = 'center';

    const actionsContainer = this.saveNotesBtn.parentElement;
    actionsContainer.appendChild(successMsg);

    setTimeout(() => {
      successMsg.remove();
    }, 3000);
  }

  showError(message) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'save-error';
    errorMsg.textContent = message;
    errorMsg.style.color = '#ff4444';
    errorMsg.style.marginTop = '10px';
    errorMsg.style.textAlign = 'center';

    const actionsContainer = this.saveNotesBtn.parentElement;
    actionsContainer.appendChild(errorMsg);

    setTimeout(() => {
      errorMsg.remove();
    }, 3000);
  }
}

export default NotesManager;
