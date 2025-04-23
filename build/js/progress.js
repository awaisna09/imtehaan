import { initializeMenu } from './menu.js';
import { StudyTimer } from './timer.js';
function initializeCharts() {
  const e = {
      responsive: !0,
      maintainAspectRatio: !1,
      plugins: { legend: { display: !1 } },
      scales: {
        y: {
          beginAtZero: !0,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#FFFFFF' },
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#FFFFFF' },
        },
      },
    },
    t = document.getElementById('timeChart');
  if (t)
    try {
      new Chart(t, {
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
              fill: !0,
              borderWidth: 2,
            },
          ],
        },
        options: e,
      });
    } catch (e) {}
  const s = document.getElementById('questionsChart');
  if (s)
    try {
      new Chart(s, {
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
        options: e,
      });
    } catch (e) {}
  const n = document.getElementById('typingChart');
  if (n)
    try {
      new Chart(n, {
        type: 'line',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [
            {
              label: 'Keystrokes',
              data: [1200, 1500, 800, 2e3, 1800, 1e3, 1400],
              borderColor: '#4CAF50',
              backgroundColor: 'rgba(76, 175, 80, 0.1)',
              tension: 0.4,
              fill: !0,
              borderWidth: 2,
            },
          ],
        },
        options: e,
      });
    } catch (e) {}
}
function setupEventListeners() {
  document.getElementById('setGoals').addEventListener('click', () => {
    const e = parseInt(document.getElementById('studyTime').value),
      t = parseInt(document.getElementById('questionsGoal').value);
    localStorage.setItem(
      'studyGoals',
      JSON.stringify({
        studyTime: e,
        questionsGoal: t,
        startTime: new Date().toISOString(),
        completedQuestions: 0,
        timeSpent: 0,
      })
    ),
      updateProgressDisplays(),
      startProgressTracking(),
      showSuccessMessage('Goals set successfully!');
  });
  document.getElementById('setExamDate').addEventListener('click', () => {
    const e = document.getElementById('examDate'),
      t = new Date(e.value);
    isNaN(t.getTime())
      ? showSuccessMessage('Please select a valid date', 'error')
      : (localStorage.setItem('examDate', t.toISOString()),
        updateExamCountdown(),
        showSuccessMessage('Exam date set successfully!'));
  });
  document.querySelectorAll('.plan-button').forEach((e) => {
    e.addEventListener('click', () => {
      generateStudyPlan(e.dataset.plan);
    });
  });
}
function loadProgressData() {
  const e = localStorage.getItem('studyGoals');
  if (e) {
    const t = JSON.parse(e);
    (document.getElementById('studyTime').value = t.studyTime),
      (document.getElementById('questionsGoal').value = t.questionsGoal);
  }
}
function updateExamCountdown() {
  const e = localStorage.getItem('examDate');
  if (!e) {
    const e = new Date();
    e.setDate(e.getDate() + 30),
      localStorage.setItem('examDate', e.toISOString());
  }
  const t = new Date(e || localStorage.getItem('examDate')),
    s = new Date();
  document.getElementById('examDate').value = t.toISOString().split('T')[0];
  const n = t - s,
    a = Math.ceil(n / 864e5),
    o = document.getElementById('daysLeft');
  (o.textContent = a),
    a <= 7 ? o.classList.add('warning') : o.classList.remove('warning');
}
function generateStudyPlan(e) {
  const t = document.getElementById('planDetails');
  let s = '';
  switch (e) {
    case 'intensive':
      s =
        '\n                <h3>Intensive Study Plan</h3>\n                <ul>\n                    <li>2+ hours of focused study daily</li>\n                    <li>Complete 20+ questions per day</li>\n                    <li>Review all topics weekly</li>\n                    <li>Take practice tests every weekend</li>\n                </ul>\n            ';
      break;
    case 'moderate':
      s =
        '\n                <h3>Moderate Study Plan</h3>\n                <ul>\n                    <li>1-2 hours of focused study daily</li>\n                    <li>Complete 10-15 questions per day</li>\n                    <li>Review topics bi-weekly</li>\n                    <li>Take practice tests every other weekend</li>\n                </ul>\n            ';
      break;
    case 'light':
      s =
        '\n                <h3>Light Study Plan</h3>\n                <ul>\n                    <li>30-60 minutes of focused study daily</li>\n                    <li>Complete 5-10 questions per day</li>\n                    <li>Review topics monthly</li>\n                    <li>Take practice tests monthly</li>\n                </ul>\n            ';
  }
  t.innerHTML = s;
}
document.addEventListener('DOMContentLoaded', () => {
  initializeMenu();
  const e = new StudyTimer();
  document.addEventListener('visibilitychange', () => {
    document.hidden ? e.saveState() : e.start();
  }),
    window.addEventListener('beforeunload', () => {
      e.saveState();
    });
  const t = document.getElementById('startTimer'),
    s = document.getElementById('pauseTimer'),
    n = document.getElementById('resetTimer'),
    a = document.getElementById('timerDisplay');
  t.addEventListener('click', () => {
    e.start(), a.classList.add('running'), (t.disabled = !0), (s.disabled = !1);
  }),
    s.addEventListener('click', () => {
      e.pause(),
        a.classList.remove('running'),
        (t.disabled = !1),
        (s.disabled = !0);
    }),
    n.addEventListener('click', () => {
      e.reset(),
        a.classList.remove('running'),
        (t.disabled = !1),
        (s.disabled = !0);
    });
  const o = document.getElementById('studyTime');
  document.getElementById('setGoals').addEventListener('click', () => {
    const t = parseInt(o.value);
    t > 0 &&
      (e.setDailyGoal(t),
      localStorage.setItem('studyTime', t),
      updateProgressBars());
  });
  const i = document.getElementById('examDate'),
    l = document.getElementById('setExamDate'),
    d = document.getElementById('daysLeft');
  l.addEventListener('click', () => {
    const e = new Date(i.value);
    e &&
      e > new Date() &&
      (localStorage.setItem('examDate', i.value),
      (function () {
        const e = localStorage.getItem('examDate');
        if (e) {
          const t = new Date(e) - new Date(),
            s = Math.ceil(t / 864e5);
          d.textContent = s;
        }
      })());
  }),
    initializeCharts(),
    setupEventListeners(),
    loadProgressData(),
    updateExamCountdown();
  JSON.parse(localStorage.getItem('studyGoals') || '{}').startTime &&
    (updateProgressDisplays(), startProgressTracking());
});
let typingCount = 0,
  timeSpent = 0,
  questionsCompleted = 0;
function updateChartData(e, t) {
  const s = Chart.getChart(e);
  s &&
    (s.data.datasets[0].data.push(t),
    s.data.labels.push(new Date().toLocaleTimeString()),
    s.update());
}
function updateProgressDisplays() {
  const e = JSON.parse(localStorage.getItem('studyGoals') || '{}');
  if (!e.studyTime || !e.questionsGoal) return;
  const t = document.querySelector('#studyProgress .progress-fill'),
    s = document.querySelector('#questionsProgress .progress-fill'),
    n = document.querySelector('#studyProgress').nextElementSibling,
    a = document.querySelector('#questionsProgress').nextElementSibling,
    o = Math.min((e.timeSpent / e.studyTime) * 100, 100),
    i = Math.min((e.completedQuestions / e.questionsGoal) * 100, 100);
  (t.style.width = `${o}%`),
    (s.style.width = `${i}%`),
    (n.textContent = `${Math.floor(e.timeSpent)}/${e.studyTime} minutes`),
    (a.textContent = `${e.completedQuestions}/${e.questionsGoal} questions`),
    o >= 100 && t.classList.add('completed'),
    i >= 100 && s.classList.add('completed');
}
function startProgressTracking() {
  window.progressInterval && clearInterval(window.progressInterval),
    (window.progressInterval = setInterval(() => {
      const e = JSON.parse(localStorage.getItem('studyGoals') || '{}');
      e.startTime &&
        ((e.timeSpent = Math.floor((new Date() - new Date(e.startTime)) / 6e4)),
        localStorage.setItem('studyGoals', JSON.stringify(e)),
        updateProgressDisplays());
    }, 6e4));
}
function showSuccessMessage(e, t = 'success') {
  const s = document.createElement('div');
  (s.className = `success-message ${t}`),
    (s.textContent = e),
    document.body.appendChild(s),
    setTimeout(() => {
      s.classList.add('show');
    }, 100),
    setTimeout(() => {
      s.classList.remove('show'),
        setTimeout(() => {
          s.remove();
        }, 300);
    }, 3e3);
}
document.addEventListener('keydown', () => {
  typingCount++, updateChartData('typingChart', typingCount);
}),
  setInterval(() => {
    timeSpent++, updateChartData('timeChart', timeSpent);
  }, 6e4);
