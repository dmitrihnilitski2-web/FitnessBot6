/* =========================================================
   FITNESS HUB PRO | ЛОГІКА ТРЕНЕРА (trainer.js)
   ========================================================= */

// 1. Безпечна ініціалізація Telegram WebApp
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();
    tg.ready();
}

// OVERRIDE FETCH TO ALWAYS INCLUDE TELEGRAM INIT DATA
const originalFetch = window.fetch;
window.fetch = async function() {
    let [resource, config ] = arguments;
    if (!config) config = {};
    if (!config.headers) config.headers = {};
    if (typeof tg !== 'undefined' && tg && tg.initData) {
        config.headers['X-Telegram-Init-Data'] = tg.initData;
    } else if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        config.headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
    }
    return originalFetch(resource, config);
};

// Підключаємо глобальну функцію локалізації
const loc = window.loc || function(key, fallback) { return fallback !== undefined ? fallback : key; };

const botUsername = "coach_app_bot";

// 2. Отримання ID тренера
let trainerId = 1100202114;
let userNameTg = "";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    if (tg.initDataUnsafe.user.id) trainerId = tg.initDataUnsafe.user.id;
    if (tg.initDataUnsafe.user.username) userNameTg = tg.initDataUnsafe.user.username;
}

let currentClient = null;
let currentClientId = null;
let currentClientWorkout = null;
let currentClientCompletedSets = {};
let currentDayIndex = 0;
let globalActiveTab = null;

let clientWeightChartInstance = null;

const goalTranslate = {
    'lose': 'Схуднення / Сушка',
    'maintain': 'Підтримка форми',
    'gain': 'Набір маси',
    'strength': 'Максимальна сила',
    'endurance': 'Витривалість',
    'custom': 'Своя ціль',
    'competition': 'Підготовка до змагань'
};

window.refreshIcons = function() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

window.formatMarkdown = function(text) {
    if (!text) return "";
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
};

window.escapeHTML = function(str) {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
};

async function initTrainerApp() {
    try {
        const res = await fetch('/api/user/' + trainerId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        // ПРИМУСОВО ХОВАЄМО ЛОАДЕР
        const loader = document.getElementById('loading-view');
        if (loader) {
            loader.classList.remove('active');
            loader.style.display = 'none';
        }

        // ПЕРЕВІРКА ТРЕНЕРСЬКОЇ ПІДПИСКИ (ФАЗА 5)
        const tier = data.subscription_tier || 'FREE';
        window.trainerTier = tier; // Зберігаємо глобально для UI
        const isCoach = (data.user && data.user.role === 'trainer') && (tier === 'COACH_BASIC' || tier === 'COACH_PRO');

        if (data.status === 'found' && isCoach) {
            // Додаємо бейдж тарифу (шукаємо заголовок або контейнер)
            const titleEl = document.querySelector('h2[data-i18n="trainer_my_team"]');
            if (titleEl && !document.getElementById('coach-tier-badge')) {
                const badge = document.createElement('span');
                badge.id = 'coach-tier-badge';
                badge.style = "font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 8px; margin-left: 12px; vertical-align: middle; background: " + (tier === 'COACH_PRO' ? 'var(--accent-gold)' : 'var(--client-blue)') + "; color: #000;";
                badge.innerText = tier.replace('_', ' ');
                titleEl.appendChild(badge);
            }

            const inviteInput = document.getElementById('invite-link');
            if (inviteInput) {
                inviteInput.value = 'https://t.me/' + botUsername + '?start=trainer_' + trainerId;
            }

            // Завантажуємо дані паралельно
            await Promise.all([
                loadClients(),
                loadTrainerLeaderboard()
            ]);

            showView('team-view');
        } else {
            // Якщо не тренер або немає підписки - показуємо екран "Доступ заборонено"
            const noAccessView = document.getElementById('no-access-view');
            if (noAccessView) {
                noAccessView.innerHTML = `
                    <div style="text-align:center; padding:40px 20px;">
                        <i data-lucide="shield-alert" style="width:64px; height:64px; color:var(--destructive); margin-bottom:20px;"></i>
                        <h2 style="font-size:24px; font-weight:800; margin-bottom:12px;">Доступ обмежено</h2>
                        <p style="color:var(--hint-color); margin-bottom:30px;">Панель тренера доступна лише користувачам із активною підпискою <b>COACH BASIC</b> або <b>COACH PRO</b>.</p>
                        <button onclick="tg.openTelegramLink('https://t.me/${botUsername}')" style="background:var(--text-color); color:#000; border-radius:12px; padding:12px 24px; font-weight:700;">Придбати підписку</button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            showView('no-access-view');
        }
    } catch (e) {
        console.error("Initialization error:", e);
        const loader = document.getElementById('loading-view');
        if (loader) {
            loader.classList.remove('active');
            loader.style.display = 'none';
        }
        showView('no-access-view');
    }

    sendPing();
    setInterval(sendPing, 60000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrainerApp);
} else {
    initTrainerApp();
}

function sendPing() {
    fetch('/api/ping', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
        body: JSON.stringify({ user_id: trainerId, username: userNameTg })
    }).catch(function(e) {});
}

function showView(viewId) {
    // ЖОРСТКЕ ПРИХОВУВАННЯ УСІХ ВІКОН
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    // ЖОРСТКИЙ ПОКАЗ ЦІЛЬОВОГО ВІКНА
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    window.scrollTo(0, 0);
}

function navTo(viewId, el) {
    if (el) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        el.classList.add('active');
    }
    showView(viewId);

    if (viewId === 'team-view') {
        loadClients();
        loadTrainerLeaderboard();
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

window.copyInviteLink = function() {
    const linkInput = document.getElementById('invite-link');
    if (!linkInput) return;

    linkInput.select();
    linkInput.setSelectionRange(0, 99999);

    try {
        navigator.clipboard.writeText(linkInput.value);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert(loc('alert_copied', "Посилання скопійовано!"));
        else alert(loc('alert_copied', "Посилання скопійовано!"));
    } catch (e) {
        console.error("Copy failed", e);
    }
};

async function loadTrainerLeaderboard() {
    const container = document.getElementById('trainer-leaderboard-container');
    if (!container) return;

    container.innerHTML = `
        <div class="skeleton" style="width: 100%; height: 50px; margin-bottom: 8px;"></div>
        <div class="skeleton" style="width: 100%; height: 50px;"></div>
    `;

    try {
        const res = await fetch('/api/leaderboard/team/' + trainerId, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            let html = '';
            data.data.forEach((user, index) => {
                let rankMedal = `<span style="color: var(--hint-color); font-weight: 700;">#${index + 1}</span>`;
                if (index === 0) rankMedal = `<i data-lucide="medal" style="color: #ffd700; width: 24px; height: 24px;"></i>`;
                if (index === 1) rankMedal = `<i data-lucide="medal" style="color: #c0c0c0; width: 20px; height: 20px;"></i>`;
                if (index === 2) rankMedal = `<i data-lucide="medal" style="color: #cd7f32; width: 18px; height: 18px;"></i>`;

                let isMe = (user.user_id === trainerId) ? 'background: rgba(50, 215, 75, 0.1); border-color: var(--success);' : 'background: rgba(255,255,255,0.02); border-color: transparent;';
                let avatarHtml = user.avatar_url ? `<img src="${user.avatar_url}?v=${new Date().getTime()}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;"><i data-lucide="user" style="width: 20px; height: 20px; color: var(--hint-color);"></i></div>`;

                html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid transparent; ${isMe} border-radius: 12px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 30px; text-align: center; display: flex; align-items: center; justify-content: center;">
                            ${rankMedal}
                        </div>
                        ${avatarHtml}
                        <div>
                            <div style="font-weight: 700; font-size: 15px; color: var(--text-color);">
                                ${window.escapeHTML(user.name)}
                            </div>
                            <div style="font-size: 11px; color: var(--hint-color); margin-top: 2px;">
                                EXP: <b style="color: var(--text-color);">${user.exp}</b>
                            </div>
                        </div>
                    </div>
                    <div style="font-size: 16px; font-weight: bold; color: #ff9500; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="flame" style="width: 14px; height: 14px; fill: #ff9500;"></i> <span style="font-size: 16px;">${user.current_streak}</span>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
            window.refreshIcons();
        } else {
            container.innerHTML = `<p style="text-align: center; color: var(--hint-color); font-size: 13px;">Ваша команда поки порожня.</p>`;
        }
    } catch (e) {
        container.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 13px;">Помилка завантаження рейтингу.</p>';
    }
}

async function loadClients() {
    const list = document.getElementById('clients-list');
    if (!list) return;

    list.innerHTML = `
        <div class="skeleton" style="width: 100%; height: 70px; margin-bottom: 12px;"></div>
        <div class="skeleton" style="width: 100%; height: 70px;"></div>
    `;

    try {
        const res = await fetch('/api/trainer/' + trainerId + '/clients', {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });

        if (!res.ok) throw new Error("Net Error");
        const data = await res.json();

        if (!data.clients || data.clients.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <i data-lucide="inbox" style="width: 48px; height: 48px; color: var(--hint-color); opacity: 0.5; margin-bottom: 15px;"></i>
                    <p style="color: var(--hint-color); font-size: 14px;">У вас поки немає клієнтів. Надішліть своє реферальне посилання, щоб додати їх!</p>
                </div>`;
            window.refreshIcons();
            return;
        }

        let html = '';
        data.clients.forEach(function(c) {
            const displayGoal = goalTranslate[c.primary_goal] || c.primary_goal;
            const safeName = window.escapeHTML(c.name);

            html += `
                <div class="client-card" onclick="openClient(${c.user_id})">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(50, 215, 75, 0.1); color: var(--success); display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                            <i data-lucide="user" style="width: 22px; height: 22px;"></i>
                        </div>
                        <div>
                            <div class="client-name" style="font-weight: bold; font-size: 15px; color: var(--text-color);">${safeName}</div>
                            <div class="client-meta" style="font-size: 12px; color: var(--hint-color);">Ціль: ${displayGoal} • EXP: ${c.exp}</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div class="client-level" style="font-size: 12px; font-weight: bold; color: var(--accent-gold);">
                            <i data-lucide="star" style="width:12px; height:12px; margin-bottom:-2px; fill:var(--accent-gold);"></i> ${c.level}
                        </div>
                        <i data-lucide="chevron-right" style="color: var(--hint-color); width: 16px; height: 16px;"></i>
                    </div>
                </div>`;
        });
        list.innerHTML = html;
        window.refreshIcons();
    } catch(e) {
        list.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 13px;">Помилка завантаження</p>';
    }
}

function switchClientTab(tabId, el) {
    document.querySelectorAll('.client-tab-content').forEach(function(e) {
        e.style.display = 'none';
    });

    const tabsContainer = document.querySelector('#client-modal .day-tabs');
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.day-tab').forEach(function(e) {
            e.classList.remove('active');
        });
    }

    const target = document.getElementById('client-tab-' + tabId);
    if (target) target.style.display = 'block';
    if (el) el.classList.add('active');

    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

async function openClient(clientId) {
    currentClientId = clientId;

    document.querySelectorAll('.nav-item').forEach(function(el) {
        el.classList.remove('active');
    });

    const modal = document.getElementById('client-modal');
    if(modal) modal.classList.add('active');

    document.getElementById('client-modal-name').innerText = "Завантаження...";
    document.getElementById('client-modal-goal').innerText = "...";
    document.getElementById('client-plan-container').innerHTML = `
        <div style="display: flex; justify-content: center; padding: 30px;">
            <i data-lucide="loader" class="spinner-icon"></i>
        </div>`;
    window.refreshIcons();

    try {
        const res = await fetch('/api/user/' + clientId, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if (data.status === 'found') {
            currentClient = data;
            currentClientWorkout = data.workout_plan;
            currentClientCompletedSets = data.today_completed_sets || {};

            document.getElementById('client-modal-name').innerText = data.user.name;
            document.getElementById('client-modal-goal').innerText = "Ціль: " + (goalTranslate[data.user.primary_goal] || data.user.primary_goal);

            document.getElementById('client-nutrition-input').value = data.user.nutrition_plan || "";

            loadClientFatigue(clientId, data.user.gender);
            loadClientProgressCharts(clientId);

            if (data.workout_plan) {
                globalActiveTab = null;
                const hasAdapted = data.today_checkin && data.today_checkin.adapted_plan;
                renderWorkoutDays(hasAdapted ? 'adapted' : 0);
            } else {
                const tier = window.trainerTier || 'FREE';
                const aiBtnAttr = (tier === 'COACH_PRO') ? 'onclick="generatePlanForClient()"' : 'onclick="alert(\'Автоматична генерація планів доступна лише в підписці COACH PRO.\')" style="opacity:0.6;"';
                
                document.getElementById('client-plan-container').innerHTML = `
                    <div class="card" style="text-align:center; padding: 40px 15px;">
                        <i data-lucide="calendar-off" style="width: 48px; height: 48px; color: var(--hint-color); margin-bottom: 15px; opacity: 0.5;"></i>
                        <p style="color:var(--hint-color); margin-bottom:20px; font-size: 14px;">У клієнта немає активної програми.</p>
                        <button class="btn-trainer" ${aiBtnAttr} style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;"><i data-lucide="sparkles"></i> Згенерувати ШІ-План</button>
                        <button class="secondary btn-trainer" onclick="createManualPlan()" style="margin-top: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;"><i data-lucide="pen-tool"></i> Створити порожній шаблон</button>
                    </div>`;
                window.refreshIcons();
            }

            // Відкриваємо першу табу по дефолту
            switchClientTab('plan', document.querySelector('.day-tabs .day-tab'));
        }

        window.refreshIcons();
    } catch(e) {
        console.error(e);
        if (tg && tg.showAlert) tg.showAlert("Помилка завантаження клієнта.");
        closeModal('client-modal');
    }
}

async function loadClientFatigue(clientId, gender) {
    try {
        const res = await fetch('/api/muscle_fatigue/' + clientId, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();
        if (data.status === 'success' && window.AnatomyMapper) {
            const mapGender = gender === 'female' ? 'female' : 'male';
            window.AnatomyMapper.drawBodyMap(mapGender, 'client-fatigue-container');
            window.AnatomyMapper.applyFatigue(data.data);
        }
    } catch(e) {}
}

async function loadClientProgressCharts(clientId) {
    try {
        const res = await fetch('/api/progress/' + clientId, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const responseData = await res.json();

        if (responseData.status === 'success') {
            const data = responseData.data.body_weight;
            if (typeof Chart === 'undefined' || !document.getElementById('clientWeightChart')) return;

            if (clientWeightChartInstance) {
                clientWeightChartInstance.destroy();
            }

            const canvas = document.getElementById('clientWeightChart');
            const ctx = canvas.getContext('2d');

            if (!data || data.length === 0) return;

            let gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(50, 215, 75, 0.4)');
            gradient.addColorStop(1, 'rgba(50, 215, 75, 0)');

            const labels = data.map(d => d.date.split('-').slice(1).join('/'));
            const weights = data.map(d => d.weight);

            clientWeightChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Вага (кг)',
                        data: weights,
                        borderColor: 'var(--success)',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#000',
                        pointBorderColor: 'var(--success)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { min: Math.min(...weights) - 2, max: Math.max(...weights) + 2, grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    } catch(e) {}
}

window.saveClientNutrition = async function() {
    const plan = document.getElementById('client-nutrition-input').value;
    const btn = document.querySelector('button[onclick="saveClientNutrition()"]');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Завантаження...'; window.refreshIcons(); }

    try {
        await fetch('/api/trainer/nutrition_plan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: currentClientId, plan: plan })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert("Раціон успішно збережено!");
    } catch(e) {
        console.error(e);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = 'Зберегти раціон'; window.refreshIcons(); }
    }
};

window.generatePlanForClient = async function() {
    if(!confirm("Згенерувати новий план через ШІ? Попередній буде видалено.")) return;

    try {
        const res = await fetch('/api/generate_plan/' + currentClientId, {
            method: 'POST',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if(data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            openClient(currentClientId);
        }
    } catch(e) {}
};

window.createManualPlan = async function() {
    if(!confirm("Створити новий порожній план для ручного заповнення?")) return;

    const emptyPlan = {
        plan_name: "Персональна програма",
        explanation: "Цей план складено вашим тренером.",
        projections: "Слідуйте вказівкам тренера для найкращого результату.",
        days: [
            { day: 1, focus: "Тренування 1", exercises: [] },
            { day: 2, focus: "Тренування 2", exercises: [] }
        ]
    };

    try {
        await fetch('/api/update_workout_plan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: currentClientId, plan: emptyPlan })
        });
        openClient(currentClientId);
    } catch(e) {}
};

function detectExerciseType(name) {
    const n = name.toLowerCase();
    if (n.includes('розминк') || n.includes('заминк') || n.includes('розтяжк')) return 'warmup';
    if (n.includes('біг') || n.includes('доріжк') || n.includes('вело') || n.includes('еліпс') || n.includes('кардіо')) return 'cardio';
    return 'strength';
}

window.renderWorkoutDays = function(activeTabId) {
    if (!currentClient || !currentClient.workout_plan) return;

    globalActiveTab = activeTabId;
    const cont = document.getElementById('client-plan-container');
    if (!cont) return;

    // Встановлюємо структуру контейнера один раз
    cont.innerHTML = `
        <div class="day-tabs" id="trainer-day-tabs" style="margin-bottom: 15px;"></div>
        <div id="t-workout-list"></div>
    `;

    const tabsContainer = document.getElementById('trainer-day-tabs');
    const listCont = document.getElementById('t-workout-list');

    const days = currentClient.workout_plan.days || [];
    const hasAdapted = currentClient.today_checkin && currentClient.today_checkin.adapted_plan;

    if (typeof activeTabId === 'number') {
        currentDayIndex = activeTabId;
    }

    // Оптимізація: збирання HTML вкладок
    let tabsHtml = '';

    if (hasAdapted) {
        const activeClass = (activeTabId === 'adapted') ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays('adapted')"><i data-lucide="zap" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Адаптовано</div>`;
    }

    days.forEach(function(d, index) {
        const activeClass = (activeTabId === index) ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays(${index})">День ${d.day}</div>`;
    });

    if (days.length > 0) {
        const activeClass = (activeTabId === 'all') ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays('all')">Всі</div>`;
    }

    tabsContainer.innerHTML = tabsHtml;

    // Оптимізація: збирання HTML списку тренувань
    let listHtml = '';

    if (activeTabId === 'adapted' && hasAdapted) {
        const adapted = currentClient.today_checkin.adapted_plan;
        listHtml += `
            <div class="card" style="border: 1px solid var(--warning); padding: 15px; margin-bottom: 10px;">
                <div style="color:var(--warning); margin-bottom:15px; font-weight:bold; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="zap"></i> АДАПТОВАНО: ${adapted.focus}
                </div>`;

        (adapted.exercises || []).forEach(function(e, i) {
            const safeName = e.name.replace(/'/g, "\\'");
            const expectedReps = String(e.reps).replace(/'/g, "\\'");
            listHtml += buildExerciseRow(e, i, 'adapted', safeName, expectedReps);
        });

        listHtml += `
            <button class="secondary" style="color: var(--warning); margin-top: 15px; width: 100%; border-style: dashed; border-color: rgba(255,204,0,0.3);" onclick="tOpenEditEx('adapted', -1, '', '', '')">
                <i data-lucide="plus"></i> Додати вправу
            </button>
        </div>`;
    } else {
        let daysToRender = activeTabId === 'all' ? days : [days[currentDayIndex]];
        if (!daysToRender[0]) daysToRender = days;

        daysToRender.forEach(function(d) {
            if (!d) return;
            let actualDayIndex = days.indexOf(d);

            listHtml += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 15px; margin-bottom: 15px;">
                    <div style="color:var(--accent-gold); margin-bottom:15px; font-size:13px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="calendar" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> ДЕНЬ ${d.day}: ${d.focus}
                    </div>`;

            (d.exercises || []).forEach(function(e, i) {
                const safeName = e.name.replace(/'/g, "\\'");
                const expectedReps = String(e.reps).replace(/'/g, "\\'");
                listHtml += buildExerciseRow(e, i, actualDayIndex, safeName, expectedReps);
            });

            if (activeTabId !== 'all') {
                listHtml += `
                    <button class="secondary" style="color: #32d74b; margin-top: 15px; width: 100%; border-style: dashed; border-color: rgba(50,215,75,0.3);" onclick="tOpenEditEx('${actualDayIndex}', -1, '', '', '')">
                        <i data-lucide="plus"></i> Додати вправу
                    </button>`;
            }
            listHtml += `</div>`;
        });
    }

    listCont.innerHTML = listHtml;
    window.refreshIcons();
};

function buildExerciseRow(e, i, dayId, safeName, expectedReps) {
    const key = dayId + '_' + e.name;
    const completedSets = currentClientCompletedSets[key] ? currentClientCompletedSets[key] : 0;
    const isCompleted = completedSets >= parseInt(e.sets);

    return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px;">
            <div style="flex:1; padding-right:10px;">
                <div style="font-weight: bold; font-size: 14px; color: var(--text-color);">${e.name}</div>
                <div style="font-size: 12px; color: var(--hint-color); margin-top: 4px;">${e.sets} підходи × ${expectedReps}</div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                <button style="background: rgba(255, 204, 0, 0.15); color: var(--warning); border-radius: 8px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: none;" onclick="tOpenEditEx('${dayId}', ${i}, '${safeName}', '${e.sets}', '${expectedReps}')">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        </div>`;
}

window.tOpenEditEx = function(dayIndex, exIndex, name, sets, reps) {
    document.getElementById('edit-ex-day').value = dayIndex;
    document.getElementById('edit-ex-index').value = exIndex;
    document.getElementById('edit-ex-name').value = name;
    document.getElementById('edit-ex-sets').value = sets;
    document.getElementById('edit-ex-reps').value = reps;

    document.getElementById('edit-ex-title').innerText = (exIndex == -1) ? "Додати вправу" : "Редагувати вправу";
    document.getElementById('btn-delete-ex').style.display = (exIndex == -1) ? "none" : "flex";
    document.getElementById('edit-exercise-modal').classList.add('active');
};

window.submitEditExercise = async function() {
    const dayIndex = document.getElementById('edit-ex-day').value;
    const exIndex = parseInt(document.getElementById('edit-ex-index').value);
    const name = document.getElementById('edit-ex-name').value.trim();
    const sets = document.getElementById('edit-ex-sets').value.trim() || "1";
    const reps = document.getElementById('edit-ex-reps').value.trim() || "10";

    if (!name) return;

    let isAdapted = (dayIndex === 'adapted');

    if (isAdapted) {
        if (!currentClient.today_checkin.adapted_plan.exercises) currentClient.today_checkin.adapted_plan.exercises = [];
        if (exIndex == -1) {
            currentClient.today_checkin.adapted_plan.exercises.push({name: name, sets: sets, reps: reps});
        } else {
            currentClient.today_checkin.adapted_plan.exercises[exIndex] = {name: name, sets: sets, reps: reps};
        }
    } else {
        let dIdx = parseInt(dayIndex);
        if (!currentClientWorkout.days[dIdx].exercises) currentClientWorkout.days[dIdx].exercises = [];
        if (exIndex == -1) {
            currentClientWorkout.days[dIdx].exercises.push({name: name, sets: sets, reps: reps});
        } else {
            currentClientWorkout.days[dIdx].exercises[exIndex] = {name: name, sets: sets, reps: reps};
        }
    }

    closeModal('edit-exercise-modal');
    await saveClientPlanToServer(isAdapted);
    renderWorkoutDays(isAdapted ? 'adapted' : parseInt(dayIndex));
};

window.deleteExercise = async function() {
    if (!confirm("Видалити цю вправу?")) return;

    const dayIndex = document.getElementById('edit-ex-day').value;
    const exIndex = parseInt(document.getElementById('edit-ex-index').value);
    let isAdapted = (dayIndex === 'adapted');

    if (isAdapted) {
        currentClient.today_checkin.adapted_plan.exercises.splice(exIndex, 1);
    } else {
        currentClientWorkout.days[parseInt(dayIndex)].exercises.splice(exIndex, 1);
    }

    closeModal('edit-exercise-modal');
    await saveClientPlanToServer(isAdapted);
    renderWorkoutDays(isAdapted ? 'adapted' : parseInt(dayIndex));
};

async function saveClientPlanToServer(isAdapted) {
    try {
        if (isAdapted) {
            await fetch('/api/update_adapted_plan', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
                body: JSON.stringify({ user_id: currentClientId, plan: currentClient.today_checkin.adapted_plan })
            });
        } else {
            await fetch('/api/update_workout_plan', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
                body: JSON.stringify({ user_id: currentClientId, plan: currentClientWorkout })
            });
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch(e) {
        console.error(e);
    }
}

window.showExerciseInfo = async function(name) {
    if(document.getElementById('info-modal-title')) document.getElementById('info-modal-title').innerText = name;
    if(document.getElementById('info-modal-muscles')) document.getElementById('info-modal-muscles').innerText = "Аналіз...";
    if(document.getElementById('info-modal-instruction')) {
        document.getElementById('info-modal-instruction').innerHTML = `
            <div class="skeleton" style="width: 100%; height: 20px; margin-bottom: 5px;"></div>
            <div class="skeleton" style="width: 80%; height: 20px;"></div>
        `;
    }
    if(document.getElementById('btn-youtube-link')) document.getElementById('btn-youtube-link').style.display = 'none';

    if(document.getElementById('exercise-info-modal')) document.getElementById('exercise-info-modal').classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    try {
        const res = await fetch('/api/exercise_info/' + encodeURIComponent(name));
        const data = await res.json();

        if (data.status === 'success') {
            if(document.getElementById('info-modal-muscles')) document.getElementById('info-modal-muscles').innerText = data.data.muscles;
            if(document.getElementById('info-modal-instruction')) document.getElementById('info-modal-instruction').innerText = data.data.instruction;
            const ytBtn = document.getElementById('btn-youtube-link');
            if(ytBtn) {
                ytBtn.href = `https://www.youtube.com/results?search_query=Як+робити+${encodeURIComponent(name)}+техніка+виконання`;
                ytBtn.style.display = 'flex';
            }
        }
    } catch (e) {
        console.error(e);
    }
};

window.openSaveTemplateModal = function() {
    if (!currentClientWorkout || !currentClientWorkout.days || currentClientWorkout.days.length === 0) {
        if(tg && tg.showAlert) tg.showAlert("Немає плану для збереження.");
        else alert("Немає плану для збереження.");
        return;
    }
    const modal = document.getElementById('save-template-modal');
    if (modal) modal.classList.add('active');

    const input = document.getElementById('template-name-input');
    if (input) input.value = currentClientWorkout.plan_name || 'Мій шаблон';
};

window.saveCurrentPlanAsTemplate = async function() {
    const tNameInput = document.getElementById('template-name-input');
    if (!tNameInput) return;
    const tName = tNameInput.value.trim();

    if (!tName) {
        if(tg && tg.showAlert) tg.showAlert("Введіть назву шаблону!");
        else alert("Введіть назву шаблону!");
        return;
    }

    try {
        await fetch('/api/trainer/templates', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({
                trainer_id: trainerId,
                template_name: tName,
                plan_data: currentClientWorkout
            })
        });
        closeModal('save-template-modal');
        if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if(tg && tg.showAlert) tg.showAlert("Шаблон успішно збережено!");
    } catch(e) {
        console.error(e);
        if(tg && tg.showAlert) tg.showAlert("Помилка збереження шаблону.");
    }
};

window.openApplyTemplateModal = async function() {
    const modal = document.getElementById('apply-template-modal');
    const cont = document.getElementById('templates-list');
    if (!modal || !cont) return;

    cont.innerHTML = `
        <div class="skeleton" style="width: 100%; height: 60px; margin-bottom: 10px;"></div>
        <div class="skeleton" style="width: 100%; height: 60px;"></div>
    `;
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/trainer/${trainerId}/templates`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            let html = '';
            data.data.forEach(t => {
                let safeData = window.escapeHTML(JSON.stringify(t.plan_data));

                html += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: bold; font-size: 15px; color: var(--text-color);">${window.escapeHTML(t.template_name)}</div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="applyTemplate('${safeData}')" style="width: auto; padding: 10px; border-radius: 10px; background: rgba(50, 215, 75, 0.15); color: #32d74b; margin: 0; border: none; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="check" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button onclick="deleteTemplate(${t.id})" style="width: auto; padding: 10px; border-radius: 10px; background: rgba(255, 45, 85, 0.15); color: var(--danger); margin: 0; border: none; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </div>`;
            });
            cont.innerHTML = html;
            window.refreshIcons();
        } else {
            cont.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 13px; padding: 20px;">У вас немає збережених шаблонів.</p>';
        }
    } catch(e) {
        cont.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 13px;">Помилка завантаження.</p>';
    }
};

window.applyTemplate = async function(planDataString) {
    if (!confirm("Застосувати цей шаблон? Поточний план клієнта буде повністю замінено!")) return;

    try {
        let rawJson = planDataString
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        const newPlan = JSON.parse(rawJson);

        currentClientWorkout = newPlan;
        if (currentClient && currentClient.user) {
            currentClient.workout_plan = newPlan;
        }

        closeModal('apply-template-modal');
        await saveClientPlanToServer(false);
        renderWorkoutDays(0);

        if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch(e) {
        console.error("Apply template error", e);
        if(tg && tg.showAlert) tg.showAlert("Помилка застосування шаблону. Можливо, пошкоджені дані.");
    }
};

window.deleteTemplate = async function(templateId) {
    if (!confirm("Видалити цей шаблон назавжди?")) return;

    try {
        await fetch(`/api/trainer/${trainerId}/templates/${templateId}`, { method: 'DELETE' });
        openApplyTemplateModal();
    } catch(e) {
        console.error(e);
    }
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
};

// =========================================================
// --- V2.0: COACH COMMENTS & CLIENT HISTORY ---
// =========================================================

window.loadClientHistory = async function() {
    const list = document.getElementById('client-history-list');
    if (!list) return;

    list.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 13px;">Завантаження історії...</p>';

    try {
        // Завантажуємо їжу клієнта
        const resNutri = await fetch('/api/nutrition/' + currentClientId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const dataNutri = await resNutri.json();

        // Завантажуємо коментарі тренера
        const resComments = await fetch('/api/coach/comments/' + currentClientId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const dataComments = await resComments.json();
        const coachComments = dataComments.status === 'success' ? dataComments.data : [];

        // Завантажуємо детальні логи тренувань
        const resWorkoutLogs = await fetch('/api/workout_logs/' + currentClientId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const dataWorkoutLogs = await resWorkoutLogs.json();

        let html = '';

        // Рендеримо прийоми їжі
        if (dataNutri.status === 'success' && dataNutri.logs && dataNutri.logs.length > 0) {
            dataNutri.logs.forEach(log => {
                html += `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="apple" style="color: var(--warning); width: 16px; height: 16px;"></i> ${window.escapeHTML(log.dish_name)}
                            </div>
                            <div style="font-size: 12px; color: var(--hint-color); margin-top: 4px;">
                                ${log.calories} ккал • Б:${log.protein} Ж:${log.fats} В:${log.carbs}
                            </div>
                        </div>
                    </div>
                    ${(() => {
                        let comment = coachComments.find(c => c.entity_type === 'nutrition' && c.entity_id == log.id);
                        return comment ? \`<div class="coach-comment-badge mt-8" style="background: rgba(10,132,255,0.1); color: var(--client-blue); padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-top: 10px;"><i data-lucide="message-circle" style="width:14px; height:14px; margin-bottom:-2px;"></i> <b>Мій коментар:</b> \${window.escapeHTML(comment.text)}</div>\` : '';
                    })()}
                    <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; display: flex; gap: 8px;">
                        <button class="log-comment-btn" onclick="openCoachCommentModal('nutrition', ${log.id})">
                            <i data-lucide="message-square" style="width: 14px; height: 14px;"></i> Залишити коментар
                        </button>
                    </div>
                </div>`;
            });
        }

        // Рендеримо виконані вправи
        if (dataWorkoutLogs.status === 'success' && dataWorkoutLogs.data && dataWorkoutLogs.data.length > 0) {
            // Групуємо логи по exercise_name
            const groupedLogs = {};
            dataWorkoutLogs.data.forEach(log => {
                if (!groupedLogs[log.exercise_name]) {
                    groupedLogs[log.exercise_name] = [];
                }
                groupedLogs[log.exercise_name].push(log);
            });

            for (const [exName, logs] of Object.entries(groupedLogs)) {
                let setsHtml = '';

                logs.forEach(log => {
                    let setVideoHtml = '';
                    if (log.video_url) {
                        setVideoHtml = \`<a href="\${log.video_url}" target="_blank" style="color: var(--theme-color); font-size: 11px; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; text-decoration: none; padding: 2px 6px; background: rgba(10,132,255,0.1); border-radius: 4px;"><i data-lucide="video" style="width: 12px; height: 12px;"></i> Відео</a>\`;
                    }
                    setsHtml += \`<div style="font-size: 13px; color: var(--text-color); margin-top: 6px; display: flex; align-items: center;">
                        <span style="color: var(--hint-color); margin-right: 8px;">Підхід \${log.set_number}:</span> \${log.weight} кг х \${log.reps} \${setVideoHtml}
                    </div>\`;
                });

                html += \`
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="width: 100%;">
                            <div style="font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="dumbbell" style="color: var(--theme-color); width: 16px; height: 16px;"></i> \${window.escapeHTML(exName)}
                            </div>
                            <div style="margin-top: 8px;">
                                \${setsHtml}
                            </div>
                        </div>
                    </div>
                    \${(() => {
                        let comment = coachComments.find(c => c.entity_type === 'workout' && c.entity_id == exName);
                        return comment ? \\\`<div class="coach-comment-badge mt-8" style="background: rgba(10,132,255,0.1); color: var(--client-blue); padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-top: 10px;"><i data-lucide="message-circle" style="width:14px; height:14px; margin-bottom:-2px;"></i> <b>Мій коментар:</b> \\\${window.escapeHTML(comment.text)}</div>\\\` : '';
                    })()}
                    <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="log-comment-btn" onclick="openCoachCommentModal('workout', '\${window.escapeHTML(exName).replace(/'/g, "\\\\'")}')">
                            <i data-lucide="message-square" style="width: 14px; height: 14px;"></i> Залишити коментар
                        </button>
                    </div>
                </div>\`;
            }
        }

        if (html === '') {
            html = '<p style="text-align: center; color: var(--hint-color); font-size: 13px;">Сьогодні немає активності.</p>';
        }

        list.innerHTML = html;
        window.refreshIcons();

    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 13px;">Помилка завантаження історії.</p>';
    }
};

window.openCoachCommentModal = function(entityType, entityId) {
    document.getElementById('comment-entity-type').value = entityType;
    document.getElementById('comment-entity-id').value = entityId;
    document.getElementById('coach-comment-text').value = '';

    const modal = document.getElementById('coach-comment-modal');
    if (modal) modal.classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.submitCoachComment = async function() {
    const entityType = document.getElementById('comment-entity-type').value;
    const entityId = document.getElementById('comment-entity-id').value;
    const text = document.getElementById('coach-comment-text').value.trim();

    if (!text) {
        if (tg && tg.showAlert) tg.showAlert("Введіть текст коментаря.");
        else alert("Введіть текст коментаря.");
        return;
    }

    const btn = document.querySelector('#coach-comment-modal .btn-trainer');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Відправка...";

    try {
        await fetch('/api/coach/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: currentClientId,
                trainer_id: trainerId,
                entity_type: entityType,
                entity_id: entityId.toString(),
                comment_text: text
            })
        });

        window.closeModal('coach-comment-modal');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert("Пораду успішно надіслано клієнту!");
        else alert("Пораду успішно надіслано клієнту!");
    } catch (e) {
        console.error(e);
        if (tg && tg.showAlert) tg.showAlert("Помилка відправки.");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

window.saveClientPlan = async function() {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    if (tg && tg.showAlert) tg.showAlert("План збережено!");
};