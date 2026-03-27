/* =========================================================
   FITNESS HUB PRO | ЛОГІКА АДМІНІСТРАТОРА (admin.js)
   ========================================================= */

let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
}

const ADMIN_ID = 1100202114;
let currentUserId = null;

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
    currentUserId = Number(tg.initDataUnsafe.user.id);
} else {
    currentUserId = 1100202114;
}

// ФУНКЦІЯ ПЕРЕМИКАННЯ ЕКРАНІВ (ХОВАЄ ВСЕ ЗАЙВЕ)
function showAdminView(viewId) {
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = target.classList.contains('loader-container') ? 'flex' : 'block';
    }
}

async function initAdmin() {
    if (currentUserId !== ADMIN_ID) {
        showAdminView('error-view');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        return;
    }

    try {
        let initData = tg ? tg.initData : "";

        const statsRes = await fetch('/api/admin/stats', {
            headers: {
                'ngrok-skip-browser-warning': 'true',
                'X-Telegram-Init-Data': initData
            }
        });

        if (!statsRes.ok) throw new Error("Помилка завантаження статистики");
        const statsData = await statsRes.json();

        if (statsData.status === 'success') {
            document.getElementById('stat-total-users').innerText = statsData.data.total_users;
            document.getElementById('stat-total-time').innerText = statsData.data.total_time_hours;
            document.getElementById('stat-trainers').innerText = statsData.data.total_trainers;
            document.getElementById('stat-clients').innerText = statsData.data.total_clients;
            document.getElementById('stat-plans').innerText = statsData.data.total_plans;
        }

        const usersRes = await fetch('/api/admin/users', {
            headers: {
                'ngrok-skip-browser-warning': 'true',
                'X-Telegram-Init-Data': initData
            }
        });
        const usersData = await usersRes.json();

        const listContainer = document.getElementById('users-list');
        listContainer.innerHTML = '';

        if (usersData.status === 'success' && usersData.data && usersData.data.length > 0) {
            usersData.data.forEach(function(u) {
                let roleClass = u.role === 'trainer' ? 'role-trainer' : 'role-client';
                let roleText = u.role === 'trainer' ? 'Тренер' : 'Клієнт';
                let usernameText = u.username ? `@${u.username}` : `Без юзернейму (ID: ${u.user_id})`;
                let lastActive = u.last_active_date || "Ніколи";

                let hours = Math.floor((u.total_time_spent || 0) / 60);
                let mins = (u.total_time_spent || 0) % 60;
                let timeSpent = `${hours} год ${mins} хв`;

                let safeName = window.escapeHTML ? window.escapeHTML(u.name) : u.name;

                listContainer.innerHTML += `
                    <div class="admin-user-row">
                        <div class="admin-user-header">
                            <div style="font-weight: bold; color: var(--text-color);">${safeName}</div>
                            <div class="${roleClass} role-badge">${roleText}</div>
                        </div>
                        <div style="font-size: 13px; color: var(--client-blue);">${usernameText}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--hint-color); margin-top: 4px;">
                            <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="calendar" style="width: 12px; height: 12px;"></i> В онлайні: ${lastActive}</span>
                            <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="clock" style="width: 12px; height: 12px;"></i> ${timeSpent}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            listContainer.innerHTML = '<p style="color: var(--hint-color); text-align: center;">База порожня.</p>';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        showAdminView('admin-view');
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

    } catch (err) {
        console.error("Критична помилка в Адмін-панелі:", err);
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.innerText = "Помилка зв'язку з сервером.";
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}