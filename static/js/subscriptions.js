const TIERS = {
    FREE: 0,
    STARTER: 1,
    PRO: 2,
    FAMILY: 3,
    COACH_BASIC: 4,
    COACH_PRO: 5
};

const FEATURES = {
    AI_WORKOUT_GEN: { minTier: TIERS.STARTER },
    AI_FOOD_SCAN: { minTier: TIERS.PRO },
    AI_RECIPE: { minTier: TIERS.PRO },
    AUTO_GROCERY: { minTier: TIERS.PRO },
    DYNAMIC_ADAPT: { minTier: TIERS.PRO },
    FEM_TECH_ADVANCED: { minTier: TIERS.PRO },
    FATIGUE_MAP: { minTier: TIERS.PRO },
    AI_ANALYTICS: { minTier: TIERS.PRO },
    COACH_AI: { minTier: TIERS.COACH_PRO }
};

class SubscriptionGuard {
    static getCurrentTierName() {
        return (window.userData && window.userData.subscription_tier) ? window.userData.subscription_tier : 'FREE';
    }

    static getCurrentTierLevel() {
        const name = this.getCurrentTierName();
        return TIERS[name] !== undefined ? TIERS[name] : TIERS.FREE;
    }

    static checkHasAccess(featureKey) {
        const feature = FEATURES[featureKey];
        if (!feature) return true;
        const currentLevel = this.getCurrentTierLevel();
        return currentLevel >= feature.minTier;
    }

    static checkOrPaywall(featureKey) {
        if (this.checkHasAccess(featureKey)) return true;
        PaywallModal.open(featureKey);
        return false;
    }

    static applyPremiumLocks() {
        const elements = document.querySelectorAll('[data-feature]');
        elements.forEach(el => {
            const featureKey = el.getAttribute('data-feature');
            if (!this.checkHasAccess(featureKey)) {
                // Запобігаємо дублюванню оверлеїв
                if (el.querySelector('.premium-overlay')) return;

                el.classList.add('premium-locked-container');
                
                // Якщо це не кнопка, додаємо блюр
                if (el.tagName !== 'BUTTON' && el.tagName !== 'LABEL') {
                    el.classList.add('premium-blur');
                }

                const overlay = document.createElement('div');
                overlay.className = 'premium-overlay';
                overlay.onclick = (e) => {
                    e.stopPropagation();
                    this.checkOrPaywall(featureKey);
                };
                overlay.innerHTML = '<div class="premium-lock-badge"><i data-lucide="lock"></i> PRO</div>';
                el.appendChild(overlay);
            } else {
                // Якщо доступ є, прибираємо блоки
                el.classList.remove('premium-blur');
                const overlay = el.querySelector('.premium-overlay');
                if (overlay) overlay.remove();
            }
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

class PaywallModal {
    static open(featureKey) {
        const requiredTier = FEATURES[featureKey] ? FEATURES[featureKey].minTier : TIERS.PRO;
        const requiredTierName = Object.keys(TIERS).find(key => TIERS[key] === requiredTier) || 'PRO';

        let featureName = "Ця функція";
        let featureDesc = "Покращіть свій досвід з преміум-можливостями.";
        
        if (featureKey === 'AI_FOOD_SCAN') {
            featureName = "ШІ-аналіз їжі по фото";
            featureDesc = "Більше не треба шукати продукти вручну. ШІ автоматично розпізнає страву, вагу та БЖВ з одного фото.";
        }
        if (featureKey === 'DYNAMIC_ADAPT') {
            featureName = "ШІ-адаптація тренування";
            featureDesc = "Погано спали або болять м'язи? ШІ миттєво перепише ваше тренування, щоб уникнути травм.";
        }
        if (featureKey === 'FATIGUE_MAP') {
            featureName = "Теплова мапа втоми";
            featureDesc = "Дивіться, які м'язи ще не відновилися після минулого тренування на інтерактивній 3D-моделі.";
        }
        if (featureKey === 'AUTO_GROCERY') {
            featureName = "Смарт-список покупок";
            featureDesc = "ШІ згенерує ідеальний список продуктів у супермаркет під ваші цілі та бюджет.";
        }
        if (featureKey === 'COACH_PANEL') {
            featureName = "Панель Тренера";
            featureDesc = "Професійний інструмент для ведення клієнтів.";
        }
        if (featureKey === 'AI_WORKOUT_GEN') {
            featureName = "Генерація тренувань від ШІ";
            featureDesc = "Персональний мікроцикл, побудований з урахуванням вашої цілі, статі, віку та травм.";
        }
        if (featureKey === 'AI_RECIPE') {
            featureName = "ШІ-Холодильник (Рецепти)";
            featureDesc = "Напишіть, що є в холодильнику, і ШІ видасть рецепт, який ідеально впишеться у ваші залишки калорій.";
        }
        if (featureKey === 'AI_ANALYTICS') {
            featureName = "Глибока ШІ-Аналітика";
            featureDesc = "Отримайте персональний PDF-звіт з аналізом вашого прогресу, графіками та порадами.";
        }

        const modal = document.getElementById('paywall-modal');
        if (!modal) return;

        const titleEl = document.getElementById('paywall-feature-title');
        if (titleEl) {
            titleEl.innerHTML = `<div style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">${featureName}</div>
                                 <div style="font-size: 14px; color: var(--hint-color); font-weight: normal; line-height: 1.4;">${featureDesc}</div>
                                 <div style="margin-top: 15px; display: inline-block; background: rgba(191,90,242,0.1); color: #bf5af2; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold;">Доступно в підписці ${requiredTierName}</div>`;
        }

        const buyBtn = document.getElementById('paywall-buy-btn');
        if (buyBtn) {
            buyBtn.onclick = () => this.simulatePurchase(requiredTierName);
            buyBtn.innerHTML = `<i data-lucide="zap"></i> Відкрити ${requiredTierName} (Тест)`;
        }

        modal.classList.add('active');
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }

    static close() {
        const modal = document.getElementById('paywall-modal');
        if (modal) modal.classList.remove('active');
    }

    static async simulatePurchase(tierName) {
        const btn = document.getElementById('paywall-buy-btn');
        if (btn) btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Обробка...';

        try {
            const res = await fetch('/api/test_upgrade_tier', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ user_id: window.userId, new_tier: tierName })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                if (window.userData) window.userData.subscription_tier = tierName;
                if (typeof window.refreshUserData === 'function') await window.refreshUserData();
                this.close();
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                    window.Telegram.WebApp.showAlert(`Вітаємо! Ваш статус підвищено до ${tierName}.`);
                }
                SubscriptionGuard.applyPremiumLocks();
                
                if (tierName.startsWith('COACH')) {
                    setTimeout(() => { if(confirm("Перейти до тренерської панелі зараз?")) window.location.href = '/trainer'; }, 500);
                }
            }
        } catch (e) {
            console.error('Purchase error', e);
        } finally {
            if (btn) btn.innerHTML = `<i data-lucide="zap"></i> Відкрити ${tierName} (Тест)`;
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
        }
    }
}

class SubscriptionManager {
    static getTierDefinitions() {
        return [
            { id: 'FREE', name: 'FREE', price: 'Безкоштовно', desc: 'Ручне ведення щоденників.', icon: 'user' },
            { id: 'STARTER', name: 'STARTER', price: '$4.99 / міс', desc: '1 ШІ-план, Сканер штрих-кодів.', icon: 'star', color: '#0a84ff' },
            { id: 'PRO', name: 'PRO', price: '$14.99 / міс', desc: 'Безлімітний ШІ фото-сканер, адаптація.', icon: 'crown', color: '#d4af37' },
            { id: 'FAMILY', name: 'PRO FAMILY', price: '$30.00 / міс', desc: 'PRO для 2-4 членів родини.', icon: 'users', color: '#ff2d55' },
            { id: 'COACH_BASIC', name: 'COACH BASIC', price: '$19.99 / міс', desc: 'До 15 клієнтів.', icon: 'briefcase', color: '#32d74b' },
            { id: 'COACH_PRO', name: 'COACH PRO', price: '$59.99 / міс', desc: 'Безліміт клієнтів + ШІ-копайлот.', icon: 'award', color: '#bf5af2' }
        ];
    }

    static openModal() {
        const modal = document.getElementById('subscription-management-modal');
        if (!modal) return;
        this.renderPlans();
        modal.classList.add('active');
    }

    static closeModal() {
        const modal = document.getElementById('subscription-management-modal');
        if (modal) modal.classList.remove('active');
    }

    static renderPlans() {
        const container = document.getElementById('subscription-plans-container');
        if (!container) return;

        const currentTier = SubscriptionGuard.getCurrentTierName();
        const tiers = this.getTierDefinitions();

        let html = '';
        tiers.forEach(t => {
            const isCurrent = (t.id === currentTier);
            const color = t.color || 'var(--text-color)';
            html += `
                <div class="bento-card" style="border-color: ${isCurrent ? color : 'var(--border-color)'}; background: ${isCurrent ? 'rgba(255,255,255,0.03)' : 'transparent'}">
                    <div class="flex-between">
                        <div class="flex-center gap-12">
                            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px; color: ${color}"><i data-lucide="${t.icon}"></i></div>
                            <div>
                                <div style="font-weight: 800; font-size: 16px;">${t.name}</div>
                                <div style="color: ${color}; font-weight: bold; font-size: 13px;">${t.price}</div>
                            </div>
                        </div>
                        ${isCurrent ? '<div style="font-size: 10px; background: var(--success); color: #000; padding: 2px 8px; border-radius: 4px; font-weight: 800;">ПОТОЧНИЙ</div>' : ''}
                    </div>
                    <p class="text-muted" style="font-size: 12px; margin: 12px 0 20px;">${t.desc}</p>
                    ${!isCurrent ? `<button onclick="SubscriptionManager.upgradeTo('${t.id}')" style="width: 100%; border-radius: 12px; background: ${color}; color: #000; font-weight: 800;">Вибрати план</button>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }

    static async upgradeTo(newTier) {
        try {
            const res = await fetch('/api/test_upgrade_tier', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ user_id: window.userId, new_tier: newTier })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                if (window.userData) window.userData.subscription_tier = newTier;
                if (typeof window.refreshUserData === 'function') await window.refreshUserData();
                this.closeModal();
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                    window.Telegram.WebApp.showAlert(`Успіх! Ваш тариф оновлено до ${newTier}.`);
                }
                SubscriptionGuard.applyPremiumLocks();

                if (newTier.startsWith('COACH')) {
                    setTimeout(() => { if(confirm("Перейти до тренерської панелі зараз?")) window.location.href = '/trainer'; }, 500);
                }
            }
        } catch (e) {
            console.error('Upgrade error', e);
        }
    }
}
