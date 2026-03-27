/* =========================================================
   FITNESS HUB PRO | ЯДРО ДОДАТКУ (client.js)
   ========================================================= */

// --- 1. ГЛОБАЛЬНІ ЗМІННІ (Доступні у всіх файлах) ---

// OVERRIDE FETCH TO ALWAYS INCLUDE TELEGRAM INIT DATA
const originalFetch = window.fetch;
window.fetch = async function() {
    let [resource, config ] = arguments;
    if (!config) config = {};
    if (!config.headers) config.headers = {};
    if (typeof tg !== 'undefined' && tg.initData) {
        config.headers['X-Telegram-Init-Data'] = tg.initData;
    } else if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        config.headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
    }
    return originalFetch(resource, config);
};

let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();
    tg.ready();
}

// Використовуємо var, щоб скрипти не конфліктували між собою
var loc = window.loc || function(key, fallback) { return fallback !== undefined ? fallback : key; };

let userId = 1100202114; // За замовчуванням (твій ID для тестування)
let userNameTg = "";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    if (tg.initDataUnsafe.user.id) {
        userId = tg.initDataUnsafe.user.id;
        window.userId = userId; // Ensure global window.userId is updated
    }
    if (tg.initDataUnsafe.user.username) userNameTg = tg.initDataUnsafe.user.username;
}

// Експортуємо userId в глобальний об'єкт window, щоб кнопки в HTML його бачили
window.userId = userId;

// Глобальна утиліта для оновлення векторних іконок
window.refreshIcons = function() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

// Змінні стану користувача
let userData = null;
let progressDataInfo = null;

// Глобальна змінна для коментарів тренера (V2.0)
window.coachComments = [];

// Глобальна змінна для ретроспективного логування циклу
let activeLogDate = null;
let activeFoodDate = null; // V2.0: For food diary selection

// Графіки
let weightChartInstance = null;
let exerciseChartInstance = null;
let metricsChartInstance = null;
let cycleHistoryChartInstance = null;

// Змінні для трекерів води та тренувань (використовуються в client_tracking.js)
let todayWater = 0;
const DAILY_WATER_GOAL_ML = 2000;
let currentExercise = '';
let currentExType = 'strength';
let currentExTotalSets = 1;
let currentExExpectedRepsStr = '';
let currentDayIndex = 0;
let globalActiveTab = null;
let currentPlanDay = '';
let timerInterval = null;
let currentTimerLeft = 0;
const REST_TIME_SECONDS = 90;

// Налаштування для Chart.js під преміум дизайн
try {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#888888';
        Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
    }
} catch (err) {}

// --- ДОПОМІЖНА ФУНКЦІЯ ДЛЯ МАРКДАУНУ (ЖИРНИЙ ШРИФТ ВІД ШІ) ---
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

// --- 2. СТАРТ ДОДАТКУ ---

function initApp() {
    refreshUserData().catch(function(e) {
        console.error("Помилка ініціалізації:", e);
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.innerText = loc('alert_error', "Помилка зв'язку.");
    });

    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const startParam = tg.initDataUnsafe.start_param;
        if (startParam.startsWith('trainer_')) {
            const trainerId = parseInt(startParam.split('_')[1]);
            fetch('/api/join_trainer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: userId, trainer_id: trainerId })
            }).then(res => res.json()).then(data => {
                if (data.status === 'success') {
                    if (tg && tg.showAlert) tg.showAlert("Ви успішно приєдналися до команди тренера!");
                    setTimeout(() => window.location.reload(), 2000);
                }
            }).catch(e => console.error(e));
        }
    }

    sendPing();
    setInterval(sendPing, 60000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function sendPing() {
    fetch('/api/ping', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
        body: JSON.stringify({ user_id: userId, username: userNameTg, language: window.appLanguage || 'uk' })
    }).catch(function(e) {});
}

async function refreshUserData() {
    try {
        const res = await fetch('/api/user/' + userId, {
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
        });

        if (!res.ok) throw new Error("Сервер повернув помилку " + res.status);
        const data = await res.json();

        if (data.status === 'found' && data.workout_plan) {
            userData = data;
            window.userData = data;

            // Завантаження коментарів тренера (V2.0)
            await loadCoachComments();

            renderApp();

            // Ініціалізація підписок та онбордингу
            if (typeof SubscriptionGuard !== 'undefined') SubscriptionGuard.applyPremiumLocks();
            if (typeof OnboardingTour !== 'undefined') OnboardingTour.start();
        } else {
            showView('form-view');
        }
    } catch (e) {
        console.error(e);
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.innerText = loc('alert_error', "Помилка зв'язку.");
    }
}

// --- 3. РЕНДЕР ІНТЕРФЕЙСУ ---

function getGoalName(goal) {
    const map = {
        'lose': loc('goal_lose', 'Схуднення / Сушка'),
        'maintain': loc('goal_maintain', 'Підтримка форми'),
        'gain': loc('goal_gain', 'Набір маси'),
        'strength': loc('goal_strength', 'Максимальна сила'),
        'endurance': loc('goal_endurance', 'Витривалість'),
        'custom': loc('goal_custom', 'Своя ціль'),
        'competition': loc('goal_competition', 'Підготовка до змагань')
    };
    return map[goal] || goal;
}

function getActivityName(act) {
    const map = {
        'sedentary': loc('act_sedentary', 'Сидячий'),
        'light': loc('act_light', 'Легкий'),
        'medium': loc('act_medium', 'Середній'),
        'active': loc('act_active', 'Високий'),
        'very_active': loc('act_very_active', 'Дуже високий')
    };
    return map[act] || act;
}

function renderApp() {
    try {
        const nav = document.getElementById('bottom-nav');
        if (nav) nav.style.display = 'flex';

        const u = userData.user;

        const navCycleBtn = document.getElementById('nav-cycle-btn');
        if (navCycleBtn) {
            navCycleBtn.style.display = (u.gender === 'female') ? '' : 'none';
        }

        const adminPanelBtn = document.getElementById('btn-admin-panel');
        const becomeTrainerBtn = document.getElementById('btn-become-trainer');
        const switchBtn = document.getElementById('trainer-switch-container');

        if (userId === 1100202114) {
            if (adminPanelBtn) adminPanelBtn.style.display = 'block';
        } else {
            if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        }

        if (u.role === 'trainer') {
            if (switchBtn) switchBtn.style.display = 'block';
            if (becomeTrainerBtn) becomeTrainerBtn.style.display = 'none';
        } else {
            if (switchBtn) switchBtn.style.display = 'none';
            if (becomeTrainerBtn) becomeTrainerBtn.style.display = 'block';
        }

        if(document.getElementById('prof-name')) document.getElementById('prof-name').innerText = u.name || loc('default_athlete', 'Атлет');
        if(document.getElementById('prof-mini-lvl')) document.getElementById('prof-mini-lvl').innerText = '(' + loc('level_short', 'Рв.') + ' ' + (u.level || 1) + ')';
        if(document.getElementById('prof-mini-streak')) document.getElementById('prof-mini-streak').innerText = (u.current_streak || 0);

        if(document.getElementById('prof-sub-tier')) {
            const tierName = u.subscription_tier || 'FREE';
            document.getElementById('prof-sub-tier').innerText = 'План: ' + tierName;
        }

        // --- СІМЕЙНА ПАНЕЛЬ (ФАЗА 6) ---
        const familyTab = document.getElementById('btn-tab-family');
        if (familyTab) {
            familyTab.style.display = (u.subscription_tier === 'FAMILY') ? 'block' : 'none';
        }

        const familySection = document.getElementById('family-management-section');
        if (u.subscription_tier === 'FAMILY') {
            if (!familySection) {
                // Додаємо секцію в профіль динамічно, якщо її немає
                const settingsCard = document.querySelector('#profile-view .bento-card[style*="padding: 8px 16px;"]');
                if (settingsCard) {
                    const div = document.createElement('div');
                    div.id = 'family-management-section';
                    div.innerHTML = `
                        <div style="border-top: 1px solid var(--border-color); margin-top: 8px; padding-top: 12px;">
                            <div class="flex-between mb-12">
                                <div style="font-size: 15px; font-weight: 600;"><i data-lucide="users" style="width:16px; height:16px; vertical-align: middle; margin-right:4px; color:var(--client-blue);"></i> Моя Сім'я</div>
                                <button onclick="inviteFamilyMember()" style="width:auto; margin:0; padding:4px 10px; font-size:11px; background:var(--client-blue); color:#fff; border:none; border-radius:8px;">+ Запросити</button>
                            </div>
                            <div id="family-members-list" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
                        </div>
                    `;
                    settingsCard.appendChild(div);
                    window.refreshIcons();
                    loadFamilyMembers();
                }
            } else {
                loadFamilyMembers();
            }
        } else if (familySection) {
            familySection.remove();
        }

        // Відображення Аватарки
        const avatarImg = document.getElementById('user-avatar-img');
        const avatarIcon = document.getElementById('user-avatar-icon');
        if (avatarImg && avatarIcon) {
            if (u.avatar_url) {
                avatarImg.src = u.avatar_url + '?v=' + new Date().getTime(); // Prevent cache
                avatarImg.style.display = 'block';
                avatarIcon.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarIcon.style.display = 'block';
            }
        }

        if(document.getElementById('prof-weight')) document.getElementById('prof-weight').innerText = u.weight + ' ' + loc('kg', 'кг');
        if(document.getElementById('prof-target')) document.getElementById('prof-target').innerText = u.target_weight + ' ' + loc('kg', 'кг');
        if(document.getElementById('prof-height')) document.getElementById('prof-height').innerText = u.height + ' ' + loc('cm', 'см');
        if(document.getElementById('prof-age')) document.getElementById('prof-age').innerText = u.age;
        if(document.getElementById('prof-goal')) document.getElementById('prof-goal').innerText = getGoalName(u.primary_goal);
        if(document.getElementById('prof-activity')) document.getElementById('prof-activity').innerText = getActivityName(u.activity_level);

        // Оновлення енергії ШІ
        if(document.getElementById('prof-ai-energy')) {
            const energy = u.ai_energy !== undefined ? u.ai_energy : 100;
            document.getElementById('prof-ai-energy').innerText = energy + '%';
        }

        const prefsInput = document.getElementById('food-prefs-input');
        if (prefsInput) prefsInput.value = u.food_preferences || '';

        // Оновлення тоглів приватності V2.0
        if (u.privacy_settings) {
            const pw = document.getElementById('privacy-share-weight');
            const pc = document.getElementById('privacy-share-cycle');
            const pf = document.getElementById('privacy-share-food');
            if (pw) pw.checked = u.privacy_settings.share_weight !== false;
            if (pc) pc.checked = u.privacy_settings.share_cycle === true;
            if (pf) pf.checked = u.privacy_settings.share_food !== false;
        }

        const coachNutriCard = document.getElementById('coach-nutrition-card');
        const coachNutriPlan = document.getElementById('coach-nutrition-plan');
        if (u.nutrition_plan && u.nutrition_plan.trim() !== '') {
            if (coachNutriPlan) coachNutriPlan.innerHTML = window.formatMarkdown(u.nutrition_plan);
            if (coachNutriCard) coachNutriCard.style.display = 'block';
        } else {
            if (coachNutriCard) coachNutriCard.style.display = 'none';
        }

        const trainerStatusEl = document.getElementById('prof-trainer-status');
        const coachTextEl = document.getElementById('coach-status-text');

        if (u.trainer_name) {
            if (trainerStatusEl) {
                trainerStatusEl.innerText = loc('in_team', 'В команді: ') + u.trainer_name;
                trainerStatusEl.style.display = 'inline-block';
            }
            if (coachTextEl) {
                coachTextEl.innerHTML = loc('coach_active_text', 'Ваш персональний тренер <b>{name}</b> завжди на зв\'язку.').replace('{name}', u.trainer_name);
            }
        } else {
            if (trainerStatusEl) trainerStatusEl.style.display = 'none';
            if (coachTextEl) coachTextEl.innerHTML = loc('coach_ai_text', 'У вас поки немає тренера. Ви працюєте з ШІ-наставником.');
        }

        const compActive = document.getElementById('comp-active-view');
        const compEmpty = document.getElementById('comp-empty-view');
        const dashCompBanner = document.getElementById('dashboard-comp-banner');

        if (u.primary_goal === 'competition' && u.competition_sport && u.competition_date) {
            const d = new Date(u.competition_date);
            const today = new Date();
            const diffTime = d - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let daysText = diffDays > 0 ? loc('comp_days_left', `Залишилось {days} днів!`).replace('{days}', diffDays) : (diffDays === 0 ? loc('comp_today', "Змагання СЬОГОДНІ!") : loc('comp_passed', "Змагання пройшли"));
            let daysColor = diffDays > 0 ? "var(--success)" : (diffDays === 0 ? "var(--danger)" : "var(--hint-color)");

            if(document.getElementById('comp-sport-display')) document.getElementById('comp-sport-display').innerText = u.competition_sport;
            if(document.getElementById('comp-date-display')) document.getElementById('comp-date-display').innerText = u.competition_date.split('-').reverse().join('.');
            if(document.getElementById('comp-countdown-display')) {
                document.getElementById('comp-countdown-display').innerText = daysText;
                document.getElementById('comp-countdown-display').style.color = daysColor;
            }

            if(compActive) compActive.style.display = 'block';
            if(compEmpty) compEmpty.style.display = 'none';

            if (dashCompBanner) {
                dashCompBanner.style.display = 'flex';
                if(document.getElementById('dash-comp-sport')) document.getElementById('dash-comp-sport').innerText = u.competition_sport;
                if(document.getElementById('dash-comp-days')) {
                    document.getElementById('dash-comp-days').innerText = daysText;
                    document.getElementById('dash-comp-days').style.color = daysColor;
                }
            }
        } else {
            if(compActive) compActive.style.display = 'none';
            if(compEmpty) compEmpty.style.display = 'block';
            if(dashCompBanner) dashCompBanner.style.display = 'none';
        }

        const checkinCard = document.getElementById('checkin-card');
        if (checkinCard) {
            const hasCheckinToday = userData.today_checkin &&
                                  userData.today_checkin.sleep !== undefined &&
                                  userData.today_checkin.sleep !== null;
            if (!hasCheckinToday) {
                checkinCard.style.display = 'block';
            } else {
                checkinCard.style.display = 'none';
            }
        }

        if (userData && userData.workout_plan) {
            if(document.getElementById('plan-title')) document.getElementById('plan-title').innerText = userData.workout_plan.plan_name || loc('default_plan_name', "Персональна програма");

            if (userData.workout_plan.explanation) {
                if(document.getElementById('plan-explanation')) document.getElementById('plan-explanation').innerHTML = window.formatMarkdown(userData.workout_plan.explanation);
                if(document.getElementById('ai-insight-box')) document.getElementById('ai-insight-box').style.display = 'block';
            }

            if (userData.workout_plan.projections) {
                if(document.getElementById('plan-projections')) document.getElementById('plan-projections').innerHTML = window.formatMarkdown(userData.workout_plan.projections);
                if(document.getElementById('ai-projection-box')) document.getElementById('ai-projection-box').style.display = 'block';
            }

            const hasAdapted = userData.today_checkin && userData.today_checkin.adapted_plan;

            let tabToRender = (typeof globalActiveTab !== 'undefined' && globalActiveTab !== null) ? globalActiveTab : (hasAdapted ? 'adapted' : 0);
            if (tabToRender === 'adapted' && !hasAdapted) tabToRender = 0;

            if (typeof window.renderWorkoutDays === 'function') window.renderWorkoutDays(tabToRender);

            if(document.getElementById('finish-workout-wrapper')) document.getElementById('finish-workout-wrapper').style.display = 'block';
        }

        if (typeof window.loadNutrition === 'function') window.loadNutrition(activeFoodDate);

        if (!document.querySelector('.view.active:not(#loading-view)')) {
            showView('dashboard-view');
            document.body.classList.add('theme-dashboard');
        } else {
            const loader = document.getElementById('loading-view');
            if (loader) {
                loader.style.display = 'none';
                loader.classList.remove('active');
            }
        }

        window.refreshIcons();
    } catch (err) {
        console.error("Помилка відмальовування інтерфейсу:", err);
    }
}

// --- Реєстрація Тренера ---
async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('user_id', userId);

    showLoading("Завантаження фото...");

    try {
        const res = await fetch('/api/user/upload_avatar', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert("Аватарку оновлено!");
            await refreshUserData();
        } else {
            if (tg && tg.showAlert) tg.showAlert("Не вдалося завантажити фото.");
        }
    } catch (e) {
        console.error(e);
        if (tg && tg.showAlert) tg.showAlert("Помилка завантаження.");
    } finally {
        showView('profile-view');
        event.target.value = '';
    }
}

async function registerAsTrainer() {
    if (window.SubscriptionGuard && typeof window.SubscriptionGuard.checkOrPaywall === 'function') {
        window.SubscriptionGuard.checkOrPaywall('COACH_PANEL');
    } else {
        if (tg && tg.showAlert) tg.showAlert("Для реєстрації тренером оберіть підписку COACH у налаштуваннях.");
    }
}

// --- 4. НАЛАШТУВАННЯ ПРОФІЛЮ ТА ЗМАГАНЬ ---

function openQuickCompModal() {
    const u = userData.user;
    if (u.competition_sport) document.getElementById('quick-comp-sport').value = u.competition_sport;
    if (u.competition_date) document.getElementById('quick-comp-date').value = u.competition_date;
    const modal = document.getElementById('quick-comp-modal');
    if (modal) modal.classList.add('active');
}

async function saveQuickComp() {
    const sport = document.getElementById('quick-comp-sport').value.trim();
    const date = document.getElementById('quick-comp-date').value;
    if (!sport || !date) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_fill_fields', "Заповніть всі поля"));
        return;
    }

    const btn = document.getElementById('btn-save-quick-comp');
    if(btn) { btn.disabled = true; btn.innerText = "⏳..."; }
    showLoading(loc('loading_ai', "ШІ працює..."));

    const u = userData.user;
    const payload = {
        user_id: userId, name: u.name, gender: u.gender, height: u.height, age: u.age, weight: u.weight, target_weight: u.target_weight, activity_level: u.activity_level,
        primary_goal: 'competition', competition_sport: sport, competition_date: date,
        language: window.appLanguage || 'uk'
    };

    try {
        await fetch('/api/edit_profile', { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}, body: JSON.stringify(payload) });
        await fetch('/api/generate_plan/' + userId, { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true' } });
        closeModal('quick-comp-modal');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        await refreshUserData();
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка."));
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Зберегти"; }
    }
}

async function clearCompetition() {
    if (!confirm(loc('confirm_cancel_comp', "Скасувати підготовку до змагань?"))) return;
    showLoading(loc('loading_ai', "Оновлення..."));
    const u = userData.user;
    const payload = {
        user_id: userId, name: u.name, gender: u.gender, height: u.height, age: u.age, weight: u.weight, target_weight: u.target_weight, activity_level: u.activity_level,
        primary_goal: 'maintain', competition_sport: '', competition_date: '',
        language: window.appLanguage || 'uk'
    };
    try {
        await fetch('/api/edit_profile', { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}, body: JSON.stringify(payload) });
        await fetch('/api/generate_plan/' + userId, { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true' } });
        closeModal('quick-comp-modal');
        await refreshUserData();
    } catch(e) {}
}

async function saveFoodPrefs() {
    const prefsInput = document.getElementById('food-prefs-input');
    if (!prefsInput) return;
    try {
        await fetch('/api/user/food_prefs', {
            method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: userId, prefs: prefsInput.value })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert(loc('alert_saved', "Успішно збережено!"));
        refreshUserData();
    } catch(e) {}
}

function toggleCustomGoal(selectId, containerId, inputId) {
    const goalEl = document.getElementById(selectId);
    if(!goalEl) return;
    const goal = goalEl.value;
    const container = document.getElementById(containerId);
    const compContainer = document.getElementById(selectId === 'goal' ? 'competition-container' : 'edit-competition-container');
    if (container) {
        if (goal === 'custom' || goal === 'strength' || goal === 'endurance') { container.style.display = 'block'; }
        else { container.style.display = 'none'; if (document.getElementById(inputId)) document.getElementById(inputId).value = ''; }
    }
    if (compContainer) { if (goal === 'competition') { compContainer.style.display = 'block'; } else { compContainer.style.display = 'none'; } }
}

function toggleCycleContainer(genderSelectId, containerId) {
    const genderEl = document.getElementById(genderSelectId);
    if(!genderEl) return;
    const gender = genderEl.value;
    const container = document.getElementById(containerId);
    if (container) {
        if (gender === 'female') {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }
}

function openEditProfileModal() {
    const u = userData.user;
    if(document.getElementById('edit-height')) document.getElementById('edit-height').value = u.height;
    if(document.getElementById('edit-age')) document.getElementById('edit-age').value = u.age;
    if(document.getElementById('edit-weight')) document.getElementById('edit-weight').value = u.weight;
    if(document.getElementById('edit-target-weight')) document.getElementById('edit-target-weight').value = u.target_weight;
    if(document.getElementById('edit-activity')) document.getElementById('edit-activity').value = u.activity_level;

    if (u.competition_sport) {
        const compContainer = document.getElementById('edit-competition-container');
        if (compContainer) compContainer.style.display = 'block';
        if(document.getElementById('edit_comp_sport')) document.getElementById('edit_comp_sport').value = u.competition_sport;
        if(document.getElementById('edit_comp_date')) document.getElementById('edit_comp_date').value = u.competition_date;
    }

    const cycleContainer = document.getElementById('edit-cycle-container');
    if (u.gender === 'female') {
        if (cycleContainer) cycleContainer.style.display = 'block';
        if (u.cycle_start_date && document.getElementById('edit_cycle_start_date')) document.getElementById('edit_cycle_start_date').value = u.cycle_start_date;
        if (u.cycle_length && document.getElementById('edit_cycle_length')) document.getElementById('edit_cycle_length').value = u.cycle_length;
    } else {
        if (cycleContainer) cycleContainer.style.display = 'none';
    }

    const modal = document.getElementById('edit-profile-modal');
    if(modal) modal.classList.add('active');
}

async function smartRebuildPlan() {
    const textEl = document.getElementById('smart-rebuild-text');
    const text = textEl ? textEl.value.trim() : '';
    if (!text) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_fill_fields', "Опишіть, що змінилось."));
        return;
    }

    if (!confirm(loc('confirm_rebuild_plan', "Це перепише ваш поточний план. Продовжити?"))) return;

    const btn = document.getElementById('btn-smart-rebuild');
    if (btn) { btn.disabled = true; btn.innerText = "⏳..."; }
    
    closeModal('edit-profile-modal');
    showView('dashboard-view');
    renderWorkoutSkeleton();

    try {
        const res = await fetch('/api/smart_rebuild_plan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: userId, update_text: text })
        });
        const data = await res.json();
        
        if (data.message === 'PAYWALL') {
             if (window.SubscriptionGuard && typeof window.SubscriptionGuard.checkOrPaywall === 'function') {
                 window.SubscriptionGuard.checkOrPaywall('AI_WORKOUT_GEN');
             } else {
                 if (tg && tg.showAlert) tg.showAlert('Ви вичерпали свій ліміт генерацій. Оновіть підписку.');
             }
             await refreshUserData();
             return;
        }
        
        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (textEl) textEl.value = '';
            await refreshUserData();
        } else throw new Error();
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка"));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Перебудувати план'; window.refreshIcons(); }
    }
}

function renderWorkoutSkeleton() {
    const container = document.getElementById('workout-container');
    if (!container) return;
    
    let html = '<div style="margin-bottom: 20px;"><div class="skeleton-text" style="width: 150px; height: 24px;"></div></div>';
    
    // Render 3-4 skeleton cards
    for (let i = 0; i < 4; i++) {
        html += `
            <div class="skeleton-box skeleton-card">
                <div class="flex-between">
                    <div style="flex: 1; padding-right: 20px;">
                        <div class="skeleton-text" style="width: 80%; height: 20px;"></div>
                        <div class="skeleton-text" style="width: 50%; margin-bottom: 0;"></div>
                    </div>
                    <div class="skeleton-box" style="width: 40px; height: 40px; border-radius: 50%;"></div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

async function submitEditProfile() {
    const u = userData.user;
    const compSportEl = document.getElementById('edit_comp_sport');
    const compDateEl = document.getElementById('edit_comp_date');
    const cycleStartEl = document.getElementById('edit_cycle_start_date');
    const cycleLengthEl = document.getElementById('edit_cycle_length');

    const payload = {
        user_id: userId, name: u.name, gender: u.gender, primary_goal: u.primary_goal,
        height: parseInt(document.getElementById('edit-height').value),
        age: parseInt(document.getElementById('edit-age').value),
        weight: parseFloat(document.getElementById('edit-weight').value),
        target_weight: parseFloat(document.getElementById('edit-target-weight').value),
        activity_level: document.getElementById('edit-activity').value,
        competition_sport: compSportEl ? compSportEl.value.trim() : "",
        competition_date: compDateEl ? compDateEl.value : "",
        cycle_start_date: cycleStartEl && u.gender === 'female' ? cycleStartEl.value : "",
        cycle_length: cycleLengthEl && u.gender === 'female' ? parseInt(cycleLengthEl.value) || 28 : 28,
        language: window.appLanguage || 'uk'
    };
    closeModal('edit-profile-modal');
    showLoading(loc('loading_ai', "Оновлення..."));
    try {
        await fetch('/api/edit_profile', { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}, body: JSON.stringify(payload) });
        await refreshUserData();
    } catch (e) { renderApp(); }
}

async function submitProfile() {
    const btn = document.getElementById('submit-btn');
    const nameEl = document.getElementById('user_name');
    const ageEl = document.getElementById('age');
    const heightEl = document.getElementById('height');
    const weightEl = document.getElementById('weight');
    const targetWeightEl = document.getElementById('target_weight');

    if(!nameEl || !ageEl || !heightEl || !weightEl || !targetWeightEl) return;

    const name = nameEl.value.trim();
    const age = parseInt(ageEl.value);
    const height = parseInt(heightEl.value);
    const weight = parseFloat(weightEl.value);
    const targetWeight = parseFloat(targetWeightEl.value);
    const gender = document.getElementById('gender').value;

    if (!name || !age || !height || !weight || !targetWeight) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_fill_fields', "Заповніть всі поля."));
        return;
    }
    if(btn) btn.disabled = true;
    showLoading(loc('loading_ai', "Аналіз..."));

    const compSportEl = document.getElementById('comp_sport');
    const compDateEl = document.getElementById('comp_date');
    const cycleStartEl = document.getElementById('cycle_start_date');
    const cycleLengthEl = document.getElementById('cycle_length');

    const payload = {
        user_id: userId, name: name, gender: gender, age: age, height: height, weight: weight, target_weight: targetWeight, activity_level: document.getElementById('activity').value, primary_goal: document.getElementById('goal').value, custom_goal: document.getElementById('custom_goal') ? document.getElementById('custom_goal').value : "", notes: document.getElementById('notes').value,
        competition_sport: compSportEl && compSportEl.parentNode.style.display !== 'none' ? compSportEl.value.trim() : "",
        competition_date: compDateEl && compDateEl.parentNode.style.display !== 'none' ? compDateEl.value : "",
        cycle_start_date: cycleStartEl && gender === 'female' ? cycleStartEl.value : "",
        cycle_length: cycleLengthEl && gender === 'female' ? parseInt(cycleLengthEl.value) || 28 : 28,
        language: window.appLanguage || 'uk'
    };
    try {
        await fetch('/api/profile', { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}, body: JSON.stringify(payload) });
        const planRes = await fetch('/api/generate_plan/' + userId, { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true' } });
        const planData = await planRes.json();
        
        if (planData.message === 'PAYWALL') {
             // For FREE users, they just get saved but no plan is generated. Show app.
             await refreshUserData();
             if (window.SubscriptionGuard && typeof window.SubscriptionGuard.checkOrPaywall === 'function') {
                 // Trigger paywall immediately after they enter the app to tease them
                 setTimeout(() => window.SubscriptionGuard.checkOrPaywall('AI_WORKOUT_GEN'), 1000);
             }
        } else if (planData.status === 'success') {
             await refreshUserData();
        } else {
             if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка генерації"));
             showView('form-view'); if(btn) btn.disabled = false;
        }
    } catch (e) { showView('form-view'); if(btn) btn.disabled = false; }
}

// =========================================================
// --- ФАЗИ 2 ТА 3: КВЕСТИ, СТРІЧКА, ТЕПЛОВА МАПА ---
// =========================================================

window.loadDailyQuests = async function() {
    const container = document.getElementById('quests-container');
    if (!container) return;

    try {
        const res = await fetch('/api/quests/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.data) {
            let html = '';
            data.data.forEach(q => {
                let typeLabels = {
                    'water': '<i data-lucide="droplet" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Випити води (мл)',
                    'sets': '<i data-lucide="dumbbell" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Зробити підходів',
                    'volume': '<i data-lucide="weight" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Підняти тоннаж (кг)',
                    'meals': '<i data-lucide="apple" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Записати прийомів їжі',
                    'checkin': '<i data-lucide="activity" style="width: 14px; height: 14px; margin-bottom: -2px;"></i> Зробити чек-ін'
                };
                let title = typeLabels[q.quest_type] || q.quest_type;
                let progress = Math.min(q.progress, q.target);
                let percent = (progress / q.target) * 100;
                let statusColor = q.is_completed ? 'var(--success)' : 'var(--theme-color)';
                let bgAlpha = q.is_completed ? 'rgba(50, 215, 75, 0.1)' : 'rgba(255,255,255,0.02)';

                html += `<div style="background: ${bgAlpha}; border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; margin-bottom: 8px; transition: all 0.3s ease;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <div style="font-size: 14px; font-weight: bold; color: var(--text-color);">${title}</div>
                        <div style="font-size: 12px; color: var(--accent-gold); font-weight: bold;">+${q.reward_exp} EXP</div>
                    </div>
                    <div class="achieve-progress-bg" style="height: 8px; border-radius: 8px; margin-top: 8px;">
                        <div class="achieve-progress-fill" style="width: ${percent}%; background: ${statusColor}; border-radius: 8px; transition: width 1s ease;"></div>
                    </div>
                    <div style="font-size: 11px; color: var(--hint-color); text-align: right; margin-top: 4px;">${progress} / ${q.target}</div>
                </div>`;
            });
            container.innerHTML = html;
            window.refreshIcons();
        }
    } catch(e) {
        console.error(e);
    }
};

window.loadSocialFeed = async function() {
    const cont = document.getElementById('social-feed-container');
    if(!cont) return;

    cont.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">Завантаження подій...</p>';

    try {
        const res = await fetch('/api/social_feed/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            let html = '';
            data.data.forEach(e => {
                let timeParts = e.timestamp.split(' ');
                let datePart = timeParts[0].split('-').slice(1).join('/');
                let timePart = timeParts[1].slice(0, 5);
                let safeName = window.escapeHTML(e.name);
                let safeContent = window.escapeHTML(e.content);

                html += `<div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; gap: 12px; align-items: start;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--client-blue); display: flex; align-items: center; justify-content: center; font-weight: bold; color: #000; flex-shrink: 0; font-size: 18px;">${safeName.charAt(0)}</div>
                    <div>
                        <div style="font-weight: bold; font-size: 14px; color: var(--text-color); margin-bottom: 4px;">${safeName} <span style="font-size: 10px; color: var(--hint-color); font-weight: normal;">• ${datePart} ${timePart}</span></div>
                        <div style="font-size: 13px; color: var(--hint-color); line-height: 1.4;">${safeContent}</div>
                    </div>
                </div>`;
            });
            cont.innerHTML = html;
            window.refreshIcons();
        } else {
            cont.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">Поки що тут тихо. Запросіть друзів!</p>';
        }
    } catch(e) {
        cont.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 14px;">Помилка завантаження</p>';
    }
};

window.renderHeatmap = async function() {
    const cont = document.getElementById('heatmap-container');
    if(!cont) return;

    try {
        const res = await fetch('/api/heatmap/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success') {
            let heatMapData = {};
            data.data.forEach(d => heatMapData[d.day] = d.volume);

            let html = '';
            const today = new Date();
            today.setHours(0,0,0,0);

            // Рендеримо 14 колонок по 7 днів (останні 98 днів)
            for (let w = 13; w >= 0; w--) {
                html += '<div style="display:flex; flex-direction:column; gap:4px;">';
                for (let d = 6; d >= 0; d--) {
                    let date = new Date(today);
                    date.setDate(today.getDate() - (w * 7 + d));

                    // Форматуємо локальну дату, щоб не збивалося через UTC
                    let dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

                    let vol = heatMapData[dateStr] || 0;
                    let color = 'rgba(255,255,255,0.05)';
                    if (vol > 0 && vol <= 3000) color = 'rgba(50, 215, 75, 0.3)';
                    else if (vol > 3000 && vol <= 8000) color = 'rgba(50, 215, 75, 0.6)';
                    else if (vol > 8000) color = 'rgba(50, 215, 75, 1)';

                    html += `<div style="width: 12px; height: 12px; border-radius: 3px; background: ${color};" title="${dateStr}: ${vol} кг"></div>`;
                }
                html += '</div>';
            }
            cont.innerHTML = html;
        }
    } catch(e) {
        cont.innerHTML = '<p style="color:var(--hint-color); font-size: 12px;">Помилка завантаження мапи</p>';
    }
};

// --- 5. ГЕЙМІФІКАЦІЯ ---

async function loadGamification() {
    try {
        const res = await fetch('/api/gamification/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success') {
            if(document.getElementById('game-lvl')) document.getElementById('game-lvl').innerText = data.level;
            if(document.getElementById('game-exp')) document.getElementById('game-exp').innerText = data.exp_prog;
            if(document.getElementById('game-exp-need')) document.getElementById('game-exp-need').innerText = data.exp_need;
            
            // Анімація кільця досвіду (EXP Ring)
            const expRing = document.getElementById('game-exp-ring');
            if (expRing) {
                let percent = Math.min((data.exp_prog / data.exp_need) * 100, 100);
                let offset = 283 - (283 * percent / 100);
                expRing.style.strokeDashoffset = offset;
            }

            if (userData && userData.user) {
                let streak = userData.user.current_streak || 0;
                if(document.getElementById('game-streak')) document.getElementById('game-streak').innerText = streak;
                if(document.getElementById('game-freezes')) document.getElementById('game-freezes').innerText = userData.user.streak_freezes || 0;
            }

            const cont = document.getElementById('achievements-container');
            if(cont) {
                cont.innerHTML = '';

                const grouped = {};
                data.achievements.forEach(a => {
                    if (!grouped[a.type]) grouped[a.type] = [];
                    grouped[a.type].push(a);
                });

                const categoryTitles = {
                    'workouts': '<i data-lucide="dumbbell"></i> Тренування',
                    'volumes': '<i data-lucide="weight"></i> Тоннаж',
                    'streaks': '<i data-lucide="flame"></i> Дисципліна та Стріки',
                    'meals': '<i data-lucide="apple"></i> Харчування',
                    'levels': '<i data-lucide="star"></i> Рівні профілю',
                    'sets': '<i data-lucide="target"></i> Інше',
                    'checkins': '<i data-lucide="activity"></i> Активність'
                };

                let finalHtml = '';
                const order = ['levels', 'streaks', 'workouts', 'volumes', 'meals', 'sets', 'checkins'];
                const typesToRender = order.filter(t => grouped[t]).concat(Object.keys(grouped).filter(t => !order.includes(t)));

                typesToRender.forEach(type => {
                    const titleHtml = categoryTitles[type] || '<i data-lucide="award"></i> Досягнення';
                    finalHtml += `<h4 style="color: var(--theme-color); margin-top: 24px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 16px;">${titleHtml}</h4>`;

                    grouped[type].forEach(a => {
                        let isUnlocked = a.unlocked ? 'unlocked' : '';
                        let currentProg = a.cur > a.target ? a.target : a.cur;

                        let title = loc('achieve_' + a.id + '_title', a.title || a.id);
                        let desc = loc('achieve_' + a.id + '_desc', a.desc || '');
                        let doneText = loc('achieve_done', 'Виконано!');

                        let icon = '<i data-lucide="trophy"></i>';
                        if (a.id.startsWith('w')) icon = '<i data-lucide="calendar-check"></i>';
                        if (a.id.startsWith('m')) icon = '<i data-lucide="apple"></i>';
                        if (a.id.startsWith('c')) icon = '<i data-lucide="activity"></i>';
                        if (a.id.startsWith('s')) icon = '<i data-lucide="dumbbell"></i>';
                        if (a.id.startsWith('v')) icon = '<i data-lucide="weight"></i>';
                        if (a.id.startsWith('l')) icon = '<i data-lucide="star"></i>';
                        if (a.id.startsWith('strk')) icon = '<i data-lucide="flame"></i>';

                        let progressHTML = a.unlocked ? '<div class="achieve-progress-text">' + doneText + '</div>' : '<div class="achieve-progress-bg"><div class="achieve-progress-fill" style="width: ' + ((currentProg/a.target)*100) + '%"></div></div><div class="achieve-progress-text">' + currentProg + ' / ' + a.target + '</div>';

                        let rarityHTML = `<div style="font-size: 11px; color: var(--hint-color); margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; text-align: center;">Відкрито у <b style="color: var(--accent-gold);">${a.rarity_pct || 1}%</b> гравців</div>`;

                        finalHtml += '<div class="achieve-card ' + isUnlocked + '"><div class="achieve-icon">' + icon + '</div><div class="achieve-title">' + title + '</div><div class="achieve-desc">' + desc + '</div>' + progressHTML + rarityHTML + '</div>';
                    });
                });

                cont.innerHTML = finalHtml;
                window.refreshIcons();
            }

            loadLeaderboard('global');
            loadDuels();
        }
    } catch(e) {}
}

// --- 6. ГРАФІКИ ТА АНАТОМІЧНА МАПА ВТОМИ ---

async function loadProgressCharts() {
    try {
        const res = await fetch('/api/progress/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const responseData = await res.json();
        if (responseData.status === 'success') {
            progressDataInfo = responseData.data;
            
            // Завантажуємо реальну історію ваги
            renderWeightChart();

            renderMetricsChart(progressDataInfo.body_metrics);

            const select = document.getElementById('exercise-select');
            if (select) {
                select.innerHTML = '<option value="">-- --</option>';
                Object.keys(progressDataInfo.exercises).forEach(function(ex) { select.innerHTML += '<option value="' + ex + '">' + ex + '</option>'; });
                if (Object.keys(progressDataInfo.exercises).length > 0) { select.selectedIndex = 1; renderExerciseChart(); }
            }
        }
    } catch(e) { console.error("Error loading progress charts:", e); }
}

async function renderWeightChart() {
    const cardCanvas = document.getElementById('weightChartCard');
    const modalCanvas = document.getElementById('weightChartModal');
    if (!cardCanvas && !modalCanvas) return;

    try {
        const res = await fetch('/api/user/weight/history/' + userId + '?t=' + new Date().getTime(), { 
            cache: 'no-store',
            headers: { 'ngrok-skip-browser-warning': 'true' } 
        });
        const data = await res.json();
        
        let history = [];
        if (data.status === 'success') {
            history = data.data || [];
        } else {
            console.error("Failed to load history:", data);
        }

        if (history.length === 0) {
            history = [{date: new Date().toISOString().split('T')[0], weight: 0}];
        }

        const labels = history.map(h => {
            const d = new Date(h.date);
            return d.getDate() + '/' + (d.getMonth() + 1);
        });
        const weights = history.map(h => h.weight);

        if (labels.length > 0) {
            console.log("Rendering Weight Chart:", { labels, weights });
            // Render on dashboard card
            if (cardCanvas) {
                drawChart(cardCanvas, labels, weights, false);
            }
            
            // Render in modal if it's active
            const weightModal = document.getElementById('weight-modal');
            const logModal = document.getElementById('logWeightModal');
            if (modalCanvas && ((weightModal && weightModal.classList.contains('active')) || (logModal && logModal.classList.contains('active')))) {
                drawChart(modalCanvas, labels, weights, true);
            }
        }

    } catch (e) { console.error("Weight chart error:", e); }
}

let weightChartCardInstance = null;
let weightChartModalInstance = null;

function drawChart(canvas, labels, weights, isModal) {
    const ctx = canvas.getContext('2d');
    
    if (isModal) {
        if (weightChartModalInstance) weightChartModalInstance.destroy();
    } else {
        if (weightChartCardInstance) weightChartCardInstance.destroy();
    }

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Вага (кг)',
                data: weights,
                borderColor: '#bf5af2',
                backgroundColor: 'rgba(191, 90, 242, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: isModal ? 3 : 2,
                pointRadius: isModal ? 4 : 0,
                pointBackgroundColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: isModal }
            },
            scales: {
                x: { 
                    display: isModal, 
                    grid: { display: false }, 
                    ticks: { color: '#888', font: { size: 10 } } 
                },
                y: { 
                    display: true, 
                    beginAtZero: false, // Don't start at zero to show small changes
                    grace: '10%',       // Add padding to the scale range
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { 
                        display: isModal, 
                        color: '#888',
                        callback: function(value) { return value + ' кг'; }
                    } 
                }
            }
        }
    });

    if (isModal) {
        weightChartModalInstance = newChart;
    } else {
        weightChartCardInstance = newChart;
    }
}

function openLogWeightModal() {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    const modal = document.getElementById('logWeightModal');
    if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('new-weight-input');
        if (input && userData && userData.user) input.value = userData.user.weight;
        
        // Малюємо графік у модалці після невеликої затримки для ініціалізації canvas
        setTimeout(() => renderWeightChart(), 100);
    }
}

async function saveNewWeight() {
    const input = document.getElementById('new-weight-input');
    const weight = parseFloat(input ? input.value : 0);
    if (!weight || weight < 20 || weight > 300) {
        if (tg && tg.showAlert) tg.showAlert("Будь ласка, введіть коректну вагу.");
        return;
    }

    try {
        const res = await fetch('/api/user/weight/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, weight: weight })
        });
        if (res.ok) {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            closeModal('logWeightModal');
            await refreshUserData(); // Update global weight
            renderWeightChart(); // Refresh chart
        }
    } catch (e) { console.error(e); }
}

async function loadFatigueData() {
    if (!window.userData || !window.userData.user) return;
    
    // Перевірка лімітів (Blur для FREE та STARTER)
    const container = document.getElementById('anatomy-container');
    if (window.SubscriptionGuard && !window.SubscriptionGuard.checkHasAccess('FATIGUE_MAP')) {
        if (container) {
            container.style.filter = 'blur(4px)';
            container.style.pointerEvents = 'none';
            container.innerHTML += `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); padding: 15px 20px; border-radius: 16px; border: 1px solid var(--accent-gold); color: white; text-align: center; pointer-events: auto; cursor: pointer; z-index: 10;" onclick="window.SubscriptionGuard.checkOrPaywall('FATIGUE_MAP')"><i data-lucide="lock" style="margin-bottom: 8px; color: var(--accent-gold); width: 24px; height: 24px;"></i><br><b style="font-size:14px;">Розблокувати в PRO</b></div>`;
            window.refreshIcons();
        }
        return; // Зупиняємо завантаження даних
    } else {
        if (container) {
            container.style.filter = 'none';
            container.style.pointerEvents = 'auto';
        }
    }

    const isFemale = window.userData.user.gender === 'female';

    try {
        const res = await fetch('/api/muscle_fatigue/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success' && window.AnatomyMapper) {
            window.AnatomyMapper.drawBodyMap(isFemale ? 'female' : 'male');
            window.AnatomyMapper.applyFatigue(data.data);
        }
    } catch(e) {
        console.error("Помилка завантаження мапи тіла:", e);
    }
}

async function submitBodyMetrics() {
    const waist = parseFloat(document.getElementById('metric-waist').value) || 0;
    const hips = parseFloat(document.getElementById('metric-hips').value) || 0;
    const chest = parseFloat(document.getElementById('metric-chest').value) || 0;
    const biceps = parseFloat(document.getElementById('metric-biceps').value) || 0;

    if (!waist && !hips && !chest && !biceps) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_fill_fields', "Введіть замір!"));
        return;
    }
    const btn = document.getElementById('btn-save-metrics');
    if(btn) { btn.disabled = true; btn.innerText = "⏳..."; }

    try {
        await fetch('/api/log_body_metrics', { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}, body: JSON.stringify({user_id: userId, waist: waist, hips: hips, chest: chest, biceps: biceps}) });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert(loc('alert_saved', "Збережено!"));

        document.getElementById('metric-waist').value = ''; document.getElementById('metric-hips').value = ''; document.getElementById('metric-chest').value = ''; document.getElementById('metric-biceps').value = '';
        loadProgressCharts();
    } catch(e) { console.error(e); } finally { if(btn) { btn.disabled = false; btn.innerText = loc('btn_save_metrics', "Зберегти заміри"); } }
}



function renderExerciseChart() {
    if (typeof Chart === 'undefined' || !document.getElementById('exerciseChart')) return;
    const select = document.getElementById('exercise-select'); if (!select) return; const exName = select.value;
    if (exerciseChartInstance) exerciseChartInstance.destroy(); if (!exName || !progressDataInfo || !progressDataInfo.exercises[exName]) return;
    const data = progressDataInfo.exercises[exName]; const ctx = document.getElementById('exerciseChart').getContext('2d');
    const labels = data.map(function(d) { return d.date.split('-').slice(1).join('/'); }); const weights = data.map(function(d) { return d.weight; });
    exerciseChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: loc('chart_work_weight', 'Робоча вага (кг)'),
                data: weights,
                backgroundColor: '#d4af37',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false } },
                x: { grid: { display: false, drawBorder: false } }
            }
        }
    });
}

function renderMetricsChart(data) {
    if (typeof Chart === 'undefined' || !document.getElementById('metricsChart')) return;
    if (metricsChartInstance) metricsChartInstance.destroy();
    const canvas = document.getElementById('metricsChart'); if (!canvas) return;
    if (!data || data.length === 0) return;
    const ctx = canvas.getContext('2d'); const labels = data.map(function(d) { return d.date.split('-').slice(1).join('/'); });
    const datasets = [
        { label: loc('chart_waist', 'Талія'), data: data.map(function(d) { return d.waist > 0 ? d.waist : null; }), borderColor: '#ffffff', tension: 0.4, spanGaps: true },
        { label: loc('chart_hips', 'Стегна'), data: data.map(function(d) { return d.hips > 0 ? d.hips : null; }), borderColor: '#00ea66', tension: 0.4, spanGaps: true },
        { label: loc('chart_chest', 'Груди'), data: data.map(function(d) { return d.chest > 0 ? d.chest : null; }), borderColor: '#d4af37', tension: 0.4, spanGaps: true },
        { label: loc('chart_biceps', 'Біцепс'), data: data.map(function(d) { return d.biceps > 0 ? d.biceps : null; }), borderColor: '#ff2d55', tension: 0.4, spanGaps: true }
    ];
    metricsChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: '#888888', boxWidth: 12 } } },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false } },
                x: { grid: { display: false, drawBorder: false } }
            }
        }
    });
}

// --- 7. УТИЛІТИ НАВІГАЦІЇ ТА МОДАЛОК ---

function showView(viewId) {
    document.querySelectorAll('.view').forEach(function(el) {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    window.scrollTo(0, 0);
}

function navTo(viewId, el) {
    document.querySelectorAll('.nav-item').forEach(function(item) { item.classList.remove('active'); });
    if (el) el.classList.add('active');

    if (typeof window.showView === 'function') {
        window.showView(viewId);
    } else {
        showView(viewId);
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();

    // Оновлюємо тему
    Array.from(document.body.classList).forEach(className => {
        if (className.startsWith('theme-')) {
            document.body.classList.remove(className);
        }
    });

    let themeMap = {
        'profile-view': 'theme-profile',
        'dashboard-view': 'theme-dashboard',
        'nutrition-view': 'theme-nutrition',
        'progress-view': 'theme-progress',
        'coach-view': 'theme-coach',
        'gamification-view': 'theme-gamification',
        'cycle-view': 'theme-cycle'
    };

    let newTheme = themeMap[viewId] || 'theme-dashboard';

    if (viewId === 'cycle-view' && typeof userCycleData !== 'undefined' && userCycleData) {
        const cycleLen = userCycleData.cycle_length || 28;
        const ovulationDay = cycleLen - 14;

        if (userCycleData.cycle_start_date) {
            const parts = userCycleData.cycle_start_date.split('-');
            const startDate = new Date(parts[0], parts[1] - 1, parts[2]);

            let targetDate = new Date();
            if (typeof activeLogDate !== 'undefined' && activeLogDate) {
                const tdParts = activeLogDate.split('-');
                targetDate = new Date(tdParts[0], tdParts[1] - 1, tdParts[2]);
            }

            startDate.setHours(0, 0, 0, 0);
            targetDate.setHours(0, 0, 0, 0);

            const diffTime = targetDate.getTime() - startDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            let currentDay = diffDays >= 0 ? (diffDays % cycleLen) + 1 : 1;

            if (currentDay >= 1 && currentDay <= 5) newTheme = 'theme-menstruation';
            else if (currentDay >= 6 && currentDay < (ovulationDay - 1)) newTheme = 'theme-follicular';
            else if (currentDay >= (ovulationDay - 1) && currentDay <= (ovulationDay + 1)) newTheme = 'theme-ovulation';
            else newTheme = 'theme-luteal';
        }
    }

    document.body.classList.add(newTheme);

    if (viewId === 'progress-view') {
        loadProgressCharts();
        loadFatigueData();
        if (typeof window.renderHeatmap === 'function') window.renderHeatmap();
    }
    if (viewId === 'gamification-view') {
        loadGamification();
        if (typeof window.loadDailyQuests === 'function') window.loadDailyQuests();
        if (typeof window.loadSocialFeed === 'function') window.loadSocialFeed();
    }
    if (viewId === 'cycle-view') loadCycleDashboard();
    if (viewId === 'nutrition-view') {
        if (typeof window.renderFoodWeeklyCalendar === 'function') window.renderFoodWeeklyCalendar();
    }
}

function showLoading(text) {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.innerText = text;

    if (typeof window.showView === 'function') {
        window.showView('loading-view');
    } else {
        showView('loading-view');
    }

    const loader = document.getElementById('loading-view');
    if(loader) loader.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');

    if (modalId === 'workout-modal' && typeof currentTimerLeft !== 'undefined') {
        if (typeof timerInterval !== 'undefined' && timerInterval) clearInterval(timerInterval);
        const timerView = document.getElementById('timer-view');
        const logForm = document.getElementById('log-form');
        if (timerView) timerView.style.display = 'none';
        if (logForm) logForm.style.display = 'block';
        if (typeof REST_TIME_SECONDS !== 'undefined') currentTimerLeft = REST_TIME_SECONDS;
        if (typeof updateTimerText === 'function') updateTimerText(currentTimerLeft);
    }
}

// --- 8. FEMTECH 3.0: ЖІНОЧИЙ ЦИКЛ (Ретроспективний логер) ---

async function loadCycleDashboard() {
    try {
        const res = await fetch('/api/cycle/dashboard/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success') {
            userCycleData = data.data || {};

            if (!activeLogDate) {
                const today = new Date();
                activeLogDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            }

            await loadCycleDay(activeLogDate);
            loadCycleHistoryChart();
            renderCycleMiniCalendar();
        }
    } catch (e) { console.error(e); }
}

function renderCycleMiniCalendar() {
    const container = document.getElementById('cycle-mini-calendar');
    if (!container) return;

    const today = new Date();
    const dayNames = ['Нд', 'Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб'];
    let html = '';

    // Get Monday of current week
    const currentDay = today.getDay();
    const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(new Date().setDate(diff));

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const isToday = new Date().toDateString() === date.toDateString();
        const isSelected = dateStr === activeLogDate;
        
        let dateStyle = 'font-size: 16px; color: var(--text-color); font-weight: bold; margin-top: 4px;';
        if (isSelected) dateStyle += ' color: var(--theme-color);';

        html += `
            <div class="text-center" style="flex: 1; position: relative; cursor: pointer;" onclick="window.loadCycleDay('${dateStr}')">
                ${dayNames[date.getDay()]}<br>
                <div style="${dateStyle}">${date.getDate()}</div>
                ${isToday ? '<div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: var(--theme-color); border-radius: 50%;"></div>' : ''}
            </div>`;
    }
    container.innerHTML = html;
}

window.loadCycleDay = async function(dateStr) {
    activeLogDate = dateStr;

    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    d.setHours(0,0,0,0);

    let titleText = "Твій стан";
    if (d.getTime() === today.getTime()) {
        titleText = "Твій стан сьогодні";
    } else {
        const monthNames = ["Січня", "Лютого", "Березня", "Квітня", "Травня", "Червня", "Липня", "Серпня", "Вересня", "Жовтня", "Листопада", "Грудня"];
        titleText = `Твій стан за ${d.getDate()} ${monthNames[d.getMonth()]}`;
    }

    const titleEl = document.getElementById('cycle-symptoms-title');
    if (titleEl) {
        titleEl.innerHTML = `<i data-lucide="activity"></i> ${titleText}`;
        window.refreshIcons();
    }

    try {
        const res = await fetch(`/api/cycle/symptoms/${userId}/${dateStr}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        let symp = {};
        if (data.status === 'success' && data.data) {
            symp = data.data;
        }
        updateCycleUI(userCycleData, symp, dateStr);
    } catch (e) {
        updateCycleUI(userCycleData, {}, dateStr);
    }
};

function updateCycleUI(data, symp, dateStr) {
    const startDateStr = data.cycle_start_date;
    const cycleLength = data.cycle_length || 28;

    const ringText = document.getElementById('cycle-ring-text');
    const ringCircle = document.getElementById('cycle-ring-circle');

    if (!startDateStr) {
        if (ringText) ringText.innerHTML = "Day 1";
        return;
    }

    const parts = startDateStr.split('-');
    const startDate = new Date(parts[0], parts[1] - 1, parts[2]);

    const targetDateParts = dateStr.split('-');
    const targetDate = new Date(targetDateParts[0], targetDateParts[1] - 1, targetDateParts[2]);

    startDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let currentDay = diffDays >= 0 ? (diffDays % cycleLength) + 1 : 1;

    const ovulationDay = cycleLength - 14;
    let phase = ""; let color = ""; let ringClass = "";

    if (currentDay >= 1 && currentDay <= 5) {
        phase = "Менструація"; color = "#ff2d55"; ringClass = "ring-menstruation";
    } else if (currentDay >= 6 && currentDay < (ovulationDay - 1)) {
        phase = "Фолікулярна фаза"; color = "#0a84ff"; ringClass = "ring-follicular";
    } else if (currentDay >= (ovulationDay - 1) && currentDay <= (ovulationDay + 1)) {
        phase = "Овуляторна phase"; color = "#bf5af2"; ringClass = "ring-ovulation";
    } else {
        phase = "Лютеїнова фаза"; color = "#ffd60a"; ringClass = "ring-luteal";
    }

    if (ringText) {
        ringText.innerHTML = `<span style="font-size: 48px; font-weight: 900; color: ${color}; font-family: 'Space Grotesk', sans-serif; line-height: 1.1; margin-bottom: 4px;">Day ${currentDay}</span><span style="font-size: 14px; color: var(--hint-color); text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.2;">${phase}</span>`;
    }
    if (ringCircle) {
        ringCircle.className = '';
        ringCircle.classList.add(ringClass);
        ringCircle.style.borderColor = color;
    }

    Array.from(document.body.classList).forEach(className => {
        if (className.startsWith('theme-')) {
            document.body.classList.remove(className);
        }
    });

    if (currentDay >= 1 && currentDay <= 5) document.body.classList.add('theme-menstruation');
    else if (currentDay >= 6 && currentDay < (ovulationDay - 1)) document.body.classList.add('theme-follicular');
    else if (currentDay >= (ovulationDay - 1) && currentDay <= (ovulationDay + 1)) document.body.classList.add('theme-ovulation');
    else document.body.classList.add('theme-luteal');

    document.querySelectorAll('.symptom-chip').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mood-emoji').forEach(el => {
        el.style.opacity = '0.4';
        el.style.transform = 'scale(1.0)';
    });

    if (symp) {
        if (symp.flow_level) setActiveChipUI('flow', symp.flow_level);
        if (symp.pain_level > 0) setActiveChipUI('pain', symp.pain_level.toString());
        
        if (['😫', '😐', '🤩'].includes(symp.mood)) {
            const selectedObj = document.getElementById('mood-emoji-' + symp.mood);
            if (selectedObj) {
                selectedObj.style.opacity = '1';
                selectedObj.style.transform = 'scale(1.2)';
            }
        } else if (symp.mood) {
            setActiveChipUI('mood', symp.mood);
        }
        
        if (symp.sleep) setActiveChipUI('sleep', symp.sleep);
        if (symp.digestion) setActiveChipUI('digestion', symp.digestion);
        if (symp.physical) setActiveChipUI('physical', symp.physical);
        if (symp.sexual_activity) setActiveChipUI('sexual_activity', symp.sexual_activity);
    }
}

function setActiveChipUI(category, value) {
    const chip = document.querySelector(`.symptom-chip[data-category="${category}"][data-value="${value}"]`);
    if (chip) chip.classList.add('active');
}

window.toggleSymptom = async function(element, category, value) {
    const isActive = element.classList.contains('active');
    document.querySelectorAll(`.symptom-chip[data-category="${category}"]`).forEach(el => el.classList.remove('active'));

    if (!isActive) {
        element.classList.add('active');
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();

    const flow = document.querySelector('.symptom-chip[data-category="flow"].active')?.dataset.value || "";
    const pain = document.querySelector('.symptom-chip[data-category="pain"].active')?.dataset.value || "0";
    const mood = document.querySelector('.symptom-chip[data-category="mood"].active')?.dataset.value || "";
    const sleep = document.querySelector('.symptom-chip[data-category="sleep"].active')?.dataset.value || "";
    const digestion = document.querySelector('.symptom-chip[data-category="digestion"].active')?.dataset.value || "";
    const physical = document.querySelector('.symptom-chip[data-category="physical"].active')?.dataset.value || "";
    const sexual = document.querySelector('.symptom-chip[data-category="sexual_activity"].active')?.dataset.value || "";

    const targetDate = activeLogDate || (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));

    try {
        await fetch('/api/cycle/symptoms', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({
                user_id: userId, date: targetDate, flow_level: flow,
                pain_level: parseInt(pain), mood: mood, sleep: sleep,
                digestion: digestion, physical: physical, libido: "", sexual_activity: sexual, notes: ""
            })
        });
    } catch (e) { console.error("Помилка збереження", e); }
};

window.logCycleWellbeing = async function(emoji) {
    document.querySelectorAll('.mood-emoji').forEach(el => {
        el.style.opacity = '0.4';
        el.style.transform = 'scale(1.0)';
    });
    const selectedObj = document.getElementById('mood-emoji-' + emoji);
    if (selectedObj) {
        selectedObj.style.opacity = '1';
        selectedObj.style.transform = 'scale(1.2)';
    }

    const flow = document.querySelector('.symptom-chip[data-category="flow"].active')?.dataset.value || "";
    const pain = document.querySelector('.symptom-chip[data-category="pain"].active')?.dataset.value || "0";
    const sleep = document.querySelector('.symptom-chip[data-category="sleep"].active')?.dataset.value || "";
    const digestion = document.querySelector('.symptom-chip[data-category="digestion"].active')?.dataset.value || "";
    const physical = document.querySelector('.symptom-chip[data-category="physical"].active')?.dataset.value || "";
    const sexual = document.querySelector('.symptom-chip[data-category="sexual_activity"].active')?.dataset.value || "";
    const targetDate = activeLogDate || (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));

    try {
        await fetch('/api/cycle/symptoms', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({
                user_id: userId, date: targetDate, flow_level: flow,
                pain_level: parseInt(pain), mood: emoji, sleep: sleep,
                digestion: digestion, physical: physical, libido: "", sexual_activity: sexual, notes: ""
            })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert("Самопочуття збережено: " + emoji);
    } catch (e) { console.error("Помилка збереження", e); }
};

window.generateCycleInsight = async function(element) {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    if (window.SubscriptionGuard && !window.SubscriptionGuard.checkOrPaywall('FEM_TECH_ADVANCED')) {
        return;
    }

    let subtitleEl = element ? element.querySelector('div[style*="font-size: 12px"]') : null;
    let oldText = subtitleEl ? subtitleEl.innerText : "Медичний інсайт";

    if (subtitleEl) {
        if (subtitleEl.innerText === "Генерую...") return; // Prevent spam clicks
        subtitleEl.innerText = "Генерую...";
        subtitleEl.style.color = "var(--theme-color)";
    }

    try {
        const res = await fetch('/api/cycle/advice/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        
        if (subtitleEl) {
            subtitleEl.innerText = oldText;
            subtitleEl.style.color = "var(--hint-color)";
        }

        if (data.status === 'success' && data.advice) {
            let adviceText = typeof data.advice === 'string' ? data.advice : (data.advice.insight || JSON.stringify(data.advice));
            
            const textEl = document.getElementById('cycle-advice-text');
            if (textEl) textEl.innerText = adviceText;
            
            const adviceModal = document.getElementById('cycle-advice-modal');
            if (adviceModal) adviceModal.classList.add('active');
        } else {
            if (tg && tg.showAlert) tg.showAlert("Не вдалося згенерувати звіт.");
        }
    } catch (e) {
        if (subtitleEl) {
            subtitleEl.innerText = oldText;
            subtitleEl.style.color = "var(--hint-color)";
        }
        if (tg && tg.showAlert) tg.showAlert("Помилка зв'язку з сервером: " + e.message);
    }
};

window.adaptWorkoutForCycle = async function() {
    if (window.SubscriptionGuard && !window.SubscriptionGuard.checkOrPaywall('DYNAMIC_ADAPT')) {
        return;
    }

    if (!userData || !userData.workout_plan || !userData.workout_plan.days) {
        if (tg && tg.showAlert) tg.showAlert("У вас немає активного плану тренувань.");
        return;
    }

    if (!confirm("Адаптувати сьогоднішнє тренування під твій поточний стан?")) return;

    const btn = document.querySelector('button[onclick="adaptWorkoutForCycle()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Адаптуємо...'; window.refreshIcons(); }

    const flow = document.querySelector('.symptom-chip[data-category="flow"].active')?.dataset.value || "";
    const pain = document.querySelector('.symptom-chip[data-category="pain"].active')?.dataset.value || "0";
    const mood = document.querySelector('.symptom-chip[data-category="mood"].active')?.dataset.value || "";
    const sleep = document.querySelector('.symptom-chip[data-category="sleep"].active')?.dataset.value || "";
    const digestion = document.querySelector('.symptom-chip[data-category="digestion"].active')?.dataset.value || "";
    const physical = document.querySelector('.symptom-chip[data-category="physical"].active')?.dataset.value || "";
    const sexual = document.querySelector('.symptom-chip[data-category="sexual_activity"].active')?.dataset.value || "";

    const today = new Date();
    const localDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    let cycleDay = 1;
    if (userCycleData && userCycleData.cycle_start_date) {
        const parts = userCycleData.cycle_start_date.split('-');
        const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
        startDate.setHours(0,0,0,0);
        const diffDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        cycleDay = diffDays >= 0 ? (diffDays % (userCycleData.cycle_length || 28)) + 1 : 1;
    }

    const symptoms = { flow_level: flow, pain_level: parseInt(pain), mood: mood, sleep: sleep, digestion: digestion, physical: physical, sexual_activity: sexual };

    try {
        const res = await fetch('/api/cycle/adapt_workout', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({
                user_id: userId,
                date: localDateStr,
                symptoms: symptoms,
                cycle_day: cycleDay,
                current_day_plan: userData.workout_plan.days[currentDayIndex] || {}
            })
        });
        const data = await res.json();

        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            await refreshUserData();
            navTo('dashboard-view');
            if (typeof window.renderWorkoutDays === 'function') window.renderWorkoutDays('adapted');
        } else {
            if (tg && tg.showAlert) tg.showAlert("Помилка адаптації.");
        }
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert("Помилка зв'язку з сервером.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="dumbbell"></i> Адаптувати тренування під стан'; window.refreshIcons(); }
    }
};

window.logPeriodStart = async function() {
    if (!confirm("Відмітити початок нового циклу сьогодні?")) return;

    const today = new Date();
    const localDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    const btn = document.getElementById('btn-log-period');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Зачекайте...'; window.refreshIcons(); }

    try {
        await fetch('/api/cycle/period', {
            method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: userId, start_date: localDateStr, end_date: "" })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        await refreshUserData();
        loadCycleDashboard();
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert("Помилка");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="droplet"></i> Відмітила початок'; window.refreshIcons(); }
    }
};

async function loadCycleHistoryChart() {
    if (typeof Chart === 'undefined' || !document.getElementById('cycleHistoryChart')) return;

    try {
        const res = await fetch('/api/cycle/history/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.data) {
            const historyData = data.data.reverse();
            const canvas = document.getElementById('cycleHistoryChart');
            const ctx = canvas.getContext('2d');

            if (cycleHistoryChartInstance) cycleHistoryChartInstance.destroy();

            const labels = historyData.map(d => {
                const date = new Date(d.start_date);
                return date.toLocaleString('uk-UA', { month: 'short', day: 'numeric' });
            });

            const lengths = historyData.map(d => d.cycle_length);

            cycleHistoryChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Тривалість циклу (днів)',
                        data: lengths,
                        backgroundColor: '#ff2d55',
                        borderRadius: 8,
                        categoryPercentage: 0.8,
                        barPercentage: 0.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: false,
                            min: Math.max(15, Math.min(...lengths) - 5),
                            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }
                        },
                        x: { 
                            grid: { display: false, drawBorder: false },
                            ticks: {
                                autoSkip: true,
                                padding: 10
                            }
                        }
                    }
                }
            });
        }
    } catch (e) { console.error(e); }
}

window.openFullCalendar = function() {
    document.getElementById('full-calendar-modal').classList.add('active');
    currentCalendarDate = new Date();
    renderCalendar();
};

window.changeCalendarMonth = function(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendar();
};

window.selectCalendarDate = function(dateStr) {
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (selectedDate > today) {
        if (tg && tg.showAlert) tg.showAlert("Майбутні дати недоступні для запису симптомів.");
        return;
    }

    closeModal('full-calendar-modal');
    window.loadCycleDay(dateStr);
};

async function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    document.getElementById('calendar-month-year').innerText = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('calendar-grid-content');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startingDayOfWeek = firstDay.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const startFetchDate = new Date(year, month, 1 - startingDayOfWeek);
    const endFetchDate = new Date(year, month, daysInMonth + (42 - (daysInMonth + startingDayOfWeek)));

    const startStr = startFetchDate.getFullYear() + '-' + String(startFetchDate.getMonth() + 1).padStart(2, '0') + '-' + String(startFetchDate.getDate()).padStart(2, '0');
    const endStr = endFetchDate.getFullYear() + '-' + String(endFetchDate.getMonth() + 1).padStart(2, '0') + '-' + String(endFetchDate.getDate()).padStart(2, '0');

    let symptomsDict = {};
    try {
        const res = await fetch(`/api/cycle/calendar/${userId}?start_date=${startStr}&end_date=${endStr}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success') {
            data.data.forEach(s => {
                symptomsDict[s.date] = true;
            });
        }
    } catch(e) {}

    const cycleStart = userCycleData?.cycle_start_date ? new Date(userCycleData.cycle_start_date) : null;
    const cycleLen = userCycleData?.cycle_length || 28;
    if (cycleStart) cycleStart.setHours(0,0,0,0);

    const today = new Date();
    today.setHours(0,0,0,0);

    let html = '';
    let dayCounter = 1;
    let nextMonthCounter = 1;

    for (let i = 0; i < 42; i++) {
        let cellDate = new Date(year, month, dayCounter);
        let isCurrentMonth = true;
        let displayNum = 0;

        if (i < startingDayOfWeek) {
            displayNum = prevMonthLastDay - startingDayOfWeek + i + 1;
            cellDate = new Date(year, month - 1, displayNum);
            isCurrentMonth = false;
        } else if (dayCounter > daysInMonth) {
            displayNum = nextMonthCounter++;
            cellDate = new Date(year, month + 1, displayNum);
            isCurrentMonth = false;
        } else {
            displayNum = dayCounter++;
        }

        const cellDateStr = cellDate.getFullYear() + '-' + String(cellDate.getMonth() + 1).padStart(2, '0') + '-' + String(cellDate.getDate()).padStart(2, '0');

        let classes = ['calendar-day'];
        if (!isCurrentMonth) classes.push('other-month');
        if (cellDate.getTime() === today.getTime()) classes.push('today');
        if (cellDateStr === activeLogDate) classes.push('selected');

        let onClickHtml = '';
        if (cellDate > today) {
            classes.push('disabled');
        } else {
            onClickHtml = `onclick="selectCalendarDate('${cellDateStr}')"`;
        }

        let dotsHtml = '';

        if (cycleStart) {
            const diffTime = cellDate.getTime() - cycleStart.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0) {
                let cDay = (diffDays % cycleLen) + 1;

                if (cellDate <= today) {
                    if (cDay >= 1 && cDay <= 5) dotsHtml += '<div class="cal-dot red"></div>';
                    if (cDay >= (cycleLen - 15) && cDay <= (cycleLen - 13)) dotsHtml += '<div class="cal-dot blue"></div>';
                } else {
                    let cycleNumber = Math.floor(diffDays / cycleLen);
                    if (cycleNumber <= 3) {
                        if (cDay >= 1 && cDay <= 5) dotsHtml += '<div class="cal-dot red" style="opacity: 0.5; box-shadow: none;"></div>';
                        if (cDay >= (cycleLen - 15) && cDay <= (cycleLen - 13)) dotsHtml += '<div class="cal-dot blue" style="opacity: 0.5; box-shadow: none;"></div>';
                    }
                }
            }
        }

        if (symptomsDict[cellDateStr]) {
            dotsHtml += '<div class="cal-dot yellow"></div>';
        }

        html += `<div class="${classes.join(' ')}" ${onClickHtml}>${displayNum}<div class="calendar-dots">${dotsHtml}</div></div>`;
    }
    grid.innerHTML = html;
}

// =========================================================
// --- 9. СОЦІАЛЬНИЙ РУШІЙ ТА ЗМАГАННЯ (СТРІКИ, РЕЙТИНГИ, ДУЕЛІ) ---
// =========================================================

async function switchLeaderboard(type) {
    const btnGlobal = document.getElementById('btn-tab-global');
    const btnTeam = document.getElementById('btn-tab-team');
    const btnFriends = document.getElementById('btn-tab-friends');
    const btnFamily = document.getElementById('btn-tab-family');

    const resetBtn = (btn) => {
        if (btn) { btn.style.background = 'transparent'; btn.style.color = 'var(--text-color)'; }
    };
    const activeBtn = (btn) => {
        if (btn) { btn.style.background = 'var(--text-color)'; btn.style.color = '#000'; }
    };

    resetBtn(btnGlobal); resetBtn(btnTeam); resetBtn(btnFriends); resetBtn(btnFamily);

    if (type === 'global') activeBtn(btnGlobal);
    if (type === 'team') activeBtn(btnTeam);
    if (type === 'friends') activeBtn(btnFriends);
    if (type === 'family') activeBtn(btnFamily);

    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    await loadLeaderboard(type);
}

async function loadLeaderboard(type) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">Завантаження рейтингу...</p>';

    try {
        let url = '/api/leaderboard/global';
        if (type === 'team') {
            if (userData && userData.user && userData.user.trainer_id) {
                url = '/api/leaderboard/team/' + userData.user.trainer_id;
            } else {
                container.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px; padding: 20px;">Ви поки не перебуваєте в команді жодного тренера.</p>';
                return;
            }
        } else if (type === 'friends') {
            url = '/api/leaderboard/friends/' + userId;
        } else if (type === 'family') {
            url = '/api/leaderboard/family/' + userId;
        }

        const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            let html = '';
            data.data.forEach((user, index) => {
                let rankMedal = `<span style="color: var(--hint-color); font-weight: 700;">#${index + 1}</span>`;
                if (index === 0) rankMedal = `<i data-lucide="medal" style="color: #ffd700; width: 24px; height: 24px;"></i>`;
                if (index === 1) rankMedal = `<i data-lucide="medal" style="color: #c0c0c0; width: 20px; height: 20px;"></i>`;
                if (index === 2) rankMedal = `<i data-lucide="medal" style="color: #cd7f32; width: 18px; height: 18px;"></i>`;

                let isMe = (user.user_id === userId) ? 'background: rgba(10, 132, 255, 0.1); border-color: var(--client-blue);' : 'background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.05);';
                let avatarHtml = user.avatar_url ? `<img src="${user.avatar_url}?v=${new Date().getTime()}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;"><i data-lucide="user" style="width: 20px; height: 20px; color: var(--hint-color);"></i></div>`;

                html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid transparent; ${isMe} border-radius: 12px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="font-weight: 900; font-size: 18px; width: 30px; text-align: center; color: var(--hint-color); display: flex; align-items: center; justify-content: center;">${rankMedal}</div>
                        ${avatarHtml}
                        <div>
                            <div style="font-weight: 700; font-size: 15px; color: var(--text-color);">${window.escapeHTML(user.name)} <span style="font-size: 11px; color: var(--accent-gold); border: 1px solid var(--accent-gold); padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Lvl ${user.level}</span></div>
                            <div style="font-size: 12px; color: var(--hint-color); margin-top: 4px;">Досвід: <b style="color: var(--text-color);">${user.exp} EXP</b></div>
                        </div>
                    </div>
                    <div style="font-size: 18px; font-weight: bold; color: #ff9500; display: flex; align-items: center; gap: 4px;"><i data-lucide="flame" style="width: 16px; height: 16px; fill: #ff9500;"></i> <span style="font-size: 16px;">${user.current_streak}</span></div>
                </div>`;
            });
            container.innerHTML = html;
            window.refreshIcons();
        } else {
            if (type === 'friends') {
                container.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px; padding: 20px;">У вас поки немає друзів. Натисніть кнопку вище, щоб запросити їх!</p>';
            } else {
                container.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">Рейтинг порожній.</p>';
            }
        }
    } catch (e) {
        container.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 14px;">Помилка завантаження.</p>';
    }
}

window.updateDuelButtonText = function() {
    const select = document.getElementById('duel-opponent');
    const btn = document.getElementById('btn-submit-duel');
    if (!select || !btn) return;

    if (select.value === "0") {
        btn.innerHTML = '<i data-lucide="link"></i> Згенерувати посилання-виклик';
    } else {
        const opt = select.options[select.selectedIndex];
        btn.innerHTML = `<i data-lucide="swords"></i> Кинути виклик: ${opt.getAttribute('data-name')}`;
    }
    window.refreshIcons();
};

window.openCreateDuelModal = async function() {
    const modal = document.getElementById('create-duel-modal');
    const select = document.getElementById('duel-opponent');

    if (select) {
        select.innerHTML = '<option value="0">Будь-хто (Згенерувати посилання)</option>';
        try {
            const res = await fetch('/api/friends/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
            const data = await res.json();
            if (data.status === 'success' && data.data) {
                data.data.forEach(f => {
                    select.innerHTML += `<option value="${f.user_id}" data-name="${window.escapeHTML(f.name)}">${window.escapeHTML(f.name)} (Макс: ${f.exp} EXP)</option>`;
                });
            }
        } catch(e) {
            console.error(e);
        }
    }

    window.updateDuelButtonText();
    if (modal) modal.classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.submitDuel = async function() {
    const opponentEl = document.getElementById('duel-opponent');
    const opponentId = opponentEl ? (parseInt(opponentEl.value) || 0) : 0;
    const type = document.getElementById('duel-type').value;
    const bet = parseInt(document.getElementById('duel-bet').value);
    const days = parseInt(document.getElementById('duel-days').value);

    if (userData && userData.user && userData.user.exp < bet) {
        if (tg && tg.showAlert) tg.showAlert("У вас недостатньо EXP для такої ставки!");
        return;
    }

    try {
        const res = await fetch('/api/duels/create', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ initiator_id: userId, opponent_id: opponentId, bet_exp: bet, duel_type: type, days: days })
        });
        const data = await res.json();

        if (data.status === 'success') {
            closeModal('create-duel-modal');

            if (opponentId === 0) {
                const botUsername = "coach_app_bot";
                let typeText = "";
                if (type === "workouts") typeText = "хто зробить більше тренувань";
                if (type === "calories") typeText = "хто спалить більше калорій";
                if (type === "streak") typeText = "хто не втратить свій вогник";

                const duelText = `Я викликаю тебе на фітнес-дуель: ${typeText}! Ставка: ${bet} EXP. Приймаєш виклик?`;
                const shareUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=duel_${data.duel_id}&text=${encodeURIComponent(duelText)}`;

                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    alert("Дуель створено! ID: " + data.duel_id);
                }
            } else {
                if (tg && tg.showAlert) tg.showAlert("Виклик успішно надіслано другу!");
            }

            loadDuels();
            if (typeof window.loadGamification === 'function') window.loadGamification();
        }
    } catch (e) {
        console.error(e);
        if (tg && tg.showAlert) tg.showAlert("Помилка створення дуелі.");
    }
};

window.acceptDuel = async function(duelId) {
    try {
        const res = await fetch('/api/duels/accept', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId, duel_id: duelId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            loadDuels();
            if (typeof window.loadGamification === 'function') window.loadGamification();
        } else {
            if (tg && tg.showAlert) tg.showAlert(data.message || "Помилка");
        }
    } catch(e) {
        console.error(e);
    }
};

window.rejectDuel = async function(duelId) {
    if(!confirm("Відхилити виклик? Ставка повернеться ініціатору.")) return;
    try {
        await fetch('/api/duels/reject', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId, duel_id: duelId })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        loadDuels();
    } catch(e) {
        console.error(e);
    }
};

async function loadDuels() {
    const container = document.getElementById('duels-container');
    if (!container) return;

    try {
        const res = await fetch('/api/duels/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            let html = '';
            data.data.forEach(duel => {
                let statusColor = duel.status === 'pending' ? 'var(--warning)' : (duel.status === 'active' ? 'var(--client-blue)' : 'var(--hint-color)');
                let statusText = duel.status === 'pending' ? 'Очікує прийняття' : (duel.status === 'active' ? 'Битва триває' : 'Завершено');

                let typeLabel = "<i data-lucide='help-circle'></i> Невідомо";
                if (duel.duel_type === "workouts") typeLabel = "<i data-lucide='dumbbell' style='width:16px; margin-bottom:-2px;'></i> Тренування";
                if (duel.duel_type === "calories") typeLabel = "<i data-lucide='flame' style='width:16px; margin-bottom:-2px;'></i> Калорії";
                if (duel.duel_type === "streak") typeLabel = "<i data-lucide='snowflake' style='width:16px; margin-bottom:-2px;'></i> Виживання (Стрік)";

                let opponentText = "";
                let actionsHtml = "";

                if (duel.status === 'pending') {
                    if (duel.opponent_id === userId) {
                        statusText = "Вхідний виклик";
                        statusColor = "#ff2d55";
                        opponentText = `Від: <b style="color:var(--text-color);">${window.escapeHTML(duel.initiator_name)}</b>`;
                        actionsHtml = `<div style="display:flex; gap:10px; margin-top: 15px;">
                            <button onclick="window.acceptDuel(${duel.id})" style="flex:1; padding:10px; font-size:12px; background:var(--success); color:#000; margin:0; border:none; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:4px;"><i data-lucide="check" style="width:16px;height:16px;"></i> Прийняти</button>
                            <button onclick="window.rejectDuel(${duel.id})" style="flex:1; padding:10px; font-size:12px; background:transparent; border:1px solid var(--danger); color:var(--danger); margin:0; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:4px;"><i data-lucide="x" style="width:16px;height:16px;"></i> Відхилити</button>
                        </div>`;
                    } else {
                        statusText = "Очікує прийняття";
                        let n = duel.opponent_name || "За посиланням";
                        opponentText = `Проти: <b style="color:var(--text-color);">${window.escapeHTML(n)}</b>`;
                    }
                } else {
                    let n = (duel.initiator_id === userId) ? duel.opponent_name : duel.initiator_name;
                    opponentText = `Проти: <b style="color:var(--text-color);">${window.escapeHTML(n || "Невідомо")}</b>`;
                }

                html += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center;">
                        <span style="font-size: 11px; color: ${statusColor}; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px; border: 1px solid ${statusColor}40; border-radius: 4px;">${statusText}</span>
                        <span style="font-size: 12px; color: var(--hint-color); font-weight: bold;">Ставка: <span style="color: var(--accent-gold);">${duel.bet_exp} EXP</span></span>
                    </div>
                    <div style="font-size: 16px; font-weight: bold; color: var(--text-color); margin-bottom: 6px; display:flex; align-items:center; gap:6px;">${typeLabel}</div>
                    <div style="font-size: 13px; color: var(--hint-color); margin-bottom: 8px;">${opponentText}</div>
                    <div style="font-size: 12px; color: var(--hint-color); display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                        <span>Завершення:</span> <span style="color: var(--text-color);">${duel.end_date.split(' ')[0]}</span>
                    </div>
                    ${actionsHtml}
                </div>`;
            });
            container.innerHTML = html;
            window.refreshIcons();
        } else {
            container.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">У вас немає активних викликів.</p>';
        }
    } catch(e) {}
}

// =========================================================
// --- V2.0: НОВІ ФУНКЦІЇ (ПРИВАТНІСТЬ, ГРОСЕРІ-ЛИСТ, СТОРІЗ, КОМЕНТАРІ) ---
// =========================================================

// 1. Оновлення налаштувань приватності
window.updatePrivacySettings = async function() {
    const shareWeight = document.getElementById('privacy-share-weight')?.checked ?? true;
    const shareCycle = document.getElementById('privacy-share-cycle')?.checked ?? false;
    const shareFood = document.getElementById('privacy-share-food')?.checked ?? true;

    const settings = {
        share_weight: shareWeight,
        share_cycle: shareCycle,
        share_food: shareFood
    };

    try {
        await fetch('/api/user/privacy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: userId, privacy_settings: settings })
        });
        if (userData && userData.user) {
            userData.user.privacy_settings = settings;
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    } catch (e) {
        console.error("Failed to update privacy settings", e);
    }
};

// 2. Smart Grocery List (Список покупок)
window.generateGroceryList = async function() {
    const btn = document.getElementById('btn-generate-grocery');
    const container = document.getElementById('grocery-list-container');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Аналізуємо...'; window.refreshIcons(); }

    try {
        const res = await fetch('/api/ai/grocery_list', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();

        if (data.status === 'success' && data.data) {
            let html = '';
            const categories = {
                proteins: { title: 'Білки', icon: 'beef', color: 'var(--text-color)' },
                fats: { title: 'Жири', icon: 'droplet', color: 'var(--accent-gold)' },
                carbs: { title: 'Вуглеводи', icon: 'wheat', color: 'var(--client-blue)' },
                vegetables: { title: 'Овочі та інше', icon: 'leaf', color: 'var(--success)' }
            };

            for (const [key, items] of Object.entries(data.data)) {
                if (items && items.length > 0) {
                    const cat = categories[key] || { title: key, icon: 'shopping-bag', color: '#fff' };
                    html += `<div style="margin-bottom: 12px;">
                        <div style="font-size: 14px; font-weight: bold; color: ${cat.color}; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                            <i data-lucide="${cat.icon}" style="width: 16px; height: 16px;"></i> ${cat.title}
                        </div>`;
                    items.forEach((item, idx) => {
                        const itemId = `grocery-${key}-${idx}`;
                        html += `<label style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px 12px; border-radius: 12px; margin-bottom: 6px; cursor: pointer; text-transform: none; font-size: 14px; font-weight: normal; color: var(--text-color); margin-top: 0; border: 1px solid rgba(255,255,255,0.05);">
                            <input type="checkbox" id="${itemId}" style="width: 18px; height: 18px; margin: 0; accent-color: var(--success); flex-shrink: 0;">
                            <span style="flex: 1;">${item}</span>
                        </label>`;
                    });
                    html += `</div>`;
                }
            }
            container.innerHTML = html;
            container.style.display = 'flex';
            window.refreshIcons();
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            if (tg && tg.showAlert) tg.showAlert("Не вдалося згенерувати список покупок.");
        }
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert("Помилка зв'язку з сервером.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="list-checks"></i> Оновити список'; window.refreshIcons(); }
    }
};

// 3. Stories Engine (Weekly Recap)
// Перенесено у окремий файл stories.js

// 4. Завантаження коментарів тренера
window.loadCoachComments = async function() {
    try {
        const res = await fetch('/api/coach/comments/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
            window.coachComments = data.data;
        }
    } catch(e) {
        console.error("Помилка завантаження коментарів:", e);
    }
};

// 5. Виклик Тижневих Сторіз (Weekly Recap)
// Перенесено у окремий файл stories.js

// =========================================================
// --- 10. СИЛОВІ РЕКОРДИ ТА ШІ ЗВІТИ (DATA TAB V3.0) ---
// =========================================================

let strengthChartModalInstance = null;

window.openStrengthRecordsModal = async function() {
    const modal = document.getElementById('strength-records-modal');
    if (!modal) return;
    modal.classList.add('active');
    
    try {
        const res = await fetch('/api/strength/records/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        const select = document.getElementById('exercise-select');
        
        if (data.status === 'success' && data.exercises) {
            select.innerHTML = '';
            data.exercises.forEach(ex => {
                select.innerHTML += `<option value="${ex}">${ex}</option>`;
            });
            if (data.exercises.length > 0) {
                renderStrengthChart();
            } else {
                select.innerHTML = '<option value="">Немає записів</option>';
            }
        }
    } catch(e) { console.error("Error loading 1RM exercises:", e); }
};

window.renderStrengthChart = async function() {
    const select = document.getElementById('exercise-select');
    const exName = select ? select.value : '';
    if (!exName) return;

    try {
        const res = await fetch('/api/strength/records/' + userId + '?exercise=' + encodeURIComponent(exName), { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        
        if (data.status === 'success' && data.data) {
            const canvas = document.getElementById('strengthChartModal');
            if (strengthChartModalInstance) strengthChartModalInstance.destroy();
            
            const labels = data.data.map(d => d.date.split('-').slice(1).join('/'));
            const weights = data.data.map(d => d.weight);
            
            const ctx = canvas.getContext('2d');
            strengthChartModalInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '1RM (кг)',
                        data: weights,
                        borderColor: '#d4af37',
                        backgroundColor: 'rgba(212, 175, 55, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                        x: { display: true, grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } }
                    }
                }
            });
            
            // Preview in Bento card
            const previewCanvas = document.getElementById('exerciseChart');
            if (previewCanvas && exerciseChartInstance) exerciseChartInstance.destroy();
            if (previewCanvas) {
                exerciseChartInstance = new Chart(previewCanvas.getContext('2d'), {
                    type: 'line',
                    data: { labels: labels, datasets: [{ data: weights, borderColor: '#d4af37', borderWidth: 2, tension: 0.4, pointRadius: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
                });
            }
        }
    } catch (e) { console.error("Error rendering 1RM chart:", e); }
};

window.save1RMRecord = async function() {
    const select = document.getElementById('exercise-select');
    let exName = select && select.value ? select.value : '';
    // If no exercise selected/available, prompt user
    if (!exName) {
        exName = prompt("Введіть назву вправи для нового рекорду:");
    }
    if (!exName) return;

    const weightInput = document.getElementById('new-1rm-weight');
    const weight = parseFloat(weightInput.value);
    
    if (!weight || weight <= 0) {
        if (tg && tg.showAlert) tg.showAlert("Введіть коректну вагу");
        return;
    }

    try {
        const res = await fetch('/api/strength/log', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId, exercise: exName, weight: weight })
        });
        if (res.ok) {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            weightInput.value = '';
            await openStrengthRecordsModal(); // Reload exercises and chart
        }
    } catch(e) { console.error(e); }
};

window.generatePeakPlan = async function() {
    const select = document.getElementById('exercise-select');
    const exName = select ? select.value : '';
    const targetWt = parseFloat(document.getElementById('ai-peak-target').value);
    const weeks = parseInt(document.getElementById('ai-peak-weeks').value) || 4;

    if (!exName || !targetWt || targetWt <= 0) {
        if (tg && tg.showAlert) tg.showAlert("Заповніть вправу та ціль");
        return;
    }

    const btn = document.getElementById('btn-generate-peak');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Генеруємо...'; window.refreshIcons(); }

    try {
        const res = await fetch('/api/strength/plan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId, exercise: exName, target_weight: targetWt, weeks_to_peak: weeks })
        });
        const data = await res.json();
        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert("План успішно згенеровано! Перевір свої тренування.");
            closeModal('strength-records-modal');
            await refreshUserData();
            if (typeof window.renderWorkoutDays === 'function') window.renderWorkoutDays('adapted');
        } else {
            if (tg && tg.showAlert) tg.showAlert("Помилка генерації плану.");
        }
    } catch(e) {
        if (tg && tg.showAlert) tg.showAlert("Помилка сервера.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="zap"></i> Створити план'; window.refreshIcons(); }
    }
};

window.openMetricsModal = function() {
    const modal = document.getElementById('metrics-modal');
    if (modal) {
        modal.classList.add('active');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        // Ensure rendering is updated if needed
        setTimeout(() => {
            if (metricsChartInstance) {
                metricsChartInstance.resize();
            }
        }, 100);
    }
};

window.openWeightModal = function() {
    const modal = document.getElementById('weight-modal');
    if (modal) {
        modal.classList.add('active');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        setTimeout(() => {
            renderWeightChart();
        }, 250);
    }
};

window.generatePDFReport = async function() {
    const btn = document.getElementById('btn-generate-report');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Формуємо звіт...'; window.refreshIcons(); }
    
    let weightImg = null, strengthImg = null, metricsImg = null;
    try {
        const weightCanvas = document.getElementById('weightChartCard');
        if (weightCanvas) weightImg = weightCanvas.toDataURL('image/png');
        
        const strengthCanvas = document.getElementById('strengthChartModal');
        if (strengthCanvas) strengthImg = strengthCanvas.toDataURL('image/png');
        
        const metricsCanvas = document.getElementById('metricsChart');
        if (metricsCanvas) metricsImg = metricsCanvas.toDataURL('image/png');
    } catch(e) {}

    try {
        const res = await fetch('/api/report/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                user_id: userId,
                weight_chart_b64: weightImg,
                strength_chart_b64: strengthImg,
                metrics_chart_b64: metricsImg
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert("ШІ-звіт генерується. Бот надішле його PDF файлом за кілька секунд!");
        } else {
            if (tg && tg.showAlert) tg.showAlert("Помилка генерації звіту.");
        }
    } catch(e) {
        if (tg && tg.showAlert) tg.showAlert("Помилка зв'язку з сервером.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="file-text"></i> Згенерувати ШІ-звіт'; window.refreshIcons(); }
    }
};

// --- СІМЕЙНІ ФУНКЦІЇ (ФАЗА 6) ---

async function loadFamilyMembers() {
    const list = document.getElementById('family-members-list');
    if (!list) return;
    try {
        const res = await fetch('/api/family/members/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
            let html = '';
            data.data.forEach(m => {
                const isOwner = m.user_id === m.owner_id;
                const avatar = m.avatar_url ? `<img src="${m.avatar_url}" style="width:32px; height:32px; border-radius:50%; border: 1px solid var(--border-color);">` : `<div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center;"><i data-lucide="user" style="width:16px; height:16px;"></i></div>`;
                html += `
                    <div class="flex-center gap-8" style="background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        ${avatar}
                        <div style="font-size:12px;">
                            <div style="font-weight:600;">${window.escapeHTML(m.name)} ${isOwner ? '<span style="color:var(--accent-gold); font-size:10px;">★</span>' : ''}</div>
                            <div style="font-size:10px; color:var(--hint-color);">Lvl ${m.level}</div>
                        </div>
                    </div>`;
            });
            list.innerHTML = html || '<p style="font-size:12px; color:var(--hint-color);">Тут поки тільки ви.</p>';
            window.refreshIcons();
        }
    } catch(e) { console.error(e); }
}

async function inviteFamilyMember() {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    try {
        const res = await fetch('/api/family/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            const text = "Приєднуйся до моєї фітнес-сім'ї у Pure Fitness Hub! Разом тренуватися веселіше і у кожного буде PRO-підписка.";
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(data.invite_link)}&text=${encodeURIComponent(text)}`;
            if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
            else window.open(shareUrl, '_blank');
        } else {
            if (tg && tg.showAlert) tg.showAlert(data.message || "Помилка створення запиту");
        }
    } catch(e) { console.error(e); }
}

window.renderFoodWeeklyCalendar = function() {
    const container = document.getElementById('weekly-calendar');
    if (!container) return;
    
    if (!activeFoodDate) {
        const today = new Date();
        activeFoodDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }

    const today = new Date();
    const currentDay = today.getDay();
    const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    const dayNames = ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    
    let html = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const isToday = new Date().toDateString() === date.toDateString();
        const isSelected = dateStr === activeFoodDate;
        
        let bg = 'rgba(255,255,255,0.05)';
        let color = 'var(--text-color)';
        if (isSelected) {
            bg = 'var(--theme-color)';
            color = '#000';
        }
        
        let dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
        
        html += `
            <div onclick="selectFoodDate('${dateStr}')" style="min-width: 55px; padding: 12px 0; border-radius: 16px; background: ${bg}; color: ${color}; text-align: center; cursor: pointer; border: ${isToday && !isSelected ? '1px solid var(--theme-color)' : '1px solid transparent'}; transition: all 0.2s; scroll-snap-align: center;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 600; opacity: ${isSelected ? '0.8' : '0.5'};">${dayNames[dayIdx]}</div>
                <div style="font-size: 18px; font-weight: 800; margin-top: 6px; font-family: 'Space Grotesk', sans-serif;">${date.getDate()}</div>
            </div>
        `;
    }
    container.innerHTML = html;
};

window.selectFoodDate = function(dateStr) {
    activeFoodDate = dateStr;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    window.renderFoodWeeklyCalendar();
    if (typeof window.loadNutrition === 'function') {
        window.loadNutrition(dateStr);
    }
};
