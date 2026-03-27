console.log('Onboarding Engine 2.0 Init');

class OnboardingTour {
    // Етап 2: Повноцінний Сценарій App Walkthrough
    static steps = [
        // Частина 1: Головний екран (Home)
        {
            elementId: 'prof-activity', // daily summary analog
            text: 'Вітаємо у застосунку! Це твій головний екран. Тут відображається короткий підсумок твого дня: скільки калорій спожито та активність.',
            position: 'top'
        },
        {
            elementId: 'prof-mini-streak',
            text: 'Це твій стрік. Заходь у застосунок і виконуй завдання щодня, щоб не втратити вогник. Це твоя головна мотивація.',
            position: 'bottom'
        },
        
        // Частина 2: Тренування (План)
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="dashboard-view"]');
                if (nav) nav.click();
            },
            elementId: 'plan-title', 
            text: 'Тут ти створюєш свої тренування. Ти можеш зібрати програму самостійно з нашої бази вправ.',
            position: 'bottom'
        },
        {
            elementId: 'btn-smart-rebuild',
            text: 'Або дозволь штучному інтелекту зробити це за тебе. ШІ створить ідеальний план на основі твоїх цілей та навіть адаптує його, якщо ти відчуваєш біль або погано спав.',
            position: 'top'
        },
        {
            elementId: 'workout-container',
            text: 'Під час тренування записуй сюди підняту вагу та кількість повторень для кожного підходу. Це допоможе системі рахувати твій загальний тоннаж.',
            position: 'top'
        },
        {
            elementId: 'workout-container',
            text: 'Після завершення підходу автоматично запуститься таймер відпочинку. Ти почуєш вібрацію, коли прийде час робити наступний підхід.',
            position: 'bottom'
        },
        {
            action: () => {
                if (typeof openBarbellCalc === 'function') openBarbellCalc();
            },
            elementId: 'barbell-target-weight',
            text: 'Не хочеш рахувати математику в голові? Введи потрібну вагу, і калькулятор покаже, які саме млинці потрібно повісити на гриф з кожного боку.',
            position: 'bottom'
        },
        {
            action: () => {
                if (typeof closeModal === 'function') closeModal('barbell-modal');
                // Ensure finish workout button is visible for the tour
                const fw = document.getElementById('finish-workout-wrapper');
                if (fw) fw.style.display = 'block';
            },
            elementId: 'btn-finish-workout',
            text: 'Коли закінчиш усі вправи, натисни цю кнопку. Ти побачиш красиву картку з підсумками тренування, якою можна поділитися.',
            position: 'top'
        },

        // Частина 3: Харчування
        {
            action: () => {
                // hide finish workout so it doesnt stay on screen
                const fw = document.getElementById('finish-workout-wrapper');
                if (fw) fw.style.display = 'none';

                const nav = document.querySelector('.nav-item[onclick*="nutrition-view"]');
                if (nav) nav.click();
            },
            elementId: 'cal-left-val',
            text: 'Тут ти контролюєш своє харчування. Слідкуй за балансом білків, жирів та вуглеводів протягом дня.',
            position: 'bottom'
        },
        {
            elementId: 'food-name',
            text: 'Ти можеш шукати продукти в нашій базі та вводити їхню вагу вручну.',
            position: 'top'
        },
        {
            elementId: 'btn-scan-food',
            text: 'Але набагато швидше — просто сфотографувати свою тарілку або відсканувати упаковку. ШІ сам розпізнає страву.',
            position: 'top'
        },
        {
            elementId: 'water-glasses-container',
            text: 'Не забувай пити воду. Натискай на склянку щоразу, коли випиваєш порцію води, щоб підтримувати гідратацію.',
            position: 'top'
        },

        // Частина 4: FemTech
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="cycle-view"]');
                if (nav) {
                    nav.style.display = 'flex';
                    nav.click();
                }
            },
            elementId: 'cycle-ring-circle',
            text: 'Це розділ медичних інсайтів. Система відстежує день твого циклу (наприклад, лютеїнову або фолікулярну фазу).',
            position: 'bottom'
        },
        {
            elementId: 'cycle-insight-text',
            text: 'Натисни сюди, щоб отримати поради від ШІ. Система підкаже, як краще тренуватися та харчуватися саме сьогодні.',
            position: 'top'
        },

        // Частина 5: Аналітика
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="progress-view"]');
                if (nav) nav.click();
            },
            elementId: 'weightChart',
            text: 'Тут зберігається історія твого тіла. Відстежуй, як змінюється твоя вага та об\'єми з часом.',
            position: 'top'
        },
        {
            elementId: 'heatmap-container',
            text: 'Це кінематична мапа втоми. Вона червоніє там, де м\'язи ще не відновилися після минулого тренування. Це допоможе уникнути перетренованості.',
            position: 'top'
        },
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="dashboard-view"]');
                if (nav) nav.click();
            },
            elementId: 'plan-title', // Recap button is here
            text: 'Щонеділі тут з\'являтимуться Сторіз із детальним розбором твого прогресу за минулий тиждень.',
            position: 'bottom'
        },

        // Частина 6: Ранги та Чат
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="gamification-view"]');
                if (nav) nav.click();
            },
            elementId: 'leaderboard-container',
            text: 'Змагайся з іншими користувачами. Отримуй досвід за тренування та піднімайся в рейтингу.',
            position: 'top'
        },
        {
            elementId: 'achievements-container',
            text: 'Виконуй щоденні завдання, закривай квести та розблоковуй унікальні досягнення для свого профілю.',
            position: 'top'
        },
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="coach-view"]');
                if (nav) nav.click();
            },
            elementId: 'coach-view',
            text: 'Тут ти можеш спілкуватися зі своїм реальним тренером, отримувати коментарі до техніки виконання вправ або ставити питання ШІ-асистенту.',
            position: 'top'
        },

        // Частина 7: Фінал та Підписка
        {
            action: () => {
                const nav = document.querySelector('.nav-item[onclick*="profile-view"]');
                if (nav) nav.click();
            },
            elementId: 'prof-sub-tier',
            text: 'Тут ти можеш змінити свій тарифний план. Розблокуй версію PRO, щоб отримати безлімітний ШІ та всі інші преміум функції.',
            position: 'top'
        },
        {
            action: () => {
                if (typeof SubscriptionManager !== 'undefined') SubscriptionManager.openModal();
            },
            elementId: 'subscription-management-modal',
            text: 'Навчання завершено! Ти готовий до роботи. Натисни "Відкрити PRO", щоб протестувати всі преміальні функції просто зараз, або закрий вікно, щоб залишитись на базовому тарифі.',
            position: 'top',
            isUpsell: true,
            upsellFeature: 'AI_FOOD_SCAN',
            btnText: 'Відкрити PRO'
        }
    ];
    static currentStep = 0;
    static overlay = null;
    static activeTooltip = null;

    static start() {
        if (!window.userData) return;
        if (window.userData.onboarding_completed && !this.forceReplay) return;

        this.currentStep = 0;
        this.createOverlay();
        // Give the UI a brief moment to render out before overlaying
        setTimeout(() => this.showStep(), 500);
    }

    static replay() {
        this.forceReplay = true;
        if (window.userData) window.userData.onboarding_completed = 0;
        this.currentStep = 0;
        const nav = document.querySelector('.nav-item[onclick*="profile-view"]');
        if (nav) nav.click();
        setTimeout(() => this.start(), 300);
    }

    static createOverlay() {
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'onboarding-overlay';
            
            // Завдання 1: Emergency Exit
            const skipBtn = document.createElement('button');
            skipBtn.className = 'onboarding-skip-btn';
            skipBtn.innerHTML = '✕ Пропустити навчання';
            skipBtn.onclick = () => this.finishTour();
            this.overlay.appendChild(skipBtn);
            
            document.body.appendChild(this.overlay);
        }
        this.overlay.style.display = 'block';
    }

    static async showStep() {
        try {
            this.clearSpotlight();
            
            if (this.currentStep >= this.steps.length) {
                await this.finishTour();
                return;
            }

            const step = this.steps[this.currentStep];
            
            // Виконуємо асинхронну дію перед кроком (наприклад, клік по вкладці)
            if (typeof step.action === 'function') {
                await step.action();
                // Чекаємо завершення анімацій DOM (200-300мс)
                await new Promise(r => setTimeout(r, 350));
            }

            // Шукаємо елемент за id або селектором
            let el = null;
            if (step.elementId) {
                el = document.getElementById(step.elementId) || document.querySelector(step.elementId);
            }

            // Надійніша перевірка на видимість елемента у DOM
            const isHidden = !el || (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0);

            if (isHidden) {
                console.warn(`[Onboarding Failsafe] Елемент не знайдено або він прихований, пропускаю крок ${this.currentStep}: ${step.elementId}`);
                this.currentStep++;
                // Затримка перед наступним кроком, щоб не проскочити все миттєво
                setTimeout(() => this.showStep(), 100);
                return;
            }

            setTimeout(() => {
                // Завдання 1: Фікс підсвічування (inline-styles)
                el.dataset.obPos = el.style.position || '';
                el.dataset.obZ = el.style.zIndex || '';
                el.dataset.obBg = el.style.background || '';
                
                el.classList.add('onboarding-highlight');
                el.style.position = 'relative';
                el.style.zIndex = '10000';
                el.style.background = '#ffffff';

                this.activeTooltip = document.createElement('div');
                this.activeTooltip.className = `onboarding-tooltip`;
                
                let btnHtml = '';
                if (step.isUpsell) {
                    const upsellText = step.btnText || 'Спробувати магію';
                    btnHtml = `<button class="onboarding-btn upsell" onclick="OnboardingTour.triggerUpsell('${step.upsellFeature}')"><i data-lucide="sparkles"></i> ${upsellText}</button>`;
                } else {
                    btnHtml = `<button class="onboarding-btn" onclick="OnboardingTour.nextStep()">Зрозуміло <i data-lucide="arrow-right"></i></button>`;
                }

                this.activeTooltip.innerHTML = `
                    <div class="onboarding-text">${step.text}</div>
                    <div class="onboarding-actions">
                        ${btnHtml}
                    </div>
                `;
                
                document.body.appendChild(this.activeTooltip);
                
                this.calculateTooltipPosition(el, step);
                
                // Скролимо ПІДКАЗКУ в центр, щоб користувач точно бачив текст і кнопку
                this.activeTooltip.scrollIntoView({ behavior: 'smooth', block: 'center' });

                if (typeof window.refreshIcons === 'function') window.refreshIcons();
            }, 100); // Wait short amount of time before rendering tooltip
        } catch (error) {
            console.error('[Onboarding Failsafe] Critical error in showStep:', error);
            this.currentStep++;
            setTimeout(() => this.showStep(), 100);
        }
    }

    static calculateTooltipPosition(el, step) {
        if (!this.activeTooltip) return;

        const rect = el.getBoundingClientRect();
        const tooltipRect = this.activeTooltip.getBoundingClientRect();
        const padding = 15;
        const screenPadding = 10;
        
        let top, left;
        let preferredPos = step.position || 'top';

        // Визначаємо вертикальну позицію (top/bottom)
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (preferredPos === 'top' && spaceAbove < tooltipRect.height + padding) {
            preferredPos = 'bottom';
        } else if (preferredPos === 'bottom' && spaceBelow < tooltipRect.height + padding) {
            preferredPos = 'top';
        }

        if (preferredPos === 'top') {
            top = rect.top + window.scrollY - tooltipRect.height - padding;
            this.activeTooltip.classList.add('top');
        } else {
            top = rect.bottom + window.scrollY + padding;
            this.activeTooltip.classList.add('bottom');
        }

        // Визначаємо горизонтальну позицію (центрування з обмеженнями)
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Обмеження по краях екрана
        if (left < screenPadding) left = screenPadding;
        if (left + tooltipRect.width > window.innerWidth - screenPadding) {
            left = window.innerWidth - tooltipRect.width - screenPadding;
        }

        this.activeTooltip.style.top = `${top}px`;
        this.activeTooltip.style.left = `${left}px`;
    }

    static nextStep() {
        this.currentStep++;
        this.showStep();
    }

    static async triggerUpsell(featureKey) {
        const success = await this.markOnboardingCompleted();
        if (!success) return; // Не закриваємо, якщо помилка на бекенді

        this.clearSpotlight();
        this.overlay.style.display = 'none';
        
        // Show Paywall immediately as aggressive upsell
        PaywallModal.open(featureKey);
    }

    static clearSpotlight() {
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
            // Відновлюємо старі стилі
            el.style.position = el.dataset.obPos || '';
            el.style.zIndex = el.dataset.obZ || '';
            el.style.background = el.dataset.obBg || '';
        });
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
        }
    }

    static async finishTour() {
        const success = await this.markOnboardingCompleted();
        if (success) {
            this.clearSpotlight();
            if (this.overlay) this.overlay.style.display = 'none';
        }
    }

    // Крок 1: Збереження стану ПІСЛЯ відповіді сервера
    static async markOnboardingCompleted() {
        try {
            const res = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ user_id: window.userId })
            });
            if (res.ok) {
                if (window.userData) window.userData.onboarding_completed = 1;
                console.log("Onboarding state saved successfully");
                return true;
            } else {
                console.error("Failed to save onboarding state on backend");
                return false;
            }
        } catch (e) {
            console.error('Failed to mark onboarding', e);
            return false;
        }
    }
}
