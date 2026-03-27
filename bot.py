import asyncio
import logging
import io
from datetime import datetime
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
import aiosqlite

import config
import database
import ai_service

# Налаштування логування
logging.basicConfig(level=logging.INFO)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()

# ТВІЙ ID ЯК ГОЛОВНОГО АДМІНІСТРАТОРА СИСТЕМИ
ADMIN_ID = 1100202114

# =========================================================
# СЛОВНИКИ ЛОКАЛІЗАЦІЇ (i18n для Бота)
# =========================================================
BOT_DICT = {
    'uk': {
        'btn_hub': "Відкрити Fitness Hub",
        'btn_trainer': "Я Тренер (Створити команду)",
        'btn_admin': "Супер Адмін Панель",
        'btn_trainer_panel': "Відкрити панель Тренера",
        'btn_my_profile': "Мій власний профіль",
        'welcome': "Привіт, {name}.\n\nЯ твій персональний ШІ-наставник. Ти можеш спілкуватися зі мною тут, або відкрити свій Хаб для доступу до всіх інструментів (програма, їжа, аналітика).\n\nНатисни кнопку нижче для старту.",
        'welcome_joined': "Вітаю. Ви успішно приєдналися до команди вашого тренера.\n\nВідкрийте Fitness Hub, щоб заповнити свої дані та отримати план тренувань.",
        'trainer_success': "Статус оновлено. Ваш акаунт успішно переведено в статус Тренера.\n\nТепер ви маєте доступ до спеціальної панелі, де можете:\n• Бачити всіх своїх клієнтів.\n• Писати їм персональні плани харчування.\n• Копіювати реферальне посилання.",
        'error': "Виникла системна помилка. Відкрийте Хаб для перегляду вашого плану.",
        'push_morning': "Доброго ранку, {name}.\n\nОновіть статус свого самопочуття. Зайдіть у Хаб і заповніть чек-ін, щоб система адаптувала тренування під поточний стан.",
        'push_water': "Увага, {name}. Ваш водний баланс нижче норми.\n\nЗафіксовано споживання лише {water} мл з початку дня. Організм потребує гідратації для оптимального функціонування.",
        'push_evening': "Вечірнє зведення, {name}.\n\n{alerts}\n\nЗайдіть у Хаб та внесіть свої результати для збереження прогресу.",
        'alert_sets': "— Ви не занесли жодного тренувального підходу за сьогодні.",
        'alert_meals': "— Ваш щоденник харчування порожній.",
        'duel_own': "Системне обмеження: неможливо прийняти власний виклик. Очікуйте на суперника.",
        'duel_no_exp': "Відхилено: недостатньо досвіду (EXP) для цієї дуелі. Потрібно: {bet} EXP.",
        'duel_accepted': "Виклик прийнято. Дуель розпочалася. Ставка: {bet} EXP.",
        'duel_started_initiator': "Користувач {name} прийняв ваш виклик. Дуель на {bet} EXP розпочалася.",
        'duel_active': "Ця дуель вже активна.",
        'duel_finished': "Ця дуель вже завершена.",
        'duel_win': "ДУЕЛЬ ЗАВЕРШЕНА: ПЕРЕМОГА\n\nВаш результат: {score_w}, результат суперника: {score_l}.\nНараховано: +{bet} EXP.",
        'duel_lose': "ДУЕЛЬ ЗАВЕРШЕНА: ПОРАЗКА\n\nВаш результат: {score_l}, результат переможця: {score_w}.",
        'duel_draw': "ДУЕЛЬ ЗАВЕРШЕНА: НІЧИЯ\n\nРезультат рівний. Баланс досвіду не змінено.",
        'duel_expired': "Виклик скасовано.\n\nЧас очікування (24 години) минув. Ставка {bet} EXP повернена на ваш баланс.",
        'friend_added': "Користувача {name} додано у друзі.\n\nСпільний рейтинг доступний у Хабі.",
        'friend_notify': "Користувач {name} додав вас у друзі.\n\nСпільний рейтинг доступний у Хабі.",
        'friend_self': "Системне обмеження: неможливо додати власний профіль у друзі.",
        'friend_already': "Користувач {name} вже є у списку ваших друзів."
    },
    'en': {
        'btn_hub': "Open Fitness Hub",
        'btn_trainer': "I am a Trainer",
        'btn_admin': "Super Admin Panel",
        'btn_trainer_panel': "Open Trainer Panel",
        'btn_my_profile': "My Profile",
        'welcome': "Hello, {name}.\n\nI am your personal AI mentor. Chat with me here, or open your Hub to access all tools.\n\nClick the button below.",
        'welcome_joined': "Welcome. You successfully joined your trainer's team.\n\nOpen the Fitness Hub to get your plan.",
        'trainer_success': "Status updated. Your account is now a Trainer account.\n\nYou now have access to a special panel to manage clients.",
        'error': "A system error occurred. Please try again.",
        'push_morning': "Good morning, {name}.\n\nPlease fill out your check-in in the Hub to adapt your training.",
        'push_water': "Attention, {name}. Your water balance is low.\n\nYou have only consumed {water} ml today. Please hydrate.",
        'push_evening': "Evening report, {name}.\n\n{alerts}",
        'alert_sets': "— You haven't logged any workout sets today.",
        'alert_meals': "— Your food diary is empty.",
        'duel_own': "System limit: Cannot accept your own challenge. Wait for an opponent.",
        'duel_no_exp': "Rejected: Not enough EXP for this duel. Required: {bet} EXP.",
        'duel_accepted': "Challenge accepted. The duel begins. Bet: {bet} EXP.",
        'duel_started_initiator': "User {name} accepted your challenge. The {bet} EXP duel begins.",
        'duel_active': "This duel is already active.",
        'duel_finished': "This duel is already finished.",
        'duel_win': "DUEL FINISHED: VICTORY\n\nYour score: {score_w}, opponent: {score_l}.\nReceived: +{bet} EXP.",
        'duel_lose': "DUEL FINISHED: DEFEAT\n\nYour score: {score_l}, winner: {score_w}.",
        'duel_draw': "DUEL FINISHED: DRAW\n\nThe duel ended in a tie. No EXP changes.",
        'duel_expired': "Challenge expired.\n\nNo one accepted your duel within 24 hours. Your {bet} EXP bet has been refunded.",
        'friend_added': "User {name} added as a friend.\n\nShared leaderboard is available in the Hub.",
        'friend_notify': "User {name} added you as a friend.\n\nShared leaderboard is available in the Hub.",
        'friend_self': "System limit: Cannot add yourself as a friend.",
        'friend_already': "User {name} is already in your friends list."
    }
}

for lang in ['de', 'pl']: BOT_DICT[lang] = BOT_DICT['en'].copy()


def get_t(lang: str, key: str, **kwargs):
    if lang not in BOT_DICT: lang = 'en'
    text = BOT_DICT[lang].get(key, BOT_DICT['en'].get(key, key))
    return text.format(**kwargs) if kwargs else text


# =========================================================
# ДИНАМІЧНА КЛАВІАТУРА
# =========================================================

async def get_dynamic_keyboard(user_id: int, lang: str):
    role_info = await database.check_user_role(user_id)
    role = role_info.get("role", "client")
    kb = []
    if role == "trainer":
        kb.append([InlineKeyboardButton(text=get_t(lang, 'btn_trainer_panel'),
                                        web_app=WebAppInfo(url=config.WEBAPP_URL + "/trainer"))])
        kb.append([InlineKeyboardButton(text=get_t(lang, 'btn_my_profile'), web_app=WebAppInfo(url=config.WEBAPP_URL))])
    else:
        kb.append([InlineKeyboardButton(text=get_t(lang, 'btn_hub'), web_app=WebAppInfo(url=config.WEBAPP_URL))])
        kb.append([InlineKeyboardButton(text=get_t(lang, 'btn_trainer'), callback_data="register_trainer")])

    if user_id == ADMIN_ID: kb.append(
        [InlineKeyboardButton(text=get_t(lang, 'btn_admin'), web_app=WebAppInfo(url=config.WEBAPP_URL + "/admin"))])
    return InlineKeyboardMarkup(inline_keyboard=kb)


# --- БАЗОВІ КОМАНДИ ТА DEEP LINKS ---

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    username = message.from_user.username or ""
    lang = message.from_user.language_code or "en"
    full_name = message.from_user.full_name or "Атлет"

    user = await database.get_user(user_id)
    if not user:
        await database.save_user(user_id, {"name": full_name, "username": username}, {}, {})
        user = await database.get_user(user_id)
    else:
        await database.update_user_activity(user_id, username, lang)

    args = message.text.split()

    # 1. ОБРОБКА DEEP-LINKS (ДУЕЛІ ТА СІМ'Я)
    if len(args) > 1:
        if args[1].startswith('duel_'):
            duel_id_str = args[1].replace('duel_', '')
            if duel_id_str.isdigit():
                duel_id = int(duel_id_str)
                duel = await database.get_duel(duel_id)

                if duel and duel['status'] == 'pending':
                    if duel['initiator_id'] == user_id:
                        await message.answer(get_t(lang, 'duel_own'))
                    else:
                        if user and user.get('exp', 0) < duel['bet_exp']:
                            await message.answer(get_t(lang, 'duel_no_exp', bet=duel['bet_exp']))
                        else:
                            async with aiosqlite.connect(database.DB_NAME) as db:
                                await db.execute("UPDATE duels SET status='active', opponent_id=? WHERE id=?",
                                                 (user_id, duel_id))
                                await db.execute("UPDATE users SET exp = exp - ? WHERE user_id = ?",
                                                 (duel['bet_exp'], user_id))
                                await db.commit()
                            
                            await message.answer(get_t(lang, 'duel_accepted', bet=duel['bet_exp']), parse_mode="HTML")
                            initiator = await database.get_user(duel['initiator_id'])
                            if initiator:
                                init_lang = initiator.get('language', 'uk')
                                try:
                                    await bot.send_message(duel['initiator_id'],
                                                           get_t(init_lang, 'duel_started_initiator', name=full_name,
                                                                 bet=duel['bet_exp']), parse_mode="HTML")
                                except:
                                    pass
                elif duel and duel['status'] == 'active':
                    await message.answer(get_t(lang, 'duel_active'))
                elif duel and duel['status'] in ['completed', 'finished', 'rejected', 'expired']:
                    await message.answer(get_t(lang, 'duel_finished'))
        
        elif args[1].startswith('joinfam_'):
            token = args[1].replace('joinfam_', '')
            success, reason = await database.join_family_by_token(user_id, token)
            if success:
                await message.answer("✅ Вітаємо в сім'ї! Тепер у вас спільний доступ до PRO-функцій та власний сімейний рейтинг у додатку.")
            else:
                error_msg = "❌ Не вдалося приєднатися до сім'ї. "
                if reason == "family_full": error_msg += "У групі вже 4 учасники."
                elif reason == "invalid_token": error_msg += "Посилання застаріло або недійсне."
                await message.answer(error_msg)
            return

    # 2. ОБРОБКА РЕФЕРАЛЬНОГО ПОСИЛАННЯ ТРЕНЕРА
    if len(args) > 1 and args[1].startswith("trainer_"):
        try:
            trainer_id = int(args[1].split("_")[1])
            success = await database.link_client_to_trainer(user_id, trainer_id)
            kb = await get_dynamic_keyboard(user_id, lang)
            if success:
                await message.answer(get_t(lang, 'welcome_joined'), reply_markup=kb)
            else:
                await message.answer("Error: Invalid trainer link.", reply_markup=kb)
            return
        except Exception as e:
            logging.error(f"Trainer link error: {e}")

    # 3. ОБРОБКА ДОДАВАННЯ В ДРУЗІ
    if len(args) > 1 and args[1].startswith("friend_"):
        try:
            friend_id = int(args[1].split("_")[1])
            if friend_id == user_id:
                await message.answer(get_t(lang, 'friend_self'))
            else:
                success = await database.add_friend(user_id, friend_id)
                kb = await get_dynamic_keyboard(user_id, lang)
                friend_data = await database.get_user(friend_id)
                friend_name = friend_data.get("name", "Атлет") if friend_data else "Атлет"

                if success:
                    await message.answer(get_t(lang, 'friend_added', name=friend_name), parse_mode="HTML",
                                         reply_markup=kb)
                    if friend_data:
                        try:
                            await bot.send_message(friend_id, get_t(friend_data.get('language', 'uk'), 'friend_notify',
                                                                    name=full_name), parse_mode="HTML")
                        except:
                            pass
                    return
                else:
                    await message.answer(get_t(lang, 'friend_already', name=friend_name), parse_mode="HTML",
                                         reply_markup=kb)
                    return
        except Exception as e:
            logging.error(f"Friend link error: {e}")

    kb = await get_dynamic_keyboard(user_id, lang)
    await message.answer(get_t(lang, 'welcome', name=message.from_user.first_name), reply_markup=kb)


@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    lang = message.from_user.language_code or "en"
    if message.from_user.id == ADMIN_ID:
        kb = await get_dynamic_keyboard(message.from_user.id, lang)
        await message.answer("Доступ до Супер Адмін Панелі відкрито:", reply_markup=kb)
    else:
        await message.answer(get_t(lang, 'error'))


@dp.message(Command("regenerate_exercise"))
async def cmd_regen_exercise(message: types.Message):
    """Прихована команда для скидання кешу інструкції до вправи."""
    if message.from_user.id != ADMIN_ID:
        return
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        return await message.answer("Формат: /regenerate_exercise [назва вправи]")
    
    ex_name = args[1].strip().lower()
    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute("DELETE FROM exercise_library WHERE name = ?", (ex_name,))
        await db.commit()
    
    await message.answer(f"✅ Кеш для вправи '{ex_name}' очищено.\nНаступний запит цієї вправи буде наново згенерований через Gemini API.")


@dp.callback_query(F.data == "register_trainer")
async def process_trainer_registration(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    lang = callback.from_user.language_code or "en"

    # Більше не даємо роль безкоштовно. 
    # Відправляємо повідомлення про необхідність обрати тренерський план.
    msg = "🚀 Щоб відкрити Панель Тренера та почати вести клієнтів, оберіть один із професійних планів у Хабі."
    await callback.message.answer(msg)
    await callback.answer()


# --- ОБРОБКА ПОВІДОМЛЕНЬ (ЧАТ З ШІ) ---

@dp.message(F.text)
async def handle_text(message: types.Message):
    user_id = message.from_user.id
    lang = message.from_user.language_code or "en"
    await database.update_user_activity(user_id, message.from_user.username or "", lang)
    await bot.send_chat_action(chat_id=message.chat.id, action="typing")

    prompt = f"Ти професійний фітнес-тренер та спортивний лікар. Відповідай на питання: \"{message.text}\". Використовуй строгий, клінічний тон. Жодних емодзі. Коротко (до 150 слів). Мова: {lang}."
    try:
        from ai_service import genai, MODELS_TO_TRY
        response_text = get_t(lang, 'error')
        for model_name in MODELS_TO_TRY:
            try:
                res = await genai.GenerativeModel(model_name).generate_content_async(prompt)
                if res and res.text: response_text = res.text; break
            except:
                continue
        kb = await get_dynamic_keyboard(user_id, lang)
        await message.answer(response_text, reply_markup=kb)
    except Exception as e:
        kb = await get_dynamic_keyboard(user_id, lang)
        await message.answer(get_t(lang, 'error'), reply_markup=kb)

# =========================================================
# ШІ-СУДДЯ ТА ФОНОВІ ЗАДАЧІ
# =========================================================

async def cancel_expired_pending_duels():
    """Скасовує дуелі, які висять більше 24 годин без відповіді, і повертає EXP."""
    now = datetime.now()
    async with aiosqlite.connect(database.DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM duels WHERE status = 'pending'")
        pending_duels = await cursor.fetchall()

        for d in pending_duels:
            try:
                start_dt = datetime.strptime(d['start_date'], "%Y-%m-%d %H:%M:%S")
                if (now - start_dt).total_seconds() > 86400:
                    await db.execute("UPDATE users SET exp = exp + ? WHERE user_id = ?",
                                     (d['bet_exp'], d['initiator_id']))
                    await db.execute("UPDATE duels SET status = 'expired' WHERE id = ?", (d['id'],))
                    await db.commit()

                    u = await database.get_user(d['initiator_id'])
                    lang = u.get('language', 'uk') if u else 'uk'
                    try:
                        await bot.send_message(d['initiator_id'], get_t(lang, 'duel_expired', bet=d['bet_exp']),
                                               parse_mode="HTML")
                    except:
                        pass
            except Exception as e:
                logging.error(f"Error checking pending duel {d['id']}: {e}")


async def judge_active_duels():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(database.DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM duels WHERE status = 'active' AND end_date <= ?", (now_str,))
        for duel in await cursor.fetchall():
            p1, p2 = duel['initiator_id'], duel['opponent_id']
            d_type, bet = duel['duel_type'], duel['bet_exp']
            s_date, e_date = duel['start_date'], duel['end_date']

            async def get_score(u_id):
                if d_type == 'workouts':
                    return (await (await db.execute(
                        "SELECT COUNT(*) FROM workout_logs WHERE user_id = ? AND date >= ? AND date <= ?",
                        (u_id, s_date, e_date))).fetchone())[0] or 0
                elif d_type == 'calories':
                    return (await (await db.execute(
                        "SELECT SUM(calories) FROM nutrition_logs WHERE user_id = ? AND date >= ? AND date <= ?",
                        (u_id, s_date[:10], e_date[:10]))).fetchone())[0] or 0
                elif d_type == 'streak':
                    row = await (await db.execute("SELECT current_streak FROM users WHERE user_id = ?",
                                                  (u_id,))).fetchone(); return row[0] if row else 0
                return 0

            score1, score2 = await get_score(p1), await get_score(p2)
            winner_id, loser_id, is_draw = (p1, p2, False) if score1 > score2 else (
                (p2, p1, False) if score2 > score1 else (None, None, True))

            await db.execute("UPDATE duels SET status = 'completed', winner_id = ? WHERE id = ?",
                             (winner_id, duel['id']))
            if winner_id: await db.execute("UPDATE users SET exp = exp + ? WHERE user_id = ?", (bet * 2, winner_id))
            await db.commit()

            u1_data = await database.get_user(p1)
            u2_data = await database.get_user(p2)
            l1 = u1_data.get('language', 'uk') if u1_data else 'uk'
            l2 = u2_data.get('language', 'uk') if u2_data else 'uk'

            if is_draw:
                try:
                    await bot.send_message(p1, get_t(l1, 'duel_draw'), parse_mode="HTML")
                except:
                    pass
                try:
                    await bot.send_message(p2, get_t(l2, 'duel_draw'), parse_mode="HTML")
                except:
                    pass
            else:
                s_w, s_l = max(score1, score2), min(score1, score2)
                try:
                    await bot.send_message(winner_id,
                                           get_t(l1 if winner_id == p1 else l2, 'duel_win', bet=bet * 2, score_w=s_w,
                                                 score_l=s_l), parse_mode="HTML")
                except:
                    pass
                try:
                    await bot.send_message(loser_id,
                                           get_t(l2 if loser_id == p2 else l1, 'duel_lose', score_w=s_w, score_l=s_l),
                                           parse_mode="HTML")
                except:
                    pass


async def run_notifications(current_hour: int):
    today = datetime.now().strftime("%Y-%m-%d")
    for user in await database.get_all_users_for_notifications():
        user_id = user['user_id']
        lang = user.get('language', 'uk')
        try:
            s = await database.get_user_daily_summary(user_id, today)
            kb = await get_dynamic_keyboard(user_id, lang)
            if current_hour == 10 and not s['has_checkin']:
                await bot.send_message(user_id, get_t(lang, 'push_morning', name=user.get('name')), reply_markup=kb)
                await asyncio.sleep(0.5)
            elif current_hour == 15 and s['water_ml'] < 1000:
                await bot.send_message(user_id, get_t(lang, 'push_water', name=user.get('name'), water=s['water_ml']),
                                       reply_markup=kb)
                await asyncio.sleep(0.5)
            elif current_hour == 20:
                alerts = []
                if s['workout_sets'] == 0: alerts.append(get_t(lang, 'alert_sets'))
                if s['meals_logged'] == 0: alerts.append(get_t(lang, 'alert_meals'))
                if alerts:
                    await bot.send_message(user_id, get_t(lang, 'push_evening', name=user.get('name'),
                                                                 alerts="\n".join(alerts)),
                                                  reply_markup=kb)
                    await asyncio.sleep(0.5)
        except:
            pass


async def scheduler_task():
    logging.info("Фоновий планувальник (Суддя + Push + Скасування) запущено.")
    last_hour_notified = -1
    while True:
        now = datetime.now()
        try:
            await cancel_expired_pending_duels()
        except Exception as e:
            logging.error(f"Cancel pending error: {e}")

        try:
            await judge_active_duels()
        except Exception as e:
            logging.error(f"Judge error: {e}")

        if now.minute == 0 and now.hour != last_hour_notified:
            if now.hour in [10, 15, 20]: asyncio.create_task(run_notifications(now.hour))
            last_hour_notified = now.hour
        await asyncio.sleep(30)


# --- ЗАПУСК БОТА ---
async def main():
    await database.init_db()
    asyncio.create_task(scheduler_task())
    logging.info("Бот запущений і готовий до роботи!")
    await bot.delete_webhook(drop_pending_updates=True)
    # Закріплюємо кнопку відкриття Mini App у чаті бота
    try:
        from aiogram.types import MenuButtonWebApp, WebAppInfo as WAInfo
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Fitness Hub",
                web_app=WAInfo(url=config.WEBAPP_URL)
            )
        )
        logging.info("✅ Menu button встановлено: Fitness Hub")
    except Exception as e:
        logging.warning(f"Не вдалося встановити menu button: {e}")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Бота зупинено.")