// Import Supabase client from config
import { supabase } from './supabase-config.js';

// Initialize page elements
const initializeScorePage = () => {
  // Home button functionality
  const homeBtn = document.querySelector('.home-btn');
  homeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Form elements
  const submitBtn = document.querySelector('.submit-btn');
  const formSection = document.querySelector('.form-section');
  const loadingSpinner = document.querySelector('.loading-spinner');
  const statusMessage = document.querySelector('.status-message');
  const inputs = formSection.querySelectorAll('.form-input, .form-textarea');

  // Form validation
  const validateForm = () => {
    let isValid = true;
    inputs.forEach((input) => {
      const validationMessage = input.nextElementSibling;
      if (!input.value.trim()) {
        validationMessage.textContent = 'This field is required';
        isValid = false;
      } else if (input.type === 'email' && !validateEmail(input.value)) {
        validationMessage.textContent = 'Please enter a valid email';
        isValid = false;
      } else if (input.id === 'contact' && !validatePhone(input.value)) {
        validationMessage.textContent = 'Please enter a valid phone number';
        isValid = false;
      } else {
        validationMessage.textContent = '';
      }
    });
    return isValid;
  };

  // Email validation
  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Phone validation
  const validatePhone = (phone) => {
    return /^[+]?[0-9]{10,}$/.test(phone.replace(/[\s-]/g, ''));
  };

  // Form submission handler
  submitBtn.addEventListener('click', async () => {
    try {
      if (!validateForm()) {
        return;
      }

      // Check internet connection
      if (!navigator.onLine) {
        throw new Error('No internet connection');
      }

      // Show loading state
      loadingSpinner.classList.remove('hidden');
      statusMessage.textContent = 'Submitting...';
      statusMessage.style.color = '#00E67F';

      // Get form values
      const firstName = document.getElementById('firstName').value;
      const lastName = document.getElementById('lastName').value;
      const email = document.getElementById('email').value;
      const contact = document.getElementById('contact').value;
      const remark = document.getElementById('message').value;

      // Disable submit button while processing
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      // Test connection first
      const { data: testData, error: testError } = await supabase
        .from('recommendations')
        .select('count')
        .limit(1);

      if (testError) {
        console.error('Connection test failed:', testError);
        throw new Error('Unable to connect to the database');
      }

      // Insert data
      const { data, error } = await supabase
        .from('recommendations')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email,
          contact: contact,
          remarks: remark,
        })
        .select();

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      // Success state
      loadingSpinner.classList.add('hidden');
      statusMessage.textContent = 'Thank you for your feedback!';
      statusMessage.style.color = '#00E67F';

      // Clear form inputs and validation messages
      inputs.forEach((input) => (input.value = ''));
      document
        .querySelectorAll('.validation-message')
        .forEach((msg) => (msg.textContent = ''));
    } catch (error) {
      console.error('Error:', error);
      loadingSpinner.classList.add('hidden');
      statusMessage.style.color = '#ff4444';
      if (error.message === 'No internet connection') {
        statusMessage.textContent =
          'Please check your internet connection and try again.';
      } else if (error.message === 'Unable to connect to the database') {
        statusMessage.textContent =
          'Unable to connect to the database. Please try again later.';
      } else {
        statusMessage.textContent = 'An error occurred. Please try again.';
      }
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT';
    }
  });
};

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeScorePage);
