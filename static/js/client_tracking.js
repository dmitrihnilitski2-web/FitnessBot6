/* =========================================================
   FITNESS HUB PRO | ТРЕКЕРИ ТА РУТИНА (client_tracking.js)
   Містить: Тренування, Їжу, Воду, Сканери, Таймер, Чек-іни, Холодильник, Offline Mode, V2.0 Фічі
   ========================================================= */

// Використовуємо var для захисту від конфлікту оголошення змінних
var loc = window.loc || function (key, fallback) { return fallback !== undefined ? fallback : key; };

// Глобальна змінна для коментарів тренера
window.coachComments = window.coachComments || [];

// =========================================================
// --- OFFLINE MANAGER V2.0 (Кеш для підвалів) ---
// =========================================================

function updateOfflineUI() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        if (!navigator.onLine) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
            flushOfflineQueue();
        }
    }
}

window.addEventListener('online', updateOfflineUI);
window.addEventListener('offline', updateOfflineUI);

function addToOfflineQueue(type, data) {
    let queue = JSON.parse(localStorage.getItem('offline_sync_queue') || '{"workouts": [], "nutrition": []}');
    if (type === 'workout') queue.workouts.push(data);
    if (type === 'nutrition') queue.nutrition.push(data);
    localStorage.setItem('offline_sync_queue', JSON.stringify(queue));

    if (tg && tg.showAlert) tg.showAlert(loc('offline_saved', "Немає мережі. Дані збережено офлайн. Синхронізується автоматично при появі інтернету."));
    else alert(loc('offline_saved', "Немає мережі. Збережено офлайн."));
}

async function flushOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem('offline_sync_queue') || '{"workouts": [], "nutrition": []}');
    if (queue.workouts.length === 0 && queue.nutrition.length === 0) return;

    try {
        const res = await fetch('/api/sync_offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: window.userId || 1100202114,
                workout_logs: queue.workouts,
                nutrition_logs: queue.nutrition
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            localStorage.setItem('offline_sync_queue', '{"workouts": [], "nutrition": []}');
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (typeof refreshUserData === 'function') refreshUserData();
            if (typeof loadNutrition === 'function') loadNutrition();
        }
    } catch (e) {
        console.error("Offline sync failed", e);
    }
}

document.addEventListener('DOMContentLoaded', updateOfflineUI);


// =========================================================
// --- 1. РОЗУМНІ ТРЕНУВАННЯ ТА БАГ 9 (Розумне визначення типу) ---
// =========================================================

function detectExerciseType(name) {
    const n = name.toLowerCase();

    // Маркери для розминки, дихальних вправ, йоги тощо
    if (n.includes('розминка') || n.includes('заминка') || n.includes('розтяжка') ||
        n.includes('суглоб') || n.includes('warmup') || n.includes('stretch') ||
        n.includes('дихан') || n.includes('медитац') || n.includes('сканування') ||
        n.includes('йога') || n.includes('мфр') || n.includes('yoga') || n.includes('релакс')) {
        return 'warmup';
    }

    // Маркери для кардіо
    if (n.includes('біг') || n.includes('доріжк') || n.includes('вело') ||
        n.includes('еліпс') || n.includes('орбітрек') || n.includes('ходьба') ||
        n.includes('кардіо') || n.includes('run') || n.includes('cardio') ||
        n.includes('bike') || n.includes('плавання') || n.includes('скакалк')) {
        return 'cardio';
    }

    // За замовчуванням - силові
    return 'strength';
}

window.renderWorkoutDays = function (activeTabId) {
    if (!userData || !userData.workout_plan) return;

    globalActiveTab = activeTabId;
    const tabsContainer = document.getElementById('day-tabs-container');
    const cont = document.getElementById('workout-container');
    if (!tabsContainer || !cont) return;

    let tabsHtml = '';
    const days = userData.workout_plan.days || [];
    const hasAdapted = userData.today_checkin && userData.today_checkin.adapted_plan;
    const isFemale = userData && userData.user && userData.user.gender === 'female';

    if (typeof activeTabId === 'number') {
        currentDayIndex = activeTabId;
    }

    if (hasAdapted) {
        const activeClass = (activeTabId === 'adapted') ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays('adapted')"><i data-lucide="zap" style="width: 14px; height: 14px;"></i> ${loc('tab_today_adapted', 'Сьогодні')}</div>`;
    }

    days.forEach(function (d, index) {
        const activeClass = (activeTabId === index) ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays(${index})">${loc('cycle_day', 'День')} ${d.day}</div>`;
    });

    if (days.length > 0) {
        const activeClass = (activeTabId === 'all') ? 'active' : '';
        tabsHtml += `<div class="day-tab ${activeClass}" onclick="renderWorkoutDays('all')"><i data-lucide="list" style="width: 14px; height: 14px;"></i> ${loc('tab_all_plan', 'Весь план')}</div>`;
    }

    tabsContainer.innerHTML = tabsHtml;
    tabsContainer.style.display = 'flex';

    if (activeTabId === 'adapted' && hasAdapted) {
        document.getElementById('checkin-card').style.display = 'none';
        const adapted = userData.today_checkin.adapted_plan;

        if (adapted.coach_message) {
            document.getElementById('coach-message-text').innerHTML = window.formatMarkdown ? window.formatMarkdown(adapted.coach_message) : adapted.coach_message;
            document.getElementById('coach-message-box').style.display = 'block';
        } else {
            document.getElementById('coach-message-box').style.display = 'none';
        }

        let badgeIcon = isFemale ? '<i data-lucide="sparkles"></i>' : '<i data-lucide="zap"></i>';
        let badgeText = isFemale ? 'Адаптовано під твій цикл' : loc('adapted_focus', 'АДАПТОВАНО:');

        let html = `<div class="card" style="border: 1px solid rgba(0, 234, 102, 0.3); background: rgba(0, 234, 102, 0.05); border-radius: 24px;"><div style="color:var(--success); margin-bottom:15px; font-weight:bold; display: flex; align-items: center; gap: 8px;">${badgeIcon} ${badgeText} — ${adapted.focus}</div>`;

        (adapted.exercises || []).forEach(function (e, i) {
            const safeName = e.name.replace(/'/g, "\\'");
            const expectedReps = String(e.reps).replace(/'/g, "\\'");
            const key = 'adapted_' + e.name;
            const completedSets = (userData.today_completed_sets && userData.today_completed_sets[key]) ? userData.today_completed_sets[key] : 0;
            const isCompleted = completedSets >= parseInt(e.sets);
            const rowClass = isCompleted ? "ex-row ex-completed" : "ex-row";
            const titleIcon = isCompleted ? '<i data-lucide="check-circle-2" style="color: var(--success); width: 18px; height: 18px; margin-bottom: -3px;"></i>' : '<i data-lucide="play-circle" style="color: var(--theme-color); width: 18px; height: 18px; margin-bottom: -3px;"></i>';

            let btnText = isCompleted ? (detectExerciseType(e.name) === 'strength' ? '<i data-lucide="plus"></i> Додатковий підхід' : '<i data-lucide="check"></i> Виконано') : '<i data-lucide="play"></i> Почати';

            let btnStyle = 'style="height: auto;"';
            if (isCompleted && detectExerciseType(e.name) !== 'strength') {
                btnStyle = 'disabled style="background:var(--success); color:#000; height: auto;"';
            }

            let comment = (window.coachComments || []).find(c => c.entity_type === 'workout' && c.entity_id == e.name);
            let coachCommentHtml = comment ? `<div class="coach-comment-badge mt-8"><i data-lucide="message-circle" style="width:14px; height:14px; margin-bottom:-2px;"></i> <b>Тренер:</b> ${comment.text}</div>` : '';

            html += `
                <div class="${rowClass}">
                    <div>
                        <div>
                            <h3 class="exercise-title">
                                ${titleIcon} ${e.name}
                            </h3>
                            <div style="font-size: 13px; color: var(--hint-color); margin-top: 6px;">
                                ${e.sets} ${loc('text_sets_x', 'підходи ×')} ${expectedReps}
                            </div>
                            ${coachCommentHtml}
                        </div>
                        <div>
                            <button onclick="if(typeof showExerciseInfo === 'function') showExerciseInfo('${safeName}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(10, 132, 255, 0.15); color: var(--client-blue); border-radius: 8px; border: none;"><i data-lucide="info" style="width: 16px; height: 16px;"></i></button>
                            <button onclick="openEditExModal('adapted', ${i}, '${safeName}', '${e.sets}', '${expectedReps}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255, 204, 0, 0.15); color: var(--warning); border-radius: 8px; border: none;"><i data-lucide="pencil" style="width: 14px; height: 14px;"></i></button>
                        </div>
                    </div>
                    <button class="btn-log-set" onclick="openExerciseModal('${safeName}', '${e.sets}', '${expectedReps}', 'adapted')" ${btnStyle}>
                        ${btnText}
                    </button>
                </div>`;
        });
        html += `<button class="secondary" style="color: var(--theme-color); margin-top: 15px; width: 100%; border-style: dashed;" onclick="openEditExModal('adapted', -1, '', '', '')"><i data-lucide="plus"></i> ${loc('btn_add_exercise', 'Додати вправу')}</button></div>`;
        cont.innerHTML = html;

    } else {
        document.getElementById('coach-message-box').style.display = 'none';

        if (!hasAdapted && (activeTabId !== 'all')) {
            document.getElementById('checkin-card').style.display = 'block';
            const chkP = document.querySelector('#checkin-card p');
            if (chkP && days[currentDayIndex]) {
                const textAdp = isFemale ? 'Адаптація: <b>День' : loc('text_adaptation', 'Адаптація: <b>День');
                const textEnd = isFemale ? 'під твій поточний стан.' : loc('text_adaptation_end', 'під ваш поточний стан.');
                chkP.innerHTML = `${textAdp} ${days[currentDayIndex].day} (${days[currentDayIndex].focus})</b> ${textEnd}`;
            }
        } else {
            document.getElementById('checkin-card').style.display = 'none';
        }

        let daysToRender = activeTabId === 'all' ? days : [days[currentDayIndex]];
        if (!daysToRender[0]) daysToRender = days;

        let allDaysHtml = '';

        daysToRender.forEach(function (d) {
            if (!d) return;
            let actualDayIndex = days.indexOf(d);
            let html = `<div class="card" style="border-radius: 24px;"><div style="color:var(--accent-gold); margin-bottom:15px; font-weight:bold; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;"><i data-lucide="calendar" style="width:14px; height:14px; margin-bottom:-2px;"></i> ${loc('cycle_day', 'День').toUpperCase()} ${d.day}: ${d.focus}</div>`;

            (d.exercises || []).forEach(function (e, i) {
                const safeName = e.name.replace(/'/g, "\\'");
                const expectedReps = String(e.reps).replace(/'/g, "\\'");
                const key = actualDayIndex + '_' + e.name;
                const completedSets = (userData.today_completed_sets && userData.today_completed_sets[key]) ? userData.today_completed_sets[key] : 0;
                const isCompleted = completedSets >= parseInt(e.sets);
                const rowClass = isCompleted ? "ex-row ex-completed" : "ex-row";
                const titleIcon = isCompleted ? '<i data-lucide="check-circle-2" style="color: var(--success); width: 18px; height: 18px; margin-bottom: -3px;"></i>' : '<i data-lucide="play-circle" style="color: var(--theme-color); width: 18px; height: 18px; margin-bottom: -3px;"></i>';

                let btnText = isCompleted ? (detectExerciseType(e.name) === 'strength' ? '<i data-lucide="plus"></i> Додатковий підхід' : '<i data-lucide="check"></i> Виконано') : '<i data-lucide="play"></i> Почати';

                let completedTextHTML = "";
                if (detectExerciseType(e.name) === 'strength') {
                    completedTextHTML = `<div style="color: var(--accent-gold); font-size: 11px; font-weight: bold; margin-top: 6px;">Виконано: ${completedSets} / ${e.sets}</div>`;
                }

                let btnStyle = 'style="height: auto;"';
                if (isCompleted && detectExerciseType(e.name) !== 'strength') {
                    btnStyle = 'disabled style="background:var(--success); color:#000; height: auto;"';
                }

                let comment = (window.coachComments || []).find(c => c.entity_type === 'workout' && c.entity_id == e.name);
                let coachCommentHtml = comment ? `<div class="coach-comment-badge mt-8"><i data-lucide="message-circle" style="width:14px; height:14px; margin-bottom:-2px;"></i> <b>Тренер:</b> ${comment.text}</div>` : '';

                html += `
                    <div class="${rowClass}">
                        <div>
                            <div>
                                <h3 class="exercise-title">
                                    ${titleIcon} ${e.name}
                                </h3>
                                <div style="font-size: 13px; color: var(--hint-color); margin-top: 6px;">
                                    ${e.sets} ${loc('text_sets_x', 'підходи ×')} ${expectedReps}
                                </div>
                                ${completedTextHTML}
                                ${coachCommentHtml}
                            </div>
                            <div>
                                <button onclick="if(typeof showExerciseInfo === 'function') showExerciseInfo('${safeName}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(10, 132, 255, 0.15); color: var(--client-blue); border-radius: 8px; border: none;"><i data-lucide="info" style="width: 16px; height: 16px;"></i></button>
                                <button onclick="openEditExModal('${actualDayIndex}', ${i}, '${safeName}', '${e.sets}', '${expectedReps}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255, 204, 0, 0.15); color: var(--warning); border-radius: 8px; border: none;"><i data-lucide="pencil" style="width: 14px; height: 14px;"></i></button>
                            </div>
                        </div>
                        <button class="btn-log-set" onclick="openExerciseModal('${safeName}', '${e.sets}', '${expectedReps}', '${actualDayIndex}')" ${btnStyle}>
                            ${btnText}
                        </button>
                    </div>`;
            });
            if (activeTabId !== 'all') {
                html += `<button class="secondary" style="color: var(--theme-color); margin-top: 15px; width: 100%; border-style: dashed;" onclick="openEditExModal('${actualDayIndex}', -1, '', '', '')"><i data-lucide="plus"></i> ${loc('btn_add_exercise', 'Додати вправу')}</button>`;
            }
            html += `</div>`;
            allDaysHtml += html;
        });

        cont.innerHTML = allDaysHtml;
    }

    if (typeof window.refreshIcons === 'function') window.refreshIcons();
};

window.showExerciseInfo = async function (name) {
    if (!document.getElementById('exercise-info-modal')) {
        if (tg && tg.showAlert) tg.showAlert(loc('loading_ai', "Зачекайте оновлення інтерфейсу.")); return;
    }
    document.getElementById('info-modal-title').innerText = name;
    document.getElementById('info-modal-muscles').innerText = loc('loading_ai', "Завантаження...");
    document.getElementById('info-modal-instruction').innerText = loc('analyzing_biomechanics', "ШІ аналізує біомеханіку вправи...");
    document.getElementById('btn-youtube-link').style.display = 'none';

    document.getElementById('exercise-info-modal').classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    try {
        const res = await fetch('/api/exercise_info/' + encodeURIComponent(name));
        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('info-modal-muscles').innerText = data.data.muscles;
            document.getElementById('info-modal-instruction').innerText = data.data.instruction;
            const ytUrl = `https://www.youtube.com/results?search_query=Як+робити+${encodeURIComponent(name)}+техніка+виконання`;
            const ytBtn = document.getElementById('btn-youtube-link');
            ytBtn.href = ytUrl;
            ytBtn.style.display = 'flex';
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            document.getElementById('info-modal-instruction').innerText = loc('alert_error', "Не вдалося завантажити інструкцію.");
        }
    } catch (e) {
        document.getElementById('info-modal-instruction').innerText = loc('alert_error', "Помилка зв'язку з сервером.");
    }
};


// =========================================================
// --- 2. ВІКНО ЛОГУВАННЯ ТА ТАЙМЕР ---
// =========================================================

window.openExerciseModal = function (name, sets, expectedReps, planDay) {
    const isFemale = userData && userData.user && userData.user.gender === 'female';

    currentExercise = name;
    currentExTotalSets = parseInt(sets) || 1;
    currentExExpectedRepsStr = expectedReps;
    currentPlanDay = planDay;

    currentExType = detectExerciseType(name);

    const key = planDay + '_' + name;
    const completed = (userData.today_completed_sets && userData.today_completed_sets[key]) ? userData.today_completed_sets[key] : 0;

    if (completed >= currentExTotalSets) {
        const msg = isFemale ? "Ти вже виконала всі заплановані підходи для цієї вправи! Відпочивай." : loc('alert_sets_done', "Ви вже виконали всі заплановані підходи для цієї вправи! Відпочивайте.");
        if (tg && tg.showAlert) tg.showAlert(msg);
        else alert(msg);
        return;
    }

    document.getElementById('modal-title').innerText = name;
    document.getElementById('modal-target').innerText = expectedReps;

    const progEl = document.getElementById('modal-progress');
    progEl.style.display = 'block';
    progEl.innerText = `${loc('text_set_progress', 'Підхід:')} ${completed + 1}/${currentExTotalSets}`;

    document.getElementById('set-weight').value = '';
    document.getElementById('set-reps').value = '';
    document.getElementById('set-duration').value = '';
    document.getElementById('set-distance').value = '';

    document.getElementById('input-strength').style.display = 'none';
    document.getElementById('input-cardio').style.display = 'none';
    document.getElementById('input-warmup').style.display = 'none';

    if (currentExType === 'warmup') {
        document.getElementById('input-warmup').style.display = 'block';
    } else if (currentExType === 'cardio') {
        document.getElementById('input-cardio').style.display = 'block';
    } else {
        document.getElementById('input-strength').style.display = 'block';
        document.getElementById('set-reps').placeholder = isFemale ? "Скільки зробила?" : loc('placeholder_reps', "Скільки зробили?");
    }

    document.getElementById('timer-view').style.display = 'none';
    document.getElementById('log-form').style.display = 'block';

    // Скидання інпуту відео
    const videoInput = document.getElementById('set-video');
    const videoLabel = document.getElementById('set-video-label');
    if (videoInput) videoInput.value = '';
    if (videoLabel) {
        videoLabel.innerHTML = '<i data-lucide="video"></i> Прикріпити відео техніки';
        videoLabel.style.borderColor = '';
        videoLabel.style.color = '';
    }

    currentTimerLeft = REST_TIME_SECONDS;
    updateTimerText(currentTimerLeft);

    document.getElementById('workout-modal').classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
};

window.saveSet = function () {
    const isFemale = userData && userData.user && userData.user.gender === 'female';
    let weight = 0, reps = 0, duration = 0, distance = 0.0;

    if (currentExType === 'strength') {
        weight = parseFloat(document.getElementById('set-weight').value) || 0;
        reps = parseInt(document.getElementById('set-reps').value) || 0;

        let maxExpected = 0;
        if (currentExExpectedRepsStr) {
            const matches = String(currentExExpectedRepsStr).match(/\d+/g);
            if (matches) maxExpected = Math.max(...matches.map(Number));
        }
        if (maxExpected > 0 && reps > maxExpected) {
            let warnMsg = isFemale ? `Ти ввела ${reps} повторень, але план передбачає максимум ${maxExpected}. Задля уникнення перетренування значення скориговано.` : loc('alert_reps_adjusted', `Ви ввели {reps} повторень, але план передбачає максимум {maxExpected}. Задля уникнення перетренування значення скориговано.`).replace('{reps}', reps).replace('{maxExpected}', maxExpected);
            if (tg && tg.showAlert) tg.showAlert(warnMsg); else alert(warnMsg);
            document.getElementById('set-reps').value = maxExpected;
            return;
        }
        if (reps === 0) {
            if (tg && tg.showAlert) tg.showAlert(isFemale ? "Вкажи кількість повторень." : loc('alert_enter_reps', "Вкажіть кількість повторень."));
            return;
        }
    } else if (currentExType === 'cardio') {
        let mins = parseFloat(document.getElementById('set-duration').value) || 0;
        duration = Math.floor(mins * 60);
        distance = parseFloat(document.getElementById('set-distance').value) || 0;
        if (duration === 0) {
            if (tg && tg.showAlert) tg.showAlert(isFemale ? "Вкажи час виконання (хвилини)." : loc('alert_enter_time', "Вкажіть час виконання (хвилини)."));
            return;
        }
        reps = 1;
    } else if (currentExType === 'warmup') {
        reps = 1;
    }

    const payload = {
        user_id: userId, exercise_name: currentExercise, set_number: 1,
        weight: weight, reps: reps, exercise_type: currentExType,
        duration: duration, distance: distance, plan_day: String(currentPlanDay)
    };

    const videoInput = document.getElementById('set-video');
    let file = videoInput && videoInput.files && videoInput.files.length > 0 ? videoInput.files[0] : null;

    const btn = document.getElementById('btn-save-set');
    const originalBtnText = btn ? btn.innerHTML : loc('btn_save_set', 'Записати і Відпочити');

    // Офлайн режим: записуємо локально та оновлюємо UI, не чекаючи мережі
    if (!navigator.onLine) {
        addToOfflineQueue('workout', payload);

        if (!userData.today_completed_sets) userData.today_completed_sets = {};
        const key = currentPlanDay + '_' + currentExercise;
        userData.today_completed_sets[key] = (userData.today_completed_sets[key] || 0) + 1;
        renderWorkoutDays(globalActiveTab);

        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        startTimer(REST_TIME_SECONDS);
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Збереження...';
        window.refreshIcons();
    }

    fetch('/api/log_set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(payload)
    }).then(async function () {
        if (file) {
            if (btn) {
                btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Завантаження відео...';
                window.refreshIcons();
            }
            let formData = new FormData();
            formData.append('file', file);
            formData.append('user_id', userId);
            formData.append('exercise_name', currentExercise);
            formData.append('plan_day', String(currentPlanDay));
            try {
                await fetch('/api/upload_video', { method: 'POST', body: formData });
                if (videoInput) videoInput.value = '';
                const label = document.getElementById('set-video-label');
                if (label) {
                    label.innerHTML = '<i data-lucide="video"></i> Прикріпити відео техніки';
                    label.style.borderColor = '';
                    label.style.color = '';
                }
            } catch (err) {
                console.error('Video upload error:', err);
            }
        }

        if (typeof refreshUserData === 'function') refreshUserData();
        if (typeof loadGamification === 'function') loadGamification();

        const progView = document.getElementById('progress-view');
        if (progView && progView.classList.contains('active') && typeof loadFatigueData === 'function') {
            loadFatigueData();
        }

        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnText; }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        startTimer(REST_TIME_SECONDS);
    }).catch(function (err) {
        console.error(err);
        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnText; window.refreshIcons(); }
    });
};

window.startTimer = function (seconds) {
    document.getElementById('log-form').style.display = 'none';
    document.getElementById('timer-view').style.display = 'block';
    currentTimerLeft = seconds;
    updateTimerText(currentTimerLeft);
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function () {
        currentTimerLeft--; updateTimerText(currentTimerLeft);
        if (currentTimerLeft <= 0) { clearInterval(timerInterval); finishTimer(); }
    }, 1000);
};

window.adjustTimer = function (secs) {
    currentTimerLeft += secs;
    if (currentTimerLeft < 0) currentTimerLeft = 0;
    updateTimerText(currentTimerLeft);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
};

window.updateTimerText = function (seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('timer-text').innerText = m + ':' + s;
};

window.skipTimer = function () {
    if (timerInterval) clearInterval(timerInterval);
    finishTimer();
};

window.finishTimer = function () {
    if (typeof closeModal === 'function') closeModal('workout-modal');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};


// =========================================================
// --- 3. ХАРЧУВАННЯ ТА ВОДА ---
// =========================================================

window.loadNutrition = async function (dateStr = null) {
    try {
        let url = '/api/nutrition/' + userId;
        if (dateStr) url += '?date=' + dateStr;
        const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        if (!res.ok) return;
        const data = await res.json();
        const goals = data.goals || { calories: 2000, protein: 150, fats: 70, carbs: 200 };
        const consumed = data.consumed || { cals: 0, prot: 0, fat: 0, carb: 0 };
        const logs = data.logs || [];
        const cals = consumed.cals || 0;

        todayWater = data.water || 0;
        updateWaterUI();

        // Render Weekly Calendar
        if (typeof window.renderFoodWeeklyCalendar === 'function') {
            window.renderFoodWeeklyCalendar();
        }

        const calLeftVal = document.getElementById('cal-left-val');
        const calTargetVal = document.getElementById('cal-target-val');
        const calProgressBar = document.getElementById('cal-arc-progress-bar');

        let leftoverCals = Math.round(goals.calories) - Math.round(cals);
        if (calLeftVal) calLeftVal.innerText = leftoverCals > 0 ? leftoverCals : 0;
        if (calTargetVal) calTargetVal.innerText = Math.round(goals.calories);

        // Оновлення лінійного прогрес-бару калорій (Bento Grid)
        if (calProgressBar) {
            let calPercent = goals.calories > 0 ? Math.min((cals / goals.calories) * 100, 100) : 0;
            calProgressBar.style.width = calPercent + '%';
            if (calPercent >= 100) calProgressBar.style.background = 'var(--danger)';
            else if (calPercent > 85) calProgressBar.style.background = 'var(--accent-gold)';
            else calProgressBar.style.background = 'var(--theme-color)';
        }

        updateMacroUI('p', consumed.prot || 0, goals.protein);
        updateMacroUI('f', consumed.fat || 0, goals.fats);
        updateMacroUI('c', consumed.carb || 0, goals.carbs);

        const logsContainer = document.getElementById('food-logs-container');
        if (!logsContainer) return;

        if (logs.length === 0) {
            logsContainer.innerHTML = `<div style="text-align: center; color: var(--hint-color); font-size: 14px; padding: 20px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 24px;"><i data-lucide="utensils-crossed" style="width: 32px; height: 32px; opacity: 0.5; margin-bottom: 10px;"></i><br>${loc('nutri_no_logs', 'Ще немає записів за сьогодні.')}</div>`;
        } else {
            let logsHtml = '';
            logs.forEach(function (log) {
                const safeName = log.dish_name.replace(/'/g, "\\'");
                const weightText = log.weight_g ? `<i data-lucide="scale" style="width:12px; margin-bottom:-2px;"></i> ${log.weight_g}г • ` : '';

                let comment = (window.coachComments || []).find(c => c.entity_type === 'nutrition' && c.entity_id == log.id);
                let coachCommentHtml = comment ? `<div class="coach-comment-badge mt-8"><i data-lucide="message-circle" style="width:14px; height:14px; margin-bottom:-2px;"></i> <b>Тренер:</b> ${comment.text}</div>` : '';

                logsHtml += `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 16px; margin-bottom: 12px;">
                    <div class="food-log-item" style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="food-log-info">
                            <div class="food-log-title" style="font-weight: bold; font-size: 15px; margin-bottom: 4px;">${log.dish_name}</div>
                            <div class="food-log-macros" style="font-size: 12px; color: var(--hint-color);">${weightText}<i data-lucide="flame" style="width:12px; margin-bottom:-2px;"></i> ${log.calories} ккал • Б:${log.protein} Ж:${log.fats} В:${log.carbs}</div>
                        </div>
                        <div style="display:flex; gap: 6px;">
                            <button class="action-btn fav" style="background: rgba(255,45,85,0.1); color: var(--danger); border: none; border-radius: 8px; padding: 8px 10px;" onclick="if(typeof window.saveToFavorites === 'function') window.saveToFavorites('${safeName}', ${log.calories}, ${log.protein}, ${log.fats}, ${log.carbs}, ${log.weight_g || 0})"><i data-lucide="heart" style="width: 16px; height: 16px;"></i></button>
                            <button class="action-btn edit" style="background: rgba(255, 214, 10, 0.1); color: var(--warning); border: none; border-radius: 8px; padding: 8px 10px;" onclick="openEditFood(${log.id}, '${safeName}', ${log.calories}, ${log.protein}, ${log.fats}, ${log.carbs}, ${log.weight_g || 0})"><i data-lucide="pencil" style="width: 16px; height: 16px;"></i></button>
                            <button class="action-btn delete" style="background: rgba(255, 45, 85, 0.1); color: var(--danger); border: none; border-radius: 8px; padding: 8px 10px;" onclick="deleteFoodLog(${log.id})"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                        </div>
                    </div>
                    ${coachCommentHtml}
                </div>`;
            });
            logsContainer.innerHTML = logsHtml;
        }
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    } catch (e) {
        console.error("Помилка завантаження харчування:", e);
    }
};

window.updateMacroUI = function (prefix, current, target) {
    const valLeftEl = document.getElementById(prefix + '-val-left');
    const valTargetEl = document.getElementById(prefix + '-val-target');

    if (valLeftEl) valLeftEl.innerText = Math.round(current);
    if (valTargetEl) valTargetEl.innerText = '/' + Math.round(target) + 'g';

    let percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;

    const barFill = document.getElementById(prefix + '-bar-fill');
    if (barFill) {
        barFill.style.width = percent + '%';

        // Optional: color change if exceeded
        if (current > target * 1.1) {
            barFill.style.background = 'var(--danger)';
        } else {
            // Revert to default colors based on prefix
            if (prefix === 'p') barFill.style.background = '#bf5af2'; // Purple
            if (prefix === 'f') barFill.style.background = '#32d74b'; // Green
            if (prefix === 'c') barFill.style.background = '#ff2d55'; // Red
        }
    }
};

window.updateWaterUI = function () {
    const valEl = document.getElementById('water-val');
    if (valEl) valEl.innerText = todayWater + ' / ' + DAILY_WATER_GOAL_ML + ' мл';

    const container = document.getElementById('water-glasses-container');
    if (!container) return;

    let filledCount = Math.floor(todayWater / 250);
    let totalGlasses = Math.max(8, filledCount + 1);

    let html = '';
    for (let i = 0; i < totalGlasses; i++) {
        let filledClass = i < filledCount ? 'filled' : '';
        let clickAmount = i < filledCount ? -250 : 250;
        html += `<div class="water-glass ${filledClass}" onclick="addWater(${clickAmount})"></div>`;
    }
    container.innerHTML = html;
};

window.addWater = async function (amount_ml) {
    if (todayWater + amount_ml < 0) return;
    todayWater += amount_ml;
    updateWaterUI();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    try {
        await fetch('/api/log_water', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ user_id: userId, amount: amount_ml })
        });
    } catch (e) {
        console.error("Water log error:", e);
    }
};

// =========================================================
// --- 4. СКАНЕР ШТРИХ-КОДІВ ТА АНАЛІЗ ФОТО ЇЖІ ---
// =========================================================

let html5QrCode = null;

window.startWebScanner = function () {
    const readerDiv = document.getElementById('reader');
    const btnStart = document.getElementById('btn-start-scan');
    const btnStop = document.getElementById('btn-stop-scan');
    const btnManual = document.getElementById('btn-manual-barcode');

    if (!readerDiv) return;

    readerDiv.style.display = 'block';
    btnStart.style.display = 'none';
    btnStop.style.display = 'block';
    btnManual.style.display = 'block';

    if (typeof Html5Qrcode === 'undefined') {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_scanner_loading', "Бібліотека сканера ще не завантажилась. Спробуйте через пару секунд."));
        stopWebScanner();
        return;
    }

    html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText, decodedResult) => {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            stopWebScanner();
            processBarcode(decodedText);
        },
        (errorMessage) => { }
    ).catch((err) => {
        console.error("Помилка камери:", err);
        stopWebScanner();
        if (tg && tg.showAlert) tg.showAlert(loc('alert_camera_error', "Не вдалося отримати доступ до камери. Перевірте дозволи."));
    });
};

window.stopWebScanner = function () {
    const readerDiv = document.getElementById('reader');
    const btnStart = document.getElementById('btn-start-scan');
    const btnStop = document.getElementById('btn-stop-scan');
    const btnManual = document.getElementById('btn-manual-barcode');

    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        }).catch(err => console.error("Failed to stop scanner", err));
    }

    if (readerDiv) readerDiv.style.display = 'none';
    if (btnStart) btnStart.style.display = 'block';
    if (btnStop) btnStop.style.display = 'none';
    if (btnManual) btnManual.style.display = 'none';
};

window.manualBarcodePrompt = function () {
    stopWebScanner();
    let code = prompt(loc('prompt_barcode', "Введіть цифри під штрих-кодом:"));
    if (code && code.trim().length > 5) {
        processBarcode(code.trim());
    }
};

window.processBarcode = async function (barcode) {
    if (typeof showLoading === 'function') showLoading(loc('loading_food_search', "Шукаємо продукт у базі..."));
    try {
        const res = await fetch('/api/scan_barcode/' + encodeURIComponent(barcode), {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if (data.status === 'success' && data.data) {
            const payload = {
                user_id: userId,
                dish_name: data.data.dish_name,
                calories: data.data.calories,
                protein: data.data.protein,
                fats: data.data.fats,
                carbs: data.data.carbs,
                weight_g: 100
            };

            if (!navigator.onLine) {
                addToOfflineQueue('nutrition', payload);
            } else {
                await fetch('/api/log_nutrition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                    body: JSON.stringify(payload)
                });
            }

            loadNutrition();
            if (typeof loadGamification === 'function') loadGamification();

            if (typeof navTo === 'function') navTo('nutrition-view');
            else if (typeof showView === 'function') showView('nutrition-view');

            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) {
                let successMsg = loc('alert_food_found', `Знайдено: "{name}"!\n\nПродукт додано (порція 100г). Змініть вагу через кнопку редагування.`);
                tg.showAlert(successMsg.replace('{name}', data.data.dish_name));
            }
        } else {
            if (typeof navTo === 'function') navTo('nutrition-view');
            else if (typeof showView === 'function') showView('nutrition-view');
            if (tg && tg.showAlert) tg.showAlert(data.message || loc('alert_food_not_found', "Продукт не знайдено."));
        }
    } catch (e) {
        if (typeof navTo === 'function') navTo('nutrition-view');
        else if (typeof showView === 'function') showView('nutrition-view');
        if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка зв'язку з сервером."));
    }
};

let currentFuelcastItems = [];

window.analyzeFoodImage = async function (event) {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("ШІ аналіз фото не працює в офлайн режимі.");
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const isFemale = userData && userData.user && userData.user.gender === 'female';

    const labelText = document.getElementById('food-upload-label');
    if (labelText) {
        labelText.innerHTML = '<i data-lucide="camera"></i> Аналіз по фото';
        window.refreshIcons();
    }

    // Відразу відкриваємо модалку зі скелетом
    document.getElementById('fuelcast-scan-modal').classList.add('active');
    setTimeout(() => {
        document.getElementById('fuelcast-scan-modal').querySelector('.modal-content').style.transform = 'translateY(0)';
    }, 10);
    
    const listEl = document.getElementById('fuelcast-scan-items');
    if (listEl) {
        listEl.innerHTML = `
            <div class="skeleton-box skeleton-card" style="display: flex; gap: 12px; align-items: center;">
                <div class="skeleton-box" style="width: 40px; height: 40px; border-radius: 8px;"></div>
                <div style="flex: 1;">
                    <div class="skeleton-text" style="width: 60%;"></div>
                    <div class="skeleton-text" style="width: 40%; margin-bottom: 0;"></div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 20px; color: var(--theme-color); font-size: 14px; font-weight: bold; animation: pulse-opacity 1.5s infinite;">
                <i data-lucide="sparkles"></i> Нейромережа аналізує фото...
            </div>
        `;
        window.refreshIcons();
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", window.userId);

    try {
        const res = await fetch('/api/analyze_food', {
            method: 'POST',
            body: formData
        });
        const responseData = await res.json();

        if (responseData.message === 'PAYWALL') {
             closeModal('food-scanner-modal');
             if (window.SubscriptionGuard && typeof window.SubscriptionGuard.checkOrPaywall === 'function') {
                 window.SubscriptionGuard.checkOrPaywall('AI_FOOD_SCAN');
             } else if (window.PaywallModal) {
                 window.PaywallModal.open('AI_FOOD_SCAN');
             } else {
                 if (tg && tg.showAlert) tg.showAlert('Досягнуто ліміт сканувань. Оновіть підписку до PRO.');
             }
             return;
        }

        if (responseData.status === 'success' && responseData.data) {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

            // Assume the AI returns a single item for now, but format it as a list for the modal
            currentFuelcastItems = [{
                name: responseData.data.dish_name,
                cal: responseData.data.calories || 0,
                p: responseData.data.protein || 0,
                f: responseData.data.fats || 0,
                c: responseData.data.carbs || 0,
                w: responseData.data.estimated_weight_g || 0
            }];

            renderFuelcastModal();

        } else {
            if (tg && tg.showAlert) tg.showAlert(loc('alert_food_ai_fail', "Не вдалося розпізнати їжу. Спробуйте інше фото."));
            closeModal('fuelcast-scan-modal');
        }
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка відправки фото."));
        closeModal('fuelcast-scan-modal');
    } finally {
        event.target.value = '';
    }
};

window.renderFuelcastModal = function () {
    const listEl = document.getElementById('fuelcast-scan-items');

    let totalCal = 0, totalP = 0, totalF = 0, totalC = 0;

    let html = '';
    currentFuelcastItems.forEach((item, idx) => {
        totalCal += item.cal; totalP += item.p; totalF += item.f; totalC += item.c;

        html += `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px; color: #fff;">${item.name}</div>
                <div style="font-size: 13px; color: var(--hint-color);"><span style="color: #ff2d55;">C:${item.c}g</span> <span style="color:#bf5af2;">P:${item.p}g</span> <span style="color:#32d74b;">F:${item.f}g</span></div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-weight: 700; font-size: 16px; color: var(--text-color);">${item.cal} kcal</div>
                <button onclick="removeFuelcastItem(${idx})" style="background: rgba(255,45,85,0.1); color: #ff2d55; border: none; border-radius: 8px; width: 32px; height: 32px; display: flex; justify-content: center; align-items: center; padding: 0;"><i data-lucide="trash-2" style="width: 14px;"></i></button>
            </div>
        </div>`;
    });

    listEl.innerHTML = html;

    // Update Total Meal UI
    document.getElementById('fc-total-cal').innerText = totalCal;
    document.getElementById('fc-val-c').innerText = totalC + 'g Carbs';
    document.getElementById('fc-val-p').innerText = totalP + 'g Protein';
    document.getElementById('fc-val-f').innerText = totalF + 'g Fat';

    const sumMacros = totalP + totalC + totalF;
    if (sumMacros > 0) {
        document.getElementById('fc-bar-c').style.width = ((totalC / sumMacros) * 100) + '%';
        document.getElementById('fc-bar-p').style.width = ((totalP / sumMacros) * 100) + '%';
        document.getElementById('fc-bar-f').style.width = ((totalF / sumMacros) * 100) + '%';
    } else {
        document.getElementById('fc-bar-c').style.width = '0%';
        document.getElementById('fc-bar-p').style.width = '0%';
        document.getElementById('fc-bar-f').style.width = '0%';
    }

    window.refreshIcons();

    document.getElementById('btn-log-fuelcast-meal').onclick = async function () {
        if (currentFuelcastItems.length === 0) return;

        const btn = document.getElementById('btn-log-fuelcast-meal');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Logging...';
        btn.disabled = true;

        // Log all items
        for (let item of currentFuelcastItems) {
            await fetch('/api/log_nutrition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({
                    user_id: userId,
                    dish_name: item.name + ' (AI)',
                    calories: parseInt(item.cal) || 0,
                    protein: parseInt(item.p) || 0,
                    fats: parseInt(item.f) || 0,
                    carbs: parseInt(item.c) || 0,
                    weight_g: parseInt(item.w) || 0
                })
            });
        }

        loadNutrition();
        if (typeof loadGamification === 'function') loadGamification();

        btn.innerHTML = oldText;
        btn.disabled = false;

        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

        document.getElementById('fuelcast-scan-modal').querySelector('.modal-content').style.transform = 'translateY(100%)';
        setTimeout(() => {
            closeModal('fuelcast-scan-modal');
        }, 400); // Wait for transition
    };
};

window.removeFuelcastItem = function (idx) {
    currentFuelcastItems.splice(idx, 1);
    if (currentFuelcastItems.length === 0) {
        closeModal('fuelcast-scan-modal');
    } else {
        renderFuelcastModal();
    }
};


// =========================================================
// --- 5. РЕДАГУВАННЯ ЇЖІ ТА АВТОМАТИЧНИЙ ПЕРЕРАХУНОК ---
// =========================================================

let baseMacros = { w: 0, cal: 0, p: 0, f: 0, c: 0 };

window.openEditFood = function (id, name, cal, p, f, c, w) {
    document.getElementById('edit-food-id').value = id;
    document.getElementById('edit-food-name').value = name;
    document.getElementById('edit-food-cal').value = cal;
    document.getElementById('edit-food-prot').value = p;
    document.getElementById('edit-food-fat').value = f;
    document.getElementById('edit-food-carb').value = c;
    document.getElementById('edit-food-weight').value = w || 0;

    const correctionInput = document.getElementById('edit-food-correction');
    if (correctionInput) correctionInput.value = '';

    baseMacros = {
        w: w || 100,
        cal: cal || 0,
        p: p || 0,
        f: f || 0,
        c: c || 0
    };

    document.getElementById('edit-food-modal').classList.add('active');
};

window.autoScaleMacros = function () {
    const newWeight = parseInt(document.getElementById('edit-food-weight').value) || 0;

    if (baseMacros.w > 0 && newWeight > 0) {
        const ratio = newWeight / baseMacros.w;
        document.getElementById('edit-food-cal').value = Math.round(baseMacros.cal * ratio);
        document.getElementById('edit-food-prot').value = Math.round(baseMacros.p * ratio);
        document.getElementById('edit-food-fat').value = Math.round(baseMacros.f * ratio);
        document.getElementById('edit-food-carb').value = Math.round(baseMacros.c * ratio);
    } else if (newWeight === 0) {
        document.getElementById('edit-food-cal').value = 0;
        document.getElementById('edit-food-prot').value = 0;
        document.getElementById('edit-food-fat').value = 0;
        document.getElementById('edit-food-carb').value = 0;
    }
};

const weightInputEl = document.getElementById('edit-food-weight');
if (weightInputEl) {
    weightInputEl.addEventListener('input', autoScaleMacros);
}

window.recalculateFoodAI = async function () {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("ШІ-Перерахунок не працює в офлайн режимі.");
        return;
    }

    const logId = document.getElementById('edit-food-id').value;
    const correctionText = document.getElementById('edit-food-correction').value.trim();

    if (!correctionText) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_describe_change', "Опишіть, що потрібно змінити."));
        return;
    }

    const btn = document.getElementById('btn-recalc-food');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Перерахунок...'; window.refreshIcons(); }

    const currentData = {
        dish_name: document.getElementById('edit-food-name').value,
        calories: parseInt(document.getElementById('edit-food-cal').value) || 0,
        protein: parseInt(document.getElementById('edit-food-prot').value) || 0,
        fats: parseInt(document.getElementById('edit-food-fat').value) || 0,
        carbs: parseInt(document.getElementById('edit-food-carb').value) || 0,
        weight_g: parseInt(document.getElementById('edit-food-weight').value) || 0
    };

    try {
        const res = await fetch('/api/recalc_food', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: userId,
                log_id: parseInt(logId),
                current_data: currentData,
                correction: correctionText
            })
        });

        const data = await res.json();

        if (data.status === 'success' && data.data) {
            document.getElementById('edit-food-name').value = data.data.dish_name;
            document.getElementById('edit-food-cal').value = data.data.calories;
            document.getElementById('edit-food-prot').value = data.data.protein;
            document.getElementById('edit-food-fat').value = data.data.fats;
            document.getElementById('edit-food-carb').value = data.data.carbs;
            document.getElementById('edit-food-weight').value = data.data.weight_g || 0;

            baseMacros = {
                w: data.data.weight_g || 100,
                cal: data.data.calories || 0,
                p: data.data.protein || 0,
                f: data.data.fats || 0,
                c: data.data.carbs || 0
            };

            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert(loc('alert_recalc_success', "Успішно перераховано!"));
        } else {
            if (tg && tg.showAlert) tg.showAlert(loc('alert_recalc_fail', "Не вдалося перерахувати страву."));
        }
    } catch (e) {
        if (tg && tg.showAlert) tg.showAlert(loc('alert_error', "Помилка зв'язку з ШІ."));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Перерахувати'; window.refreshIcons(); }
        document.getElementById('edit-food-correction').value = '';
    }
};

window.submitEditFood = async function () {
    const id = document.getElementById('edit-food-id').value;
    const name = document.getElementById('edit-food-name').value.trim() || loc('default_dish_name', 'Страва');
    const cal = parseInt(document.getElementById('edit-food-cal').value) || 0;
    const p = parseInt(document.getElementById('edit-food-prot').value) || 0;
    const f = parseInt(document.getElementById('edit-food-fat').value) || 0;
    const c = parseInt(document.getElementById('edit-food-carb').value) || 0;
    const w = parseInt(document.getElementById('edit-food-weight').value) || 0;

    await fetch('/api/nutrition_log/' + userId + '/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ user_id: userId, dish_name: name, calories: cal, protein: p, fats: f, carbs: c, weight_g: w })
    });

    if (typeof closeModal === 'function') closeModal('edit-food-modal');
    loadNutrition();
    if (typeof loadGamification === 'function') loadGamification();
};

window.deleteFoodLog = async function (logId) {
    const isFemale = userData && userData.user && userData.user.gender === 'female';
    if (confirm(isFemale ? "Видалити цей прийом їжі?" : loc('confirm_delete_food', "Видалити цей прийом їжі?"))) {
        try {
            await fetch('/api/nutrition_log/' + userId + '/' + logId, { method: 'DELETE', headers: { 'ngrok-skip-browser-warning': 'true' } });
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            loadNutrition();
            if (typeof loadGamification === 'function') loadGamification();
        } catch (e) { }
    }
};


// =========================================================
// --- 6. РЕДАГУВАННЯ ПЛАНУ ТА V2.0 ФІЧІ ---
// =========================================================

window.openEditExModal = function (dayIndex, exIndex, name, sets, reps) {
    document.getElementById('edit-ex-day').value = dayIndex;
    document.getElementById('edit-ex-index').value = exIndex;
    document.getElementById('edit-ex-name').value = name;
    document.getElementById('edit-ex-sets').value = sets;
    document.getElementById('edit-ex-reps').value = reps;
    document.getElementById('edit-ex-title').innerText = (exIndex == -1) ? loc('btn_add_exercise', "Додати вправу") : loc('title_edit_exercise', "Редагувати вправу");
    document.getElementById('btn-delete-ex').style.display = (exIndex == -1) ? "none" : "block";
    document.getElementById('edit-exercise-modal').classList.add('active');
};

window.submitEditExercise = async function () {
    const dayIndex = document.getElementById('edit-ex-day').value;
    const exIndex = parseInt(document.getElementById('edit-ex-index').value);
    const name = document.getElementById('edit-ex-name').value.trim();
    const sets = document.getElementById('edit-ex-sets').value.trim() || "1";
    const reps = document.getElementById('edit-ex-reps').value.trim() || "10";

    if (!name) return;

    let isAdapted = (dayIndex === 'adapted');

    if (isAdapted) {
        if (!userData.today_checkin.adapted_plan.exercises) userData.today_checkin.adapted_plan.exercises = [];
        if (exIndex == -1) userData.today_checkin.adapted_plan.exercises.push({ name: name, sets: sets, reps: reps });
        else userData.today_checkin.adapted_plan.exercises[exIndex] = { name: name, sets: sets, reps: reps };
    } else {
        let dIdx = parseInt(dayIndex);
        if (!userData.workout_plan.days[dIdx].exercises) userData.workout_plan.days[dIdx].exercises = [];
        if (exIndex == -1) userData.workout_plan.days[dIdx].exercises.push({ name: name, sets: sets, reps: reps });
        else userData.workout_plan.days[dIdx].exercises[exIndex] = { name: name, sets: sets, reps: reps };
    }

    if (typeof closeModal === 'function') closeModal('edit-exercise-modal');
    await savePlanToServer(isAdapted);
    renderWorkoutDays(isAdapted ? 'adapted' : parseInt(dayIndex));
};

window.deleteExercise = async function () {
    const isFemale = userData && userData.user && userData.user.gender === 'female';
    if (!confirm(isFemale ? "Видалити цю вправу?" : loc('confirm_delete_ex', "Видалити цю вправу?"))) return;
    const dayIndex = document.getElementById('edit-ex-day').value;
    const exIndex = parseInt(document.getElementById('edit-ex-index').value);
    let isAdapted = (dayIndex === 'adapted');

    if (isAdapted) userData.today_checkin.adapted_plan.exercises.splice(exIndex, 1);
    else userData.workout_plan.days[parseInt(dayIndex)].exercises.splice(exIndex, 1);

    if (typeof closeModal === 'function') closeModal('edit-exercise-modal');
    await savePlanToServer(isAdapted);
    renderWorkoutDays(isAdapted ? 'adapted' : parseInt(dayIndex));
};

async function savePlanToServer(isAdapted) {
    if (typeof showLoading === 'function') showLoading(loc('loading_ai', "Збереження..."));
    try {
        if (isAdapted) {
            await fetch('/api/update_adapted_plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify({ user_id: userId, plan: userData.today_checkin.adapted_plan }) });
        } else {
            await fetch('/api/update_workout_plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify({ user_id: userId, plan: userData.workout_plan }) });
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) { } finally {
        if (typeof navTo === 'function') navTo('dashboard-view');
        else if (typeof showView === 'function') showView('dashboard-view');
    }
}

// --- V2.0: AI Substitute (Миттєва заміна вправи) ---
let currentSubstitutes = [];

window.requestExerciseSubstitute = async function () {
    if (!currentExercise) return;
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("Заміна вправи через ШІ потребує підключення до інтернету.");
        return;
    }

    document.getElementById('substitute-modal').classList.add('active');
    document.getElementById('substitute-loading').style.display = 'block';
    document.getElementById('substitute-options').style.display = 'none';
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    try {
        const res = await fetch('/api/ai/substitute_exercise', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ user_id: userId, exercise_name: currentExercise })
        });
        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.substitutes) {
            currentSubstitutes = data.data.substitutes;
            for (let i = 0; i < 3; i++) {
                let sub = currentSubstitutes[i];
                if (sub) {
                    document.getElementById(`sub-opt-${i + 1}-name`).innerText = sub.name;
                    document.getElementById(`sub-opt-${i + 1}-reason`).innerText = sub.reason;
                    document.getElementById(`sub-opt-${i + 1}-name`).parentElement.style.display = 'block';
                } else {
                    document.getElementById(`sub-opt-${i + 1}-name`).parentElement.style.display = 'none';
                }
            }
            document.getElementById('substitute-loading').style.display = 'none';
            document.getElementById('substitute-options').style.display = 'flex';
        } else {
            document.getElementById('substitute-loading').innerText = 'Не вдалося знайти альтернативи.';
        }
    } catch (e) {
        document.getElementById('substitute-loading').innerText = 'Помилка з\'єднання з ШІ.';
    }
};

window.applyExerciseSubstitute = async function (index) {
    if (!currentSubstitutes[index]) return;
    const newExName = currentSubstitutes[index].name;

    let isAdapted = (currentPlanDay === 'adapted');
    let exercises = isAdapted ? userData.today_checkin.adapted_plan.exercises : userData.workout_plan.days[parseInt(currentPlanDay)].exercises;

    for (let ex of exercises) {
        if (ex.name === currentExercise) {
            ex.name = newExName;
            break;
        }
    }

    closeModal('substitute-modal');
    closeModal('workout-modal');
    await savePlanToServer(isAdapted);
    renderWorkoutDays(isAdapted ? 'adapted' : parseInt(currentPlanDay));

    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

// --- V2.0: Barbell Math (Калькулятор штанги) ---
window.openBarbellModal = function () {
    document.getElementById('barbell-target-weight').value = '';
    document.getElementById('barbell-plates-left').innerHTML = '';
    document.getElementById('barbell-plates-right').innerHTML = '';
    document.getElementById('barbell-text-result').innerText = 'Введіть цільову вагу';
    document.getElementById('barbell-modal').classList.add('active');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.calculateBarbell = function () {
    const target = parseFloat(document.getElementById('barbell-target-weight').value);
    const bar = parseFloat(document.getElementById('barbell-weight-select').value) || 20;
    const resEl = document.getElementById('barbell-text-result');
    const leftEl = document.getElementById('barbell-plates-left');
    const rightEl = document.getElementById('barbell-plates-right');

    leftEl.innerHTML = '';
    rightEl.innerHTML = '';

    if (isNaN(target) || target <= 0) {
        resEl.innerText = 'Введіть коректну вагу';
        return;
    }

    if (target < bar) {
        resEl.innerText = `Цільова вага менша за вагу грифа (${bar} кг)`;
        return;
    }

    let diff = target - bar;
    let perSide = diff / 2;

    const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
    let usedPlates = [];
    let remaining = perSide;

    for (let p of plates) {
        while (remaining >= p) {
            usedPlates.push(p);
            remaining = Math.round((remaining - p) * 100) / 100;
        }
    }

    if (remaining > 0 && remaining < 1.25) {
        resEl.innerHTML = `Неможливо зібрати точно <b>${target} кг</b>. Залишок: ${remaining * 2} кг`;
    } else {
        resEl.innerHTML = `На кожну сторону: <b>${perSide} кг</b>`;
    }

    let html = '';
    usedPlates.forEach(p => {
        let cls = p.toString().replace('.', '_');
        html += `<div class="plate plate-${cls}">${p}</div>`;
    });

    leftEl.innerHTML = html;
    rightEl.innerHTML = html;
};


// =========================================================
// --- 7. ВІДНОВЛЕНІ ФУНКЦІЇ (ЧЕК-ІН, РЕЦЕПТИ, УЛЮБЛЕНЕ, РУЧНА ЇЖА) ---
// =========================================================

// 1. Адаптація плану (Чек-ін)
window.submitCheckin = async function () {
    if (window.SubscriptionGuard && !window.SubscriptionGuard.checkOrPaywall('DYNAMIC_ADAPT')) {
        return;
    }

    const sleep = document.getElementById('chk-sleep').value;
    const energy = document.getElementById('chk-energy').value;
    const stress = document.getElementById('chk-stress').value;
    const soreness = document.getElementById('chk-soreness').value;

    const isFemale = userData && userData.user && userData.user.gender === 'female';
    if (typeof showLoading === 'function') showLoading(isFemale ? "Адаптуємо план під твій стан..." : loc('loading_ai', "Адаптуємо план..."));

    try {
        const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: userId, sleep: parseInt(sleep), energy: parseInt(energy),
                stress: parseInt(stress), soreness: parseInt(soreness),
                current_day_plan: userData.workout_plan.days[currentDayIndex] || {}
            })
        });
        const data = await res.json();
        if (data.message === 'PAYWALL') {
            if (typeof hideLoading === 'function') hideLoading();
            if (window.SubscriptionGuard && typeof window.SubscriptionGuard.checkOrPaywall === 'function') {
                window.SubscriptionGuard.checkOrPaywall('DYNAMIC_ADAPT');
            } else {
                if (tg && tg.showAlert) tg.showAlert("Ця функція доступна лише в підписці PRO.");
            }
            return;
        }
        if (data.status === 'success') {
            if (typeof refreshUserData === 'function') await refreshUserData();
            if (typeof loadGamification === 'function') loadGamification();
            renderWorkoutDays('adapted');
        }
    } catch (e) {
        if (typeof navTo === 'function') navTo('dashboard-view');
        else if (typeof showView === 'function') showView('dashboard-view');
    }
};

// 2. Ручний запис їжі
window.addManualFood = async function () {
    const name = document.getElementById('food-name').value.trim() || 'Страва';
    const weight = parseInt(document.getElementById('food-weight').value) || 0;
    const cal = parseInt(document.getElementById('food-cal').value) || 0;
    const prot = parseInt(document.getElementById('food-prot').value) || 0;
    const fat = parseInt(document.getElementById('food-fat').value) || 0;
    const carb = parseInt(document.getElementById('food-carb').value) || 0;

    const btn = document.querySelector('button[onclick="addManualFood()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i>'; window.refreshIcons(); }

    const payload = { user_id: userId, dish_name: name, calories: cal, protein: prot, fats: fat, carbs: carb, weight_g: weight };

    if (!navigator.onLine) {
        addToOfflineQueue('nutrition', payload);
        document.getElementById('food-name').value = '';
        document.getElementById('food-weight').value = '';
        document.getElementById('food-cal').value = '';
        document.getElementById('food-prot').value = '';
        document.getElementById('food-fat').value = '';
        document.getElementById('food-carb').value = '';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="plus-circle"></i> Записати'; window.refreshIcons(); }
        return;
    }

    try {
        await fetch('/api/log_nutrition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(payload)
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

        document.getElementById('food-name').value = '';
        document.getElementById('food-weight').value = '';
        document.getElementById('food-cal').value = '';
        document.getElementById('food-prot').value = '';
        document.getElementById('food-fat').value = '';
        document.getElementById('food-carb').value = '';

        if (typeof loadNutrition === 'function') loadNutrition();
        if (typeof loadGamification === 'function') loadGamification();
    } catch (e) {
        console.error(e);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="plus-circle"></i> Записати'; window.refreshIcons(); }
    }
};

// 3. ШІ Холодильник (Рецепти)
let currentRecipe = null;

window.generateFridgeRecipe = async function () {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("ШІ рецепти не доступні в офлайн режимі.");
        return;
    }

    if (window.SubscriptionGuard && !window.SubscriptionGuard.checkOrPaywall('AI_RECIPE')) {
        return;
    }

    const ingr = document.getElementById('fridge-ingredients').value.trim();
    if (!ingr) {
        const isFemale = userData && userData.user && userData.user.gender === 'female';
        if (tg && tg.showAlert) tg.showAlert(isFemale ? "Напиши інгредієнти, які в тебе є!" : loc('alert_fill_fields', "Напишіть інгредієнти!"));
        return;
    }
    const btn = document.getElementById('btn-fridge');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i>'; window.refreshIcons(); }

    try {
        const res = await fetch('/api/generate_recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ user_id: userId, ingredients: ingr })
        });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
            currentRecipe = data.data;
            document.getElementById('recipe-cal').innerText = currentRecipe.calories;
            document.getElementById('recipe-p').innerText = currentRecipe.protein;
            document.getElementById('recipe-f').innerText = currentRecipe.fats;
            document.getElementById('recipe-c').innerText = currentRecipe.carbs;
            document.getElementById('recipe-text').innerHTML = typeof window.formatMarkdown === 'function' ? window.formatMarkdown(currentRecipe.recipe_text) : currentRecipe.recipe_text;
            document.getElementById('recipe-modal').classList.add('active');
        } else {
            if (tg && tg.showAlert) tg.showAlert("Не вдалося створити рецепт.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="utensils"></i> Придумати рецепт'; window.refreshIcons(); }
    }
};

window.eatRecipe = async function () {
    if (!currentRecipe) return;
    const btn = document.getElementById('btn-eat-recipe');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i>'; window.refreshIcons(); }

    const payload = { 
        user_id: userId, 
        dish_name: currentRecipe.dish_name || 'AI Recipe', 
        calories: parseInt(currentRecipe.calories) || 0, 
        protein: parseInt(currentRecipe.protein) || 0, 
        fats: parseInt(currentRecipe.fats) || 0, 
        carbs: parseInt(currentRecipe.carbs) || 0, 
        weight_g: parseInt(currentRecipe.weight_g) || parseInt(currentRecipe.estimated_weight_g) || 0 
    };

    if (!navigator.onLine) {
        addToOfflineQueue('nutrition', payload);
        if (typeof closeModal === 'function') closeModal('recipe-modal');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check"></i> Записати в щоденник'; window.refreshIcons(); }
        return;
    }

    try {
        await fetch('/api/log_nutrition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(payload)
        });
        if (typeof closeModal === 'function') closeModal('recipe-modal');
        if (typeof loadNutrition === 'function') loadNutrition();
        if (typeof loadGamification === 'function') loadGamification();
    } catch (e) { } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check"></i> Записати в щоденник'; window.refreshIcons(); }
    }
};

// 4. Улюблені страви (Збереження та використання)
window.saveToFavorites = async function (name, cal, p, f, c, w) {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("Потрібен інтернет для збереження в улюблене.");
        return;
    }
    try {
        await fetch('/api/favorite_meals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ user_id: userId, dish_name: name, calories: cal, protein: p, fats: f, carbs: c, weight_g: w })
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (tg && tg.showAlert) tg.showAlert("Збережено в Улюблене!");
    } catch (e) { }
};

window.openFavoriteMealsModal = async function () {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("Потрібен інтернет для завантаження улюблених страв.");
        return;
    }

    const modal = document.getElementById('favorite-meals-modal');
    const list = document.getElementById('favorite-meals-list');
    if (!modal || !list) return;

    list.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">Завантаження...</p>';
    modal.classList.add('active');

    try {
        const res = await fetch('/api/favorite_meals/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success' && data.data.length > 0) {
            let html = '';
            data.data.forEach(m => {
                let safeName = typeof window.escapeHTML === 'function' ? window.escapeHTML(m.dish_name) : m.dish_name;
                html += `<div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold; font-size: 14px;">${safeName}</div>
                        <div style="font-size: 12px; display: flex; gap: 8px;">
                            <span style="color: #ff9500; display:flex; align-items:center; gap:2px;"><i data-lucide="flame" style="width:12px;height:12px;"></i> ${Math.round(m.calories)}</span>
                            <span style="color: var(--text-color); display:flex; align-items:center; gap:2px;"><i data-lucide="beef" style="width:12px;height:12px;"></i> ${Math.round(m.protein)}</span>
                            <span style="color: var(--accent-gold); display:flex; align-items:center; gap:2px;"><i data-lucide="droplet" style="width:12px;height:12px;"></i> ${Math.round(m.fats)}</span>
                            <span style="color: var(--client-blue); display:flex; align-items:center; gap:2px;"><i data-lucide="wheat" style="width:12px;height:12px;"></i> ${Math.round(m.carbs)}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="window.applyFavoriteMeal('${safeName.replace(/'/g, "\\'")}', ${m.calories}, ${m.protein}, ${m.fats}, ${m.carbs}, ${m.weight_g})" style="width:auto; padding: 6px 12px; margin: 0; background: var(--success); color: #000; font-size: 12px; border: none;"><i data-lucide="plus" style="width: 16px; height: 16px;"></i></button>
                        <button onclick="window.deleteFavoriteMeal(${m.id})" style="width:auto; padding: 6px 12px; margin: 0; background: transparent; border: 1px solid var(--danger); color: var(--danger); font-size: 12px;"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                    </div>
                </div>`;
            });
            list.innerHTML = html;
            window.refreshIcons();
        } else {
            list.innerHTML = '<p style="text-align: center; color: var(--hint-color); font-size: 14px;">У вас ще немає улюблених страв. Збережіть страву з історії за допомогою відповідної кнопки.</p>';
        }
    } catch (e) {
        list.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 14px;">Помилка завантаження</p>';
    }
};

window.applyFavoriteMeal = async function (name, cal, p, f, c, w) {
    if (typeof closeModal === 'function') closeModal('favorite-meals-modal');

    const payload = { user_id: userId, dish_name: name, calories: cal, protein: p, fats: f, carbs: c, weight_g: w };

    if (!navigator.onLine) {
        addToOfflineQueue('nutrition', payload);
        return;
    }

    try {
        await fetch('/api/log_nutrition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(payload)
        });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        if (typeof loadNutrition === 'function') loadNutrition();
        if (typeof loadGamification === 'function') loadGamification();
    } catch (e) { }
};

window.deleteFavoriteMeal = async function (mealId) {
    if (!confirm("Видалити страву з улюбленого?")) return;
    try {
        await fetch('/api/favorite_meals/' + userId + '/' + mealId, { method: 'DELETE' });
        window.openFavoriteMealsModal();
    } catch (e) { }
};

// =========================================================
// --- 8. SHAREABLE WORKOUT SUMMARY (HTML2CANVAS) ---
// =========================================================

window.openWorkoutSummary = async function () {
    if (!userData || !userData.today_completed_sets || Object.keys(userData.today_completed_sets).length === 0) {
        if (tg && tg.showAlert) tg.showAlert("Немає даних для підсумку сьогодні. Виконайте хоча б один підхід!");
        return;
    }

    // Calculate stats from the object
    let exIds = new Set();
    let setsCount = 0;

    // today_completed_sets is an object: { "Day 1_Squat": 3 }
    Object.entries(userData.today_completed_sets).forEach(([key, count]) => {
        exIds.add(key);
        setsCount += count;
    });

    let exercisesCount = exIds.size;
    let calBurned = userData.gamification ? (userData.gamification.daily_calories_burned || Math.round(setsCount * 12.5)) : Math.round(setsCount * 12.5);
    let volume = 0;

    const btn = document.getElementById('btn-finish-workout');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Завантаження...';

    // Fetch volume from server
    try {
        const res = await fetch('/api/today_summary/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();
        if (data.status === 'success') {
            volume = data.volume;
            if (data.calories) calBurned = data.calories;
        }
    } catch (e) { console.error(e); }

    if (btn) btn.innerHTML = oldHtml;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    // Set UI
    document.getElementById('ws-val-ex').innerText = exercisesCount;
    document.getElementById('ws-val-sets').innerText = setsCount;
    document.getElementById('ws-val-vol').innerText = volume;
    document.getElementById('ws-val-cal').innerText = calBurned;

    const now = new Date();
    document.getElementById('ws-date-subtitle').innerText = now.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

    // Generate QR code
    const qrContainer = document.getElementById('share-qr-code');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        try {
            new QRCode(qrContainer, {
                text: `https://t.me/fitness_bot?start=ref_${userId}`,
                width: 80,
                height: 80,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
        } catch(e) { console.error("QR Code Error:", e); }
    }

    // Open modal
    const modal = document.getElementById('workout-summary-modal');
    modal.classList.add('active');

    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

window.shareSummaryImage = async function () {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert("Потрібен інтернет для відправки.");
        return;
    }

    const btn = document.getElementById('btn-share-summary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Відправка...';
    btn.disabled = true;
    window.refreshIcons();

    try {
        const captureArea = document.getElementById('summary-snapshot-area');

        // Use html2canvas
        const canvas = await html2canvas(captureArea, {
            backgroundColor: '#000000',
            scale: 2, // higher resolution
            useCORS: true,
            logging: false
        });

        const base64Image = canvas.toDataURL('image/jpeg', 0.9);

        // Send to Telegram Bot via FastAPI backend
        const res = await fetch('/api/share_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: window.userId,
                image_base64: base64Image,
                caption: "💪 Мій результат сьогодні у Fitness Hub Pro!\nПриєднуйся: https://t.me/coach_app_bot"
            })
        });

        const data = await res.json();

        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert("✅ Фото надіслано тобі в чат з ботом!");
            closeModal('workout-summary-modal');
        } else {
            throw new Error(data.message || "Server Error");
        }

    } catch (e) {
        console.error(e);
        if (tg && tg.showAlert) tg.showAlert("❌ Помилка відправки. Спробуй ще раз.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        window.refreshIcons();
    }
};

// =========================================================
// --- 9. WEEKLY RECAP MODAL (Replaces Stories) ---
// =========================================================

window.weeklyRecapSlides = [];
window.currentRecapIndex = 0;

window.openWeeklyRecapModal = async function () {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert('Потрібен інтернет для завантаження підсумків.');
        return;
    }

    const btn = document.querySelector('[onclick*="openWeeklyRecapModal"]');
    const oldBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Завантаження...';
        btn.disabled = true;
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }

    try {
        const res = await fetch('/api/recap/weekly/' + userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const data = await res.json();

        if (data.status === 'success' && data.slides && data.slides.length > 0) {
            window.weeklyRecapSlides = data.slides;
            window.currentRecapIndex = 0;
            window.renderRecapSlide();
            
            const modal = document.getElementById('weekly-recap-modal');
            if (modal) modal.classList.add('active');
            
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            if (tg && tg.showAlert) tg.showAlert('Недостатньо даних за тиждень. Тренуйся і повертайся!');
        }
    } catch (e) {
        console.error('Weekly Recap fetch error:', e);
        if (tg && tg.showAlert) tg.showAlert('Помилка завантаження підсумків.');
    } finally {
        if (btn) {
            btn.innerHTML = oldBtnHtml;
            btn.disabled = false;
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
        }
    }
};

window.renderRecapSlide = function() {
    if (!window.weeklyRecapSlides || window.weeklyRecapSlides.length === 0) return;
    
    // Set content
    const contentArea = document.getElementById('recap-content-area');
    if (contentArea) {
        contentArea.innerHTML = window.weeklyRecapSlides[window.currentRecapIndex];
    }
    
    // Render static progress bars
    const barContainer = document.getElementById('recap-progress-bars');
    if (barContainer) {
        let html = '';
        for (let i = 0; i < window.weeklyRecapSlides.length; i++) {
            // Completed slides are 100%, current is 100% (static), future are 0%
            let isCurrentOrPast = i <= window.currentRecapIndex;
            let bgStyle = isCurrentOrPast ? 'background: #fff;' : 'background: rgba(255,255,255,0.3);';
            html += '<div class="story-bar-bg" style="flex:1; height:3px; margin:0 2px; border-radius:3px; background:rgba(255,255,255,0.3); overflow:hidden;">' + 
                    '<div style="width:100%; height:100%; ' + bgStyle + '"></div>' +
                    '</div>';
        }
        barContainer.innerHTML = '<div style="display:flex; width:100%;">' + html + '</div>';
    }
};

window.recapNextSlide = function() {
    if (window.currentRecapIndex < window.weeklyRecapSlides.length - 1) {
        window.currentRecapIndex++;
        window.renderRecapSlide();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    } else {
        // Close if at the end
        closeModal('weekly-recap-modal');
    }
};

window.recapPrevSlide = function() {
    if (window.currentRecapIndex > 0) {
        window.currentRecapIndex--;
        window.renderRecapSlide();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    }
};

window.shareRecapSlide = async function() {
    if (!navigator.onLine) {
        if (tg && tg.showAlert) tg.showAlert('Потрібен інтернет.');
        return;
    }

    const shareBtn = document.getElementById('btn-share-recap');
    const oldHtml = shareBtn.innerHTML;
    shareBtn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Відправка...';
    shareBtn.disabled = true;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    try {
        const captureArea = document.getElementById('weekly-recap-snapshot-area');
        if (!captureArea) throw new Error('No capture area');

        // Temporarily hide progress bars and navigation for clean screenshot
        const bars = document.getElementById('recap-progress-bars');
        if (bars) bars.style.display = 'none';

        const canvas = await html2canvas(captureArea, {
            backgroundColor: '#000000',
            scale: 2,
            useCORS: true,
            logging: false,
            width: captureArea.offsetWidth,
            height: captureArea.offsetHeight
        });

        // Restore UI
        if (bars) bars.style.display = 'block';

        const base64Image = canvas.toDataURL('image/jpeg', 0.9);

        const res = await fetch('/api/share_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: window.userId,
                image_base64: base64Image,
                caption: "📊 Мої тижневі підсумки у Fitness Hub Pro!\nПриєднуйся: https://t.me/coach_app_bot"
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg && tg.showAlert) tg.showAlert('✅ Фото надіслано в чат!');
        } else {
            throw new Error(data.message || 'Server error');
        }
    } catch (e) {
        console.error('Share error:', e);
        if (tg && tg.showAlert) tg.showAlert('❌ Помилка відправки.');
    } finally {
        shareBtn.innerHTML = oldHtml;
        shareBtn.disabled = false;
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }
};