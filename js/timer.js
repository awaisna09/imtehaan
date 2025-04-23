// Study Timer functionality
export class StudyTimer {
  constructor() {
    this.startTime = null;
    this.elapsedTime = 0;
    this.isRunning = false;
    this.timerInterval = null;
    this.dailyGoal = 60; // Default 60 minutes
    this.today = new Date().toISOString().split('T')[0];
    this.initializeTimer();
    this.start(); // Automatically start the timer
  }

  initializeTimer() {
    // Load saved timer data from localStorage
    const savedTimerData = localStorage.getItem('timerData');
    if (savedTimerData) {
      const { elapsedTime, lastDate } = JSON.parse(savedTimerData);
      if (lastDate === this.today) {
        this.elapsedTime = elapsedTime;
      }
    }

    // Load daily goal from localStorage
    const savedGoal = localStorage.getItem('studyTime');
    if (savedGoal) {
      this.dailyGoal = parseInt(savedGoal);
    }

    // Update the display
    this.updateDisplay();
  }

  start() {
    if (!this.isRunning) {
      this.startTime = Date.now() - this.elapsedTime;
      this.isRunning = true;
      this.timerInterval = setInterval(() => this.update(), 1000);
      this.saveTimerData();
    }
  }

  stop() {
    if (this.isRunning) {
      clearInterval(this.timerInterval);
      this.isRunning = false;
      this.saveTimerData();
    }
  }

  update() {
    this.elapsedTime = Date.now() - this.startTime;
    this.updateDisplay();
    this.saveTimerData();
  }

  updateDisplay() {
    const minutes = Math.floor(this.elapsedTime / 60000);
    const seconds = Math.floor((this.elapsedTime % 60000) / 1000);

    // Update the timer display
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Update the progress bar
    const progressFill = document.querySelector(
      '#studyProgress .progress-fill'
    );
    const progressText = document.querySelector(
      '#studyProgress + .progress-text'
    );
    if (progressFill && progressText) {
      const progressPercentage = Math.min(
        (minutes / this.dailyGoal) * 100,
        100
      );
      progressFill.style.width = `${progressPercentage}%`;
      progressText.textContent = `${minutes}/${this.dailyGoal} minutes`;
    }

    // Update the chart data
    this.updateChartData(minutes);
  }

  saveTimerData() {
    const timerData = {
      elapsedTime: this.elapsedTime,
      lastDate: this.today,
    };
    localStorage.setItem('timerData', JSON.stringify(timerData));
  }

  updateChartData(minutes) {
    // Get existing chart data
    let chartData = JSON.parse(localStorage.getItem('studyChartData') || '[]');

    // Find today's entry
    const todayIndex = chartData.findIndex(
      (entry) => entry.date === this.today
    );

    if (todayIndex === -1) {
      // Add new entry for today
      chartData.push({
        date: this.today,
        minutes: minutes,
      });
    } else {
      // Update today's entry
      chartData[todayIndex].minutes = minutes;
    }

    // Keep only last 7 days
    if (chartData.length > 7) {
      chartData = chartData.slice(-7);
    }

    localStorage.setItem('studyChartData', JSON.stringify(chartData));
  }

  setDailyGoal(minutes) {
    this.dailyGoal = minutes;
    this.updateDisplay();
  }

  // Save timer state before page unload
  saveState() {
    this.stop();
    this.saveTimerData();
  }
}
