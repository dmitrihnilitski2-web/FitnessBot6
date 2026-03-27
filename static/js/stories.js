// =========================================================
// FITNESS HUB PRO | STORIES ENGINE (Weekly Recap)
// =========================================================

(function() {
'use strict';

var storyIndex = 0;
var storyProgress = 0;
var storyAnimationReq = null;
var storyStartTime = -1;
var storyClickLocked = false;
var STORY_DURATION = 5000; // 5 seconds per slide

// --- LOAD WEEKLY RECAP ---
window.loadWeeklyRecap = async function () {
    if (!navigator.onLine) {
        if (window.tg && window.tg.showAlert) window.tg.showAlert('Потрібен інтернет для завантаження підсумків.');
        return;
    }

    var btn = document.querySelector('[onclick*="loadWeeklyRecap"]');
    var oldBtnHtml = '';
    if (btn) {
        oldBtnHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i> Завантаження...';
        btn.disabled = true;
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }

    try {
        var res = await fetch('/api/recap/weekly/' + window.userId, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        var data = await res.json();

        if (data.status === 'success' && data.slides && data.slides.length > 0) {
            window.weeklySlides = data.slides;
            window.openStories();
        } else {
            if (window.tg && window.tg.showAlert) window.tg.showAlert('Недостатньо даних за тиждень. Тренуйся і повертайся!');
        }
    } catch (e) {
        console.error('Stories fetch error:', e);
        if (window.tg && window.tg.showAlert) window.tg.showAlert('Помилка завантаження підсумків.');
    } finally {
        if (btn) {
            btn.innerHTML = oldBtnHtml;
            btn.disabled = false;
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
        }
    }
};

// --- OPEN STORIES OVERLAY ---
window.openStories = function () {
    var overlay = document.getElementById('stories-view');
    if (!overlay || !window.weeklySlides || window.weeklySlides.length === 0) return;

    overlay.style.display = 'flex';

    // Lock clicks for 600ms to prevent ghost clicks
    storyClickLocked = true;
    setTimeout(function() { storyClickLocked = false; }, 600);

    // Add tap navigation to content area only (once)
    var contentArea = document.getElementById('story-content-area');
    if (contentArea && !contentArea._storyNavInit) {
        contentArea._storyNavInit = true;
        var lastTapTime = 0;

        contentArea.addEventListener('click', function(e) {
            if (storyClickLocked) return;
            if (e.target.closest('button')) return;

            var now = Date.now();
            if (now - lastTapTime < 500) return;
            lastTapTime = now;

            e.stopPropagation();

            var rect = contentArea.getBoundingClientRect();
            var x = (e.clientX || 0) - rect.left;

            if (x < rect.width * 0.3) {
                window.prevStory();
            } else {
                window.nextStory();
            }
        });
    }

    storyIndex = 0;
    window.renderStory();
};

// --- CLOSE ---
window.closeStories = function () {
    if (storyAnimationReq) cancelAnimationFrame(storyAnimationReq);
    storyAnimationReq = null;
    storyStartTime = -1;
    var overlay = document.getElementById('stories-view');
    if (overlay) overlay.style.display = 'none';
};

// --- RENDER CURRENT STORY ---
window.renderStory = function () {
    if (storyAnimationReq) cancelAnimationFrame(storyAnimationReq);
    storyAnimationReq = null;

    if (!window.weeklySlides || storyIndex >= window.weeklySlides.length) {
        window.closeStories();
        return;
    }

    // Set content
    var contentDiv = document.getElementById('story-content-area');
    if (contentDiv) contentDiv.innerHTML = window.weeklySlides[storyIndex];

    // Render progress bars
    var barContainer = document.getElementById('stories-progress-bars');
    if (barContainer) {
        var html = '';
        for (var i = 0; i < window.weeklySlides.length; i++) {
            var w = i < storyIndex ? '100%' : '0%';
            html += '<div class="story-bar-bg"><div class="story-bar-fill" id="story-bar-' + i + '" style="width:' + w + ';"></div></div>';
        }
        barContainer.innerHTML = html;
    }

    // KEY FIX: Do NOT use performance.now() here.
    // Set storyStartTime = -1 to signal that the first RAF callback
    // should capture the time from its own 'time' parameter.
    // This avoids time-origin mismatch in Telegram WebView.
    storyStartTime = -1;

    var slideIdx = storyIndex; // capture for closure safety

    function animate(time) {
        // On the very first frame, capture start time from RAF's own timestamp
        if (storyStartTime < 0) {
            storyStartTime = time;
        }

        // Safety: if slide changed externally, stop this loop
        if (storyIndex !== slideIdx) return;

        var elapsed = time - storyStartTime;
        storyProgress = Math.min((elapsed / STORY_DURATION) * 100, 100);

        var currentBar = document.getElementById('story-bar-' + storyIndex);
        if (currentBar) currentBar.style.width = storyProgress + '%';

        if (storyProgress >= 100) {
            storyIndex++;
            window.renderStory();
        } else {
            storyAnimationReq = requestAnimationFrame(animate);
        }
    }
    storyAnimationReq = requestAnimationFrame(animate);
};

// --- NAVIGATION ---
window.nextStory = function () {
    storyIndex++;
    if (storyIndex >= window.weeklySlides.length) {
        window.closeStories();
    } else {
        window.renderStory();
    }
};

window.prevStory = function () {
    if (storyIndex > 0) {
        storyIndex--;
    }
    window.renderStory();
};

// --- SHARE CURRENT STORY AS IMAGE ---
window.shareStorySlide = async function () {
    if (!navigator.onLine) {
        if (window.tg && window.tg.showAlert) window.tg.showAlert('Потрібен інтернет.');
        return;
    }

    // Pause timer
    if (storyAnimationReq) cancelAnimationFrame(storyAnimationReq);
    storyAnimationReq = null;

    var shareBtn = document.getElementById('story-share-btn');
    if (shareBtn) {
        shareBtn.innerHTML = '<i data-lucide="loader" class="spinner-icon"></i>';
        shareBtn.disabled = true;
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }

    try {
        var contentArea = document.getElementById('story-content-area');
        if (!contentArea) throw new Error('No content area');

        var canvas = await html2canvas(contentArea, {
            backgroundColor: '#000000',
            scale: 2,
            useCORS: true,
            logging: false,
            width: contentArea.offsetWidth,
            height: contentArea.offsetHeight
        });

        var base64Image = canvas.toDataURL('image/jpeg', 0.9);

        var res = await fetch('/api/share_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({
                user_id: window.userId,
                image_base64: base64Image,
                caption: "📊 Мої тижневі підсумки у Fitness Hub Pro!\nПриєднуйся: https://t.me/coach_app_bot"
            })
        });

        var data = await res.json();
        if (data.status === 'success') {
            if (window.tg && window.tg.HapticFeedback) window.tg.HapticFeedback.notificationOccurred('success');
            if (window.tg && window.tg.showAlert) window.tg.showAlert('✅ Фото надіслано тобі в чат з ботом!');
        } else {
            throw new Error(data.message || 'Server error');
        }
    } catch (e) {
        console.error('Share story error:', e);
        if (window.tg && window.tg.showAlert) window.tg.showAlert('❌ Помилка відправки.');
    } finally {
        if (shareBtn) {
            shareBtn.innerHTML = '<i data-lucide="send" style="width:18px;height:18px;"></i>';
            shareBtn.disabled = false;
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
        }
        // Resume timer using RAF-safe timing (same fix)
        var savedProgress = storyProgress;
        storyStartTime = -1;
        var slideIdx = storyIndex;

        function resumeAnimate(time) {
            if (storyStartTime < 0) {
                // Offset the start time to account for already-elapsed progress
                storyStartTime = time - (savedProgress / 100 * STORY_DURATION);
            }
            if (storyIndex !== slideIdx) return;

            var elapsed = time - storyStartTime;
            storyProgress = Math.min((elapsed / STORY_DURATION) * 100, 100);
            var currentBar = document.getElementById('story-bar-' + storyIndex);
            if (currentBar) currentBar.style.width = storyProgress + '%';
            if (storyProgress >= 100) {
                storyIndex++;
                window.renderStory();
            } else {
                storyAnimationReq = requestAnimationFrame(resumeAnimate);
            }
        }
        storyAnimationReq = requestAnimationFrame(resumeAnimate);
    }
};

})();
