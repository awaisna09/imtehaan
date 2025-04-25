import { initializeMenu } from './menu.js';
import { StudyTimer } from './timer.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  // Initialize menu
  initializeMenu();

  // Initialize the study timer
  const studyTimer = new StudyTimer();

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      studyTimer.saveState();
    } else {
      studyTimer.start();
    }
  });

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    studyTimer.saveState();
  });

  // Timer controls
  const startTimerBtn = document.getElementById('startTimer');
  const pauseTimerBtn = document.getElementById('pauseTimer');
  const resetTimerBtn = document.getElementById('resetTimer');
  const timerDisplay = document.getElementById('timerDisplay');

  startTimerBtn.addEventListener('click', () => {
    studyTimer.start();
    timerDisplay.classList.add('running');
    startTimerBtn.disabled = true;
    pauseTimerBtn.disabled = false;
  });

  pauseTimerBtn.addEventListener('click', () => {
    studyTimer.pause();
    timerDisplay.classList.remove('running');
    startTimerBtn.disabled = false;
    pauseTimerBtn.disabled = true;
  });

  resetTimerBtn.addEventListener('click', () => {
    studyTimer.reset();
    timerDisplay.classList.remove('running');
    startTimerBtn.disabled = false;
    pauseTimerBtn.disabled = true;
  });

  // Study goals
  const studyTimeInput = document.getElementById('studyTime');
  const setGoalsBtn = document.getElementById('setGoals');

  setGoalsBtn.addEventListener('click', () => {
    const studyTime = parseInt(studyTimeInput.value);
    if (studyTime > 0) {
      studyTimer.setDailyGoal(studyTime);
      localStorage.setItem('studyTime', studyTime);
      updateProgressBars();
    }
  });

  // Exam countdown
  const examDateInput = document.getElementById('examDate');
  const setExamDateBtn = document.getElementById('setExamDate');
  const daysLeftDisplay = document.getElementById('daysLeft');

  setExamDateBtn.addEventListener('click', () => {
    const examDate = new Date(examDateInput.value);
    if (examDate && examDate > new Date()) {
      localStorage.setItem('examDate', examDateInput.value);
      updateCountdown();
    }
  });

  function updateCountdown() {
    const savedExamDate = localStorage.getItem('examDate');
    if (savedExamDate) {
      const examDate = new Date(savedExamDate);
      const today = new Date();
      const diffTime = examDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysLeftDisplay.textContent = diffDays;
    }
  }

  // Initialize charts
  initializeCharts();

  // Set up event listeners
  setupEventListeners();

  // Load user's progress data
  loadProgressData();

  // Calculate days until exam
  updateExamCountdown();

  // Load existing goals and start tracking if they exist
  const goals = JSON.parse(localStorage.getItem('studyGoals') || '{}');
  if (goals.startTime) {
    updateProgressDisplays();
    startProgressTracking();
  }
});

function initializeCharts() {
  console.log('Initializing charts...');

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#FFFFFF',
        },
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#FFFFFF',
        },
      },
    },
  };

  // Time Spent Chart
  const timeCtx = document.getElementById('timeChart');
  console.log('Time chart context:', timeCtx);
  if (timeCtx) {
    try {
      new Chart(timeCtx, {
        type: 'line',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              label: 'Minutes',
              data: [45, 60, 30, 75, 90, 45, 60],
              borderColor: '#4CAF50',
              backgroundColor: 'rgba(76, 175, 80, 0.1)',
              tension: 0.4,
              fill: true,
              borderWidth: 2,
            },
          ],
        },
        options: commonOptions,
      });
      console.log('Time chart created successfully');
    } catch (error) {
      console.error('Error creating time chart:', error);
    }
  }

  // Questions Completed Chart
  const questionsCtx = document.getElementById('questionsChart');
  console.log('Questions chart context:', questionsCtx);
  if (questionsCtx) {
    try {
      new Chart(questionsCtx, {
        type: 'bar',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              label: 'Questions',
              data: [8, 12, 6, 15, 10, 7, 9],
              backgroundColor: 'rgba(76, 175, 80, 0.8)',
              borderColor: '#4CAF50',
              borderWidth: 1,
              borderRadius: 5,
            },
          ],
        },
        options: commonOptions,
      });
      console.log('Questions chart created successfully');
    } catch (error) {
      console.error('Error creating questions chart:', error);
    }
  }

  // Typing Activity Chart
  const typingCtx = document.getElementById('typingChart');
  console.log('Typing chart context:', typingCtx);
  if (typingCtx) {
    try {
      new Chart(typingCtx, {
        type: 'line',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              label: 'Keystrokes',
              data: [1200, 1500, 800, 2000, 1800, 1000, 1400],
              borderColor: '#4CAF50',
              backgroundColor: 'rgba(76, 175, 80, 0.1)',
              tension: 0.4,
              fill: true,
              borderWidth: 2,
            },
          ],
        },
        options: commonOptions,
      });
      console.log('Typing chart created successfully');
    } catch (error) {
      console.error('Error creating typing chart:', error);
    }
  }
}

function setupEventListeners() {
  // Goal setting
  const setGoalsBtn = document.getElementById('setGoals');
  setGoalsBtn.addEventListener('click', () => {
    const studyTime = parseInt(document.getElementById('studyTime').value);
    const questionsGoal = parseInt(
      document.getElementById('questionsGoal').value
    );

    // Save goals to localStorage
    localStorage.setItem(
      'studyGoals',
      JSON.stringify({
        studyTime,
        questionsGoal,
        startTime: new Date().toISOString(),
        completedQuestions: 0,
        timeSpent: 0,
      })
    );

    // Update progress displays
    updateProgressDisplays();

    // Start tracking progress
    startProgressTracking();

    // Show success message with animation
    showSuccessMessage('Goals set successfully!');
  });

  // Exam date setting
  const setExamDateBtn = document.getElementById('setExamDate');
  setExamDateBtn.addEventListener('click', () => {
    const examDateInput = document.getElementById('examDate');
    const examDate = new Date(examDateInput.value);

    if (isNaN(examDate.getTime())) {
      showSuccessMessage('Please select a valid date', 'error');
      return;
    }

    // Save exam date to localStorage
    localStorage.setItem('examDate', examDate.toISOString());

    // Update countdown
    updateExamCountdown();

    // Show success message
    showSuccessMessage('Exam date set successfully!');
  });

  // Study plan buttons
  const planButtons = document.querySelectorAll('.plan-button');
  planButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const planType = button.dataset.plan;
      generateStudyPlan(planType);
    });
  });
}

function loadProgressData() {
  // Load saved goals
  const savedGoals = localStorage.getItem('studyGoals');
  if (savedGoals) {
    const goals = JSON.parse(savedGoals);
    document.getElementById('studyTime').value = goals.studyTime;
    document.getElementById('questionsGoal').value = goals.questionsGoal;
  }
}

function updateExamCountdown() {
  const savedExamDate = localStorage.getItem('examDate');
  if (!savedExamDate) {
    // Set default date if none is set
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30); // 30 days from now
    localStorage.setItem('examDate', defaultDate.toISOString());
  }

  const examDate = new Date(savedExamDate || localStorage.getItem('examDate'));
  const today = new Date();

  // Set the date input value
  document.getElementById('examDate').value = examDate
    .toISOString()
    .split('T')[0];

  // Calculate days difference
  const diffTime = examDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Update display
  const daysLeftElement = document.getElementById('daysLeft');
  daysLeftElement.textContent = diffDays;

  // Add warning class if less than 7 days
  if (diffDays <= 7) {
    daysLeftElement.classList.add('warning');
  } else {
    daysLeftElement.classList.remove('warning');
  }
}

function generateStudyPlan(planType) {
  const planDetails = document.getElementById('planDetails');
  let planContent = '';

  switch (planType) {
    case 'intensive':
      planContent = `
                <h3>Intensive Study Plan</h3>
                <ul>
                    <li>2+ hours of focused study daily</li>
                    <li>Complete 20+ questions per day</li>
                    <li>Review all topics weekly</li>
                    <li>Take practice tests every weekend</li>
                </ul>
            `;
      break;
    case 'moderate':
      planContent = `
                <h3>Moderate Study Plan</h3>
                <ul>
                    <li>1-2 hours of focused study daily</li>
                    <li>Complete 10-15 questions per day</li>
                    <li>Review topics bi-weekly</li>
                    <li>Take practice tests every other weekend</li>
                </ul>
            `;
      break;
    case 'light':
      planContent = `
                <h3>Light Study Plan</h3>
                <ul>
                    <li>30-60 minutes of focused study daily</li>
                    <li>Complete 5-10 questions per day</li>
                    <li>Review topics monthly</li>
                    <li>Take practice tests monthly</li>
                </ul>
            `;
      break;
  }

  planDetails.innerHTML = planContent;
}

// Track user activity
let typingCount = 0;
let timeSpent = 0;
let questionsCompleted = 0;

// Track typing activity
document.addEventListener('keydown', () => {
  typingCount++;
  // Update typing chart data
  updateChartData('typingChart', typingCount);
});

// Track time spent
setInterval(() => {
  timeSpent++;
  // Update time chart data
  updateChartData('timeChart', timeSpent);
}, 60000); // Update every minute

function updateChartData(chartId, newData) {
  // This would typically update the backend
  // For now, we'll just update the local chart
  const chart = Chart.getChart(chartId);
  if (chart) {
    chart.data.datasets[0].data.push(newData);
    chart.data.labels.push(new Date().toLocaleTimeString());
    chart.update();
  }
}

function updateProgressDisplays() {
  const goals = JSON.parse(localStorage.getItem('studyGoals') || '{}');
  if (!goals.studyTime || !goals.questionsGoal) return;

  const studyProgress = document.querySelector('#studyProgress .progress-fill');
  const questionsProgress = document.querySelector(
    '#questionsProgress .progress-fill'
  );
  const studyText = document.querySelector('#studyProgress').nextElementSibling;
  const questionsText =
    document.querySelector('#questionsProgress').nextElementSibling;

  // Update progress bars
  const studyPercentage = Math.min(
    (goals.timeSpent / goals.studyTime) * 100,
    100
  );
  const questionsPercentage = Math.min(
    (goals.completedQuestions / goals.questionsGoal) * 100,
    100
  );

  studyProgress.style.width = `${studyPercentage}%`;
  questionsProgress.style.width = `${questionsPercentage}%`;

  // Update text
  studyText.textContent = `${Math.floor(goals.timeSpent)}/${goals.studyTime} minutes`;
  questionsText.textContent = `${goals.completedQuestions}/${goals.questionsGoal} questions`;

  // Add completion animation if goals are met
  if (studyPercentage >= 100) {
    studyProgress.classList.add('completed');
  }
  if (questionsPercentage >= 100) {
    questionsProgress.classList.add('completed');
  }
}

function startProgressTracking() {
  // Clear any existing intervals
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }

  // Start tracking time
  window.progressInterval = setInterval(() => {
    const goals = JSON.parse(localStorage.getItem('studyGoals') || '{}');
    if (!goals.startTime) return;

    // Update time spent
    goals.timeSpent = Math.floor(
      (new Date() - new Date(goals.startTime)) / 60000
    ); // Convert to minutes
    localStorage.setItem('studyGoals', JSON.stringify(goals));

    // Update displays
    updateProgressDisplays();
  }, 60000); // Update every minute
}

function showSuccessMessage(message, type = 'success') {
  const successMessage = document.createElement('div');
  successMessage.className = `success-message ${type}`;
  successMessage.textContent = message;
  document.body.appendChild(successMessage);

  // Animate in
  setTimeout(() => {
    successMessage.classList.add('show');
  }, 100);

  // Remove after animation
  setTimeout(() => {
    successMessage.classList.remove('show');
    setTimeout(() => {
      successMessage.remove();
    }, 300);
  }, 3000);
}
