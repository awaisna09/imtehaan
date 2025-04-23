export class StudyTimer {
  constructor() {
    (this.startTime = null),
      (this.elapsedTime = 0),
      (this.isRunning = !1),
      (this.timerInterval = null),
      (this.dailyGoal = 60),
      (this.today = new Date().toISOString().split('T')[0]),
      this.initializeTimer(),
      this.start();
  }
  initializeTimer() {
    const t = localStorage.getItem('timerData');
    if (t) {
      const { elapsedTime: e, lastDate: a } = JSON.parse(t);
      a === this.today && (this.elapsedTime = e);
    }
    const e = localStorage.getItem('studyTime');
    e && (this.dailyGoal = parseInt(e)), this.updateDisplay();
  }
  start() {
    this.isRunning ||
      ((this.startTime = Date.now() - this.elapsedTime),
      (this.isRunning = !0),
      (this.timerInterval = setInterval(() => this.update(), 1e3)),
      this.saveTimerData());
  }
  stop() {
    this.isRunning &&
      (clearInterval(this.timerInterval),
      (this.isRunning = !1),
      this.saveTimerData());
  }
  update() {
    (this.elapsedTime = Date.now() - this.startTime),
      this.updateDisplay(),
      this.saveTimerData();
  }
  updateDisplay() {
    const t = Math.floor(this.elapsedTime / 6e4),
      e = Math.floor((this.elapsedTime % 6e4) / 1e3),
      a = document.getElementById('timerDisplay');
    a &&
      (a.textContent = `${t.toString().padStart(2, '0')}:${e.toString().padStart(2, '0')}`);
    const i = document.querySelector('#studyProgress .progress-fill'),
      s = document.querySelector('#studyProgress + .progress-text');
    if (i && s) {
      const e = Math.min((t / this.dailyGoal) * 100, 100);
      (i.style.width = `${e}%`),
        (s.textContent = `${t}/${this.dailyGoal} minutes`);
    }
    this.updateChartData(t);
  }
  saveTimerData() {
    const t = { elapsedTime: this.elapsedTime, lastDate: this.today };
    localStorage.setItem('timerData', JSON.stringify(t));
  }
  updateChartData(t) {
    let e = JSON.parse(localStorage.getItem('studyChartData') || '[]');
    const a = e.findIndex((t) => t.date === this.today);
    -1 === a ? e.push({ date: this.today, minutes: t }) : (e[a].minutes = t),
      e.length > 7 && (e = e.slice(-7)),
      localStorage.setItem('studyChartData', JSON.stringify(e));
  }
  setDailyGoal(t) {
    (this.dailyGoal = t), this.updateDisplay();
  }
  saveState() {
    this.stop(), this.saveTimerData();
  }
}
