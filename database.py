import aiosqlite
import json
from datetime import datetime, timedelta

DB_NAME = "fitness_bot.db"


async def init_db():
    """Ініціалізація бази даних та створення всіх необхідних таблиць."""
    async with aiosqlite.connect(DB_NAME) as db:

        # --- БАЗОВІ ТАБЛИЦІ (Збережено твою стабільну структуру) ---
        await db.execute('''CREATE TABLE IF NOT EXISTS users
                            (
                                user_id
                                INTEGER
                                PRIMARY
                                KEY,
                                name
                                TEXT,
                                gender
                                TEXT,
                                age
                                INTEGER,
                                height
                                INTEGER,
                                weight
                                REAL,
                                target_weight
                                REAL,
                                activity_level
                                TEXT,
                                primary_goal
                                TEXT,
                                custom_goal
                                TEXT,
                                notes
                                TEXT,
                                ai_risk_factors
                                TEXT,
                                ai_exercise_restrictions
                                TEXT,
                                ai_focus_areas
                                TEXT,
                                workout_plan
                                TEXT,
                                nutrition_goals
                                TEXT,
                                level
                                INTEGER
                                DEFAULT
                                1,
                                exp
                                INTEGER
                                DEFAULT
                                0,
                                role
                                TEXT
                                DEFAULT
                                'client',
                                trainer_id
                                INTEGER
                                DEFAULT
                                NULL,
                                food_preferences
                                TEXT
                                DEFAULT
                                '',
                                nutrition_plan
                                TEXT
                                DEFAULT
                                '',
                                username
                                TEXT
                                DEFAULT
                                '',
                                total_time_spent
                                INTEGER
                                DEFAULT
                                0,
                                last_active_date
                                TEXT
                                DEFAULT
                                '',
                                competition_sport
                                TEXT
                                DEFAULT
                                '',
                                competition_date
                                TEXT
                                DEFAULT
                                '',
                                cycle_start_date
                                TEXT
                                DEFAULT
                                '',
                                cycle_length
                                INTEGER
                                DEFAULT
                                28,
                                language
                                TEXT
                                DEFAULT
                                'uk',
                                current_streak
                                INTEGER
                                DEFAULT
                                0,
                                longest_streak
                                INTEGER
                                DEFAULT
                                0,
                                last_streak_date
                                TEXT
                                DEFAULT
                                '',
                                streak_freezes
                                INTEGER
                                DEFAULT
                                0,
                                is_onboarded
                                INTEGER
                                DEFAULT
                                0,
                                is_pro
                                INTEGER
                                DEFAULT
                                0,
                                macro_cycling
                                TEXT,
                                privacy_settings
                                TEXT
                                DEFAULT
                                '{"share_weight": true, "share_cycle": false, "share_food": true}',
                                timezone
                                TEXT,
                                push_prefs
                                TEXT
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS workout_logs
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                date
                                TEXT,
                                exercise_name
                                TEXT,
                                set_number
                                INTEGER,
                                weight
                                REAL,
                                reps
                                INTEGER,
                                exercise_type
                                TEXT
                                DEFAULT
                                'strength',
                                duration
                                INTEGER
                                DEFAULT
                                0,
                                distance
                                REAL
                                DEFAULT
                                0.0,
                                plan_day
                                TEXT
                                DEFAULT
                                '',
                                video_url
                                TEXT
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS nutrition_logs
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                date
                                TEXT,
                                dish_name
                                TEXT,
                                calories
                                INTEGER,
                                protein
                                INTEGER,
                                fats
                                INTEGER,
                                carbs
                                INTEGER,
                                weight_g
                                INTEGER
                                DEFAULT
                                0
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS daily_checkins
        (
            user_id
            INTEGER,
            date
            TEXT,
            sleep
            INTEGER,
            energy
            INTEGER,
            stress
            INTEGER,
            soreness
            INTEGER,
            adapted_plan
            TEXT,
            PRIMARY
            KEY
                            (
            user_id,
            date
                            )
            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS weight_logs
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                date
                                TEXT,
                                weight
                                REAL
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS exercise_library
                            (
                                name
                                TEXT
                                PRIMARY
                                KEY,
                                muscles
                                TEXT,
                                instruction
                                TEXT
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS water_logs
        (
            user_id
            INTEGER,
            date
            TEXT,
            amount
            INTEGER
            DEFAULT
            0,
            PRIMARY
            KEY
                            (
            user_id,
            date
                            )
            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS body_metrics
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                date
                                TEXT,
                                waist
                                REAL
                                DEFAULT
                                0.0,
                                hips
                                REAL
                                DEFAULT
                                0.0,
                                chest
                                REAL
                                DEFAULT
                                0.0,
                                biceps
                                REAL
                                DEFAULT
                                0.0
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS muscle_fatigue
        (
            user_id
            INTEGER,
            muscle
            TEXT,
            fatigue_level
            REAL
            DEFAULT
            0.0,
            last_updated
            TEXT,
            PRIMARY
            KEY
                            (
            user_id,
            muscle
                            )
            )''')

        # Оновлена таблиця симптомів циклу
        await db.execute('''CREATE TABLE IF NOT EXISTS cycle_symptoms
        (
            user_id
            INTEGER,
            date
            TEXT,
            flow_level
            TEXT,
            pain_level
            INTEGER,
            mood
            TEXT,
            sleep
            TEXT
            DEFAULT
            '',
            digestion
            TEXT
            DEFAULT
            '',
            physical
            TEXT
            DEFAULT
            '',
            libido
            TEXT
            DEFAULT
            '',
            sexual_activity
            TEXT
            DEFAULT
            '',
            notes
            TEXT,
            PRIMARY
            KEY
                            (
            user_id,
            date
                            )
            )''')

        # Нова таблиця для історії циклів (графік)
        await db.execute('''CREATE TABLE IF NOT EXISTS cycle_history
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                start_date
                                TEXT,
                                end_date
                                TEXT,
                                cycle_length
                                INTEGER,
                                period_length
                                INTEGER
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS duels
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                initiator_id
                                INTEGER,
                                opponent_id
                                INTEGER,
                                status
                                TEXT
                                DEFAULT
                                'pending',
                                bet_exp
                                INTEGER
                                DEFAULT
                                0,
                                duel_type
                                TEXT,
                                start_date
                                TEXT,
                                end_date
                                TEXT,
                                winner_id
                                INTEGER
                                DEFAULT
                                NULL
                            )''')

        # --- НОВІ ТАБЛИЦІ (ФАЗИ 1-4) ---
        await db.execute('''CREATE TABLE IF NOT EXISTS friends
        (
            user_id_1
            INTEGER,
            user_id_2
            INTEGER,
            status
            TEXT
            DEFAULT
            'accepted',
            PRIMARY
            KEY
                            (
            user_id_1,
            user_id_2
                            )
            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS favorite_meals
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                dish_name
                                TEXT,
                                calories
                                INTEGER,
                                protein
                                INTEGER,
                                fats
                                INTEGER,
                                carbs
                                INTEGER,
                                weight_g
                                INTEGER
                                DEFAULT
                                0
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS daily_quests
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                date
                                TEXT,
                                quest_type
                                TEXT,
                                target
                                INTEGER,
                                progress
                                INTEGER
                                DEFAULT
                                0,
                                reward_exp
                                INTEGER,
                                is_completed
                                INTEGER
                                DEFAULT
                                0
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS social_events
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                user_id
                                INTEGER,
                                event_type
                                TEXT,
                                content
                                TEXT,
                                timestamp
                                TEXT
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS trainer_templates
                            (
                                id
                                INTEGER
                                PRIMARY
                                KEY
                                AUTOINCREMENT,
                                trainer_id
                                INTEGER,
                                template_name
                                TEXT,
                                plan_data
                                TEXT
                            )''')

        # Таблиця коментарів тренера (V2.0)
        await db.execute('''CREATE TABLE IF NOT EXISTS coach_comments
                            (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER,
                                trainer_id INTEGER,
                                entity_type TEXT,
                                entity_id INTEGER,
                                comment_text TEXT,
                                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                            )''')

        # Історія ваги (V3.0)
        await db.execute('''CREATE TABLE IF NOT EXISTS weight_history
                            (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER,
                                weight_kg REAL,
                                log_date TEXT DEFAULT (date('now'))
                            )''')

        # Силові рекорди (1RM)
        await db.execute('''CREATE TABLE IF NOT EXISTS strength_records
                            (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER,
                                exercise_name TEXT,
                                weight_1rm REAL,
                                log_date TEXT DEFAULT (date('now'))
                            )''')


        # --- СІМЕЙНІ ПІДПИСКИ (ФАЗА 6) ---
        await db.execute('''CREATE TABLE IF NOT EXISTS family_groups (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                owner_id INTEGER UNIQUE,
                                created_at TEXT DEFAULT CURRENT_TIMESTAMP
                            )''')
        
        await db.execute('''CREATE TABLE IF NOT EXISTS family_members (
                                family_id INTEGER,
                                user_id INTEGER UNIQUE,
                                joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY(family_id) REFERENCES family_groups(id)
                            )''')

        await db.execute('''CREATE TABLE IF NOT EXISTS family_invites (
                                token TEXT PRIMARY KEY,
                                family_id INTEGER,
                                created_at TEXT DEFAULT CURRENT_TIMESTAMP
                            )''')

        # РОЗУМНЕ ОНОВЛЕННЯ (Міграція для старих баз)
        migrations = [
            "CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs(user_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs(user_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_cycle_symptoms_user_date ON cycle_symptoms(user_id, date)",
            "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client'",
            "ALTER TABLE users ADD COLUMN trainer_id INTEGER DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN food_preferences TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN nutrition_plan TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN username TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN total_time_spent INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN last_active_date TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN competition_sport TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN competition_date TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN cycle_start_date TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN cycle_length INTEGER DEFAULT 28",
            "ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'uk'",
            "ALTER TABLE workout_logs ADD COLUMN exercise_type TEXT DEFAULT 'strength'",
            "ALTER TABLE workout_logs ADD COLUMN duration INTEGER DEFAULT 0",
            "ALTER TABLE workout_logs ADD COLUMN distance REAL DEFAULT 0.0",
            "ALTER TABLE workout_logs ADD COLUMN plan_day TEXT DEFAULT ''",
            "ALTER TABLE nutrition_logs ADD COLUMN weight_g INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN last_streak_date TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN streak_freezes INTEGER DEFAULT 0",
            "ALTER TABLE cycle_symptoms ADD COLUMN sleep TEXT DEFAULT ''",
            "ALTER TABLE cycle_symptoms ADD COLUMN digestion TEXT DEFAULT ''",
            "ALTER TABLE cycle_symptoms ADD COLUMN physical TEXT DEFAULT ''",
            "ALTER TABLE cycle_symptoms ADD COLUMN libido TEXT DEFAULT ''",
            "ALTER TABLE cycle_symptoms ADD COLUMN sexual_activity TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN is_onboarded INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN is_pro INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN macro_cycling TEXT",
            "ALTER TABLE users ADD COLUMN privacy_settings TEXT DEFAULT '{\"share_weight\": true, \"share_cycle\": false, \"share_food\": true}'",
            "ALTER TABLE users ADD COLUMN timezone TEXT",
            "ALTER TABLE users ADD COLUMN push_prefs TEXT",
            "ALTER TABLE workout_logs ADD COLUMN video_url TEXT",
            "ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'FREE'",
            "ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN daily_feature_usage TEXT DEFAULT '{}'",
            "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL"
        ]

        for mig in migrations:
            try:
                await db.execute(mig)
            except:
                pass

        await db.commit()


# =========================================================
# КВЕСТИ ТА ГЕЙМІФІКАЦІЯ (ФАЗА 2)
# =========================================================

async def _update_quest(db, user_id: int, date: str, q_type: str, amount: float):
    """Внутрішня функція для оновлення прогресу квестів (викликається під час запису логів)."""
    db.row_factory = aiosqlite.Row
    cursor = await db.execute(
        "SELECT id, target, progress, reward_exp, is_completed FROM daily_quests WHERE user_id = ? AND date = ? AND quest_type = ?",
        (user_id, date, q_type))
    row = await cursor.fetchone()

    if row and row['is_completed'] == 0:
        new_progress = row['progress'] + amount
        if new_progress >= row['target']:
            await db.execute("UPDATE daily_quests SET progress = target, is_completed = 1 WHERE id = ?", (row['id'],))
            await db.execute("UPDATE users SET exp = exp + ? WHERE user_id = ?", (row['reward_exp'], user_id))
        else:
            await db.execute("UPDATE daily_quests SET progress = ? WHERE id = ?", (new_progress, row['id']))


async def get_daily_quests(user_id: int, date: str):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT * FROM daily_quests WHERE user_id = ? AND date = ?', (user_id, date))
        return [dict(row) for row in await cursor.fetchall()]


async def create_daily_quests(user_id: int, date: str, quests: list):
    async with aiosqlite.connect(DB_NAME) as db:
        for q in quests:
            await db.execute(
                'INSERT INTO daily_quests (user_id, date, quest_type, target, reward_exp) VALUES (?, ?, ?, ?, ?)',
                (user_id, date, q['type'], q['target'], q['reward']))
        await db.commit()


# =========================================================
# СОЦІАЛЬНИЙ РУШІЙ, ДРУЗІ ТА СТРІЧКА (ФАЗА 1 ТА 3)
# =========================================================

async def add_friend(user_id_1: int, user_id_2: int):
    if user_id_1 == user_id_2: return False
    u1, u2 = min(user_id_1, user_id_2), max(user_id_1, user_id_2)
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("INSERT OR IGNORE INTO friends (user_id_1, user_id_2, status) VALUES (?, ?, 'accepted')",
                         (u1, u2))
        await db.execute("UPDATE friends SET status='accepted' WHERE user_id_1=? AND user_id_2=?", (u1, u2))
        await db.commit()
        return True


async def get_friends_list(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT user_id, name, exp \
               FROM users
               WHERE user_id IN (SELECT user_id_2 FROM friends WHERE user_id_1 = ? AND status = 'accepted')
                  OR user_id IN (SELECT user_id_1 FROM friends WHERE user_id_2 = ? AND status = 'accepted')
               ORDER BY name ASC'''
        cursor = await db.execute(q, (user_id, user_id))
        return [dict(row) for row in await cursor.fetchall()]


async def get_friends_leaderboard(user_id: int, limit: int = 100):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT user_id, name, username, level, exp, current_streak, role, avatar_url \
               FROM users
               WHERE user_id = ?
                  OR user_id IN (SELECT user_id_2 FROM friends WHERE user_id_1 = ? AND status = 'accepted')
                  OR user_id IN (SELECT user_id_1 FROM friends WHERE user_id_2 = ? AND status = 'accepted')
               ORDER BY exp DESC LIMIT ?'''
        cursor = await db.execute(q, (user_id, user_id, user_id, limit))
        return [dict(row) for row in await cursor.fetchall()]


async def log_social_event(user_id: int, event_type: str, content: str):
    t = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO social_events (user_id, event_type, content, timestamp) VALUES (?, ?, ?, ?)',
                         (user_id, event_type, content, t))
        await db.commit()


async def get_friends_social_feed(user_id: int, limit: int = 50):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT e.*, u.name, u.username, u.level \
               FROM social_events e \
                        JOIN users u ON e.user_id = u.user_id
               WHERE e.user_id IN (SELECT user_id_2 FROM friends WHERE user_id_1 = ? AND status = 'accepted')
                  OR e.user_id IN (SELECT user_id_1 FROM friends WHERE user_id_2 = ? AND status = 'accepted')
                  OR e.user_id = ?
               ORDER BY e.id DESC LIMIT ?'''
        cursor = await db.execute(q, (user_id, user_id, user_id, limit))
        return [dict(row) for row in await cursor.fetchall()]


# =========================================================
# ТЕПЛОВА МАПА ТА АНАЛІТИКА (ФАЗА 3)
# =========================================================

async def get_user_heatmap_data(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT date (date) as day, COUNT (*) as sets, SUM (weight * reps) as volume
               FROM workout_logs \
               WHERE user_id = ? \
               GROUP BY day \
               ORDER BY day ASC'''
        cursor = await db.execute(q, (user_id,))
        return [dict(row) for row in await cursor.fetchall()]


async def get_all_users_metrics_for_rarity():
    """Для розрахунку рідкості досягнень"""
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        total_cursor = await db.execute('SELECT COUNT(*) FROM users')
        total_users = (await total_cursor.fetchone())[0] or 1

        users = [dict(r) for r in await (await db.execute('SELECT level, longest_streak FROM users')).fetchall()]
        workouts = [dict(r) for r in await (await db.execute(
            'SELECT user_id, COUNT(DISTINCT date(date)) as w, COUNT(*) as s, SUM(weight * reps) as v FROM workout_logs GROUP BY user_id')).fetchall()]
        meals = [dict(r) for r in await (
            await db.execute('SELECT user_id, COUNT(*) as m FROM nutrition_logs GROUP BY user_id')).fetchall()]
        checkins = [dict(r) for r in await (
            await db.execute('SELECT user_id, COUNT(*) as ch FROM daily_checkins GROUP BY user_id')).fetchall()]

        return {"total": total_users, "users": users, "workouts": workouts, "meals": meals, "checkins": checkins}


# =========================================================
# УЛЮБЛЕНІ СТРАВИ (ФАЗА 2)
# =========================================================

async def save_favorite_meal(user_id: int, dish_name: str, calories: int, protein: int, fats: int, carbs: int,
                             weight_g: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute(
            'INSERT INTO favorite_meals (user_id, dish_name, calories, protein, fats, carbs, weight_g) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (user_id, dish_name, calories, protein, fats, carbs, weight_g))
        await db.commit()


async def get_favorite_meals(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT * FROM favorite_meals WHERE user_id = ? ORDER BY id DESC', (user_id,))
        return [dict(row) for row in await cursor.fetchall()]


async def delete_favorite_meal(meal_id: int, user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('DELETE FROM favorite_meals WHERE id = ? AND user_id = ?', (meal_id, user_id))
        await db.commit()


# =========================================================
# ШАБЛОНИ ТРЕНЕРА (ФАЗА 4)
# =========================================================

async def save_trainer_template(trainer_id: int, template_name: str, plan_data: dict):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO trainer_templates (trainer_id, template_name, plan_data) VALUES (?, ?, ?)',
                         (trainer_id, template_name, json.dumps(plan_data)))
        await db.commit()


async def get_trainer_templates(trainer_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            'SELECT id, template_name, plan_data FROM trainer_templates WHERE trainer_id = ? ORDER BY id DESC',
            (trainer_id,))
        return [dict(row) for row in await cursor.fetchall()]


async def delete_trainer_template(template_id: int, trainer_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('DELETE FROM trainer_templates WHERE id = ? AND trainer_id = ?', (template_id, trainer_id))
        await db.commit()


# =========================================================
# СТАРІ СТАБІЛЬНІ ФУНКЦІЇ З ОРИГІНАЛЬНОГО РЕПОЗИТОРІЮ
# (З додаванням логіки Квестів туди, де потрібно)
# =========================================================

async def check_and_update_streak(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('BEGIN EXCLUSIVE')
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            'SELECT current_streak, longest_streak, last_streak_date, streak_freezes FROM users WHERE user_id = ?',
            (user_id,))
        user = await cursor.fetchone()

        if not user: 
            await db.commit()
            return
        last_date = user['last_streak_date']
        if last_date == today: 
            await db.commit()
            return

        current_streak = user['current_streak']
        longest_streak = user['longest_streak']
        streak_freezes = user['streak_freezes']

        if last_date:
            last_d = datetime.strptime(last_date, "%Y-%m-%d").date()
            today_d = datetime.now().date()
            diff = (today_d - last_d).days

            if diff == 1:
                current_streak += 1
            elif diff > 1:
                missed_days = diff - 1
                if streak_freezes >= missed_days:
                    streak_freezes -= missed_days
                    current_streak += 1
                    await db.execute('UPDATE users SET streak_freezes = ? WHERE user_id = ?', (streak_freezes, user_id))
                else:
                    current_streak = 1
        else:
            current_streak = 1

        if current_streak > longest_streak:
            longest_streak = current_streak

        await db.execute(
            'UPDATE users SET current_streak = ?, longest_streak = ?, last_streak_date = ? WHERE user_id = ?',
            (current_streak, longest_streak, today, user_id))
        await db.commit()


async def get_global_leaderboard(limit: int = 100):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('''SELECT user_id, name, username, level, exp, current_streak, role, avatar_url
                                 FROM users
                                 ORDER BY exp DESC LIMIT ?''', (limit,)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]


async def get_team_leaderboard(trainer_id: int, limit: int = 100):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('''SELECT user_id, name, username, level, exp, current_streak, role, avatar_url
                                 FROM users
                                 WHERE trainer_id = ?
                                    OR user_id = ?
                                 ORDER BY exp DESC LIMIT ?''', (trainer_id, trainer_id, limit)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]


async def buy_streak_freeze(user_id: int, cost: int = 500):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT exp FROM users WHERE user_id = ?', (user_id,))
        row = await cursor.fetchone()

        if not row or row['exp'] < cost:
            return False

        await db.execute('UPDATE users SET exp = exp - ?, streak_freezes = streak_freezes + 1 WHERE user_id = ?',
                         (cost, user_id))
        await db.commit()
        return True


async def create_duel(initiator_id: int, opponent_id: int, bet_exp: int, duel_type: str, days: int):
    start_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute(
            '''INSERT INTO duels (initiator_id, opponent_id, status, bet_exp, duel_type, start_date, end_date)
               VALUES (?, ?, 'pending', ?, ?, ?, ?)''', (initiator_id, opponent_id, bet_exp, duel_type, start_date, end_date))
        duel_id = cursor.lastrowid
        await db.commit()
        return duel_id

async def check_existing_duel(u1: int, u2: int, d_type: str):
    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute("SELECT id FROM duels WHERE duel_type = ? AND status IN ('pending', 'active') AND ((initiator_id = ? AND opponent_id = ?) OR (initiator_id = ? AND opponent_id = ?))", (d_type, u1, u2, u2, u1))
        return bool(await cursor.fetchone())

async def refund_duel_bet(duel_id: int):
    duel = await get_duel(duel_id)
    if duel and duel['status'] == 'pending':
        async with aiosqlite.connect(DB_NAME) as db:
            await db.execute("UPDATE users SET exp = exp + ? WHERE user_id = ?", (duel['bet_exp'], duel['initiator_id']))
            await db.execute("UPDATE duels SET status = 'rejected' WHERE id = ?", (duel_id,))
            await db.commit()
        return True
    return False

async def get_duel(duel_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM duels WHERE id = ?', (duel_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def get_user_duels(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT d.*, u1.name as initiator_name, u2.name as opponent_name
               FROM duels d
                        LEFT JOIN users u1 ON d.initiator_id = u1.user_id
                        LEFT JOIN users u2 ON d.opponent_id = u2.user_id
               WHERE d.initiator_id = ? OR d.opponent_id = ? ORDER BY d.id DESC'''
        cursor = await db.execute(q, (user_id, user_id))
        return [dict(row) for row in await cursor.fetchall()]

async def get_all_system_stats():
    async with aiosqlite.connect(DB_NAME) as db:
        total_users = (await (await db.execute('SELECT COUNT(*) FROM users')).fetchone())[0]
        total_trainers = (await (await db.execute('SELECT COUNT(*) FROM users WHERE role="trainer"')).fetchone())[0]
        total_clients = (await (await db.execute('SELECT COUNT(*) FROM users WHERE role="client" OR role IS NULL')).fetchone())[0]
        total_plans = (await (await db.execute('SELECT COUNT(*) FROM users WHERE workout_plan IS NOT NULL AND workout_plan != ""')).fetchone())[0]
        total_time = (await (await db.execute('SELECT SUM(total_time_spent) FROM users')).fetchone())[0] or 0
        return { "total_users": total_users, "total_trainers": total_trainers, "total_clients": total_clients, "total_plans": total_plans, "total_time_hours": round(total_time / 60, 1) }

async def get_all_users_admin():
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT user_id, username, name, role, trainer_id, primary_goal, total_time_spent, last_active_date, level FROM users ORDER BY last_active_date DESC') as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def update_user_activity(user_id: int, username: str = "", lang: str = None):
    today = datetime.now().strftime("%Y-%m-%d %H:%M")
    async with aiosqlite.connect(DB_NAME) as db:
        if lang:
            await db.execute('''UPDATE users SET total_time_spent = total_time_spent + 1, last_active_date = ?, username = CASE WHEN ? != "" THEN ? ELSE username END, language = ? WHERE user_id = ?''', (today, username, username, lang, user_id))
        else:
            await db.execute('''UPDATE users SET total_time_spent = total_time_spent + 1, last_active_date = ?, username = CASE WHEN ? != "" THEN ? ELSE username END WHERE user_id = ?''', (today, username, username, user_id))
        await db.commit()

async def set_user_role(user_id: int, role: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO users (user_id, role) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET role = ?', (user_id, role, role))
        await db.commit()

async def link_client_to_trainer(client_id: int, trainer_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        # ПЕРЕВІРКА ЛІМІТІВ ТРЕНЕРА
        cursor = await db.execute('SELECT subscription_tier FROM users WHERE user_id = ?', (trainer_id,))
        trainer_row = await cursor.fetchone()
        if not trainer_row: return False
        
        tier = trainer_row[0]
        # Якщо тренер не має підписки — не даємо додавати клієнтів
        if tier not in ["COACH_BASIC", "COACH_PRO"]:
            return False
            
        # ПЕРЕВІРКА ЛІМІТІВ
        cursor = await db.execute('SELECT COUNT(*) FROM users WHERE trainer_id = ?', (trainer_id,))
        count = (await cursor.fetchone())[0]

        if tier == "COACH_BASIC" and count >= 15:
            return False
        
        if tier == "COACH_PRO" and count >= 200: # М'який ліміт для Pro Coach
            return False

        await db.execute('INSERT INTO users (user_id, role, trainer_id) VALUES (?, "client", ?) ON CONFLICT(user_id) DO UPDATE SET trainer_id = ?, role = CASE WHEN role != "trainer" THEN "client" ELSE role END', (client_id, trainer_id, trainer_id))
        await db.commit()
    return True

async def get_trainer_clients(trainer_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT user_id, name, level, exp, primary_goal FROM users WHERE trainer_id = ? AND (role = "client" OR role IS NULL)', (trainer_id,)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def check_user_role(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT role, trainer_id FROM users WHERE user_id = ?', (user_id,)) as cursor:
            row = await cursor.fetchone()
            if row: return {"role": row[0], "trainer_id": row[1]}
            return {"role": "client", "trainer_id": None}

async def update_user_avatar(user_id: int, avatar_url: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET avatar_url = ? WHERE user_id = ?', (avatar_url, user_id))
        await db.commit()

# --- ІСТОРІЯ ВАГИ ---

async def add_weight_entry(user_id: int, weight: float, log_date: str = None):
    # Use provided date or default to today
    date_to_log = log_date or datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('DELETE FROM weight_history WHERE user_id = ? AND log_date = ?', (user_id, date_to_log))
        await db.execute('INSERT INTO weight_history (user_id, weight_kg, log_date) VALUES (?, ?, ?)',
                         (user_id, weight, date_to_log))
        # Оновлюємо також вагу в профілі користувача
        await db.execute('UPDATE users SET weight = ? WHERE user_id = ?', (weight, user_id))
        await db.commit()

async def get_weight_history(user_id: int, days: int = 30):
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('''SELECT weight_kg as weight, log_date as date 
                                     FROM weight_history 
                                     WHERE user_id = ? AND log_date >= ? 
                                     ORDER BY log_date ASC''', (user_id, start_date))
        return [dict(row) for row in await cursor.fetchall()]

# --- СИЛОВІ РЕКОРДИ (1RM) ---

async def save_1rm_record(user_id: int, exercise_name: str, weight_1rm: float):
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO strength_records (user_id, exercise_name, weight_1rm, log_date) VALUES (?, ?, ?, ?)',
                         (user_id, exercise_name, weight_1rm, today))
        await db.commit()

async def get_1rm_records(user_id: int, exercise_name: str, days: int = 180):
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('''SELECT weight_1rm, log_date as date
                                     FROM strength_records
                                     WHERE user_id = ? AND exercise_name = ? AND log_date >= ?
                                     ORDER BY log_date ASC''', (user_id, exercise_name, start_date))
        return [dict(row) for row in await cursor.fetchall()]

async def get_unique_1rm_exercises(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute('''SELECT DISTINCT exercise_name FROM strength_records WHERE user_id = ?''', (user_id,))
        rows = await cursor.fetchall()
        return [r[0] for r in rows]


async def update_food_prefs(user_id: int, prefs: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET food_preferences = ? WHERE user_id = ?', (prefs, user_id))
        await db.commit()

async def update_nutrition_plan(user_id: int, plan: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET nutrition_plan = ? WHERE user_id = ?', (plan, user_id))
        await db.commit()

async def save_user(user_id, raw_data, ai_data, nutrition_goals):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO users (user_id, name, gender, age, height, weight, target_weight, activity_level, primary_goal, custom_goal, notes, ai_risk_factors, ai_exercise_restrictions, ai_focus_areas, nutrition_goals, competition_sport, competition_date, cycle_start_date, cycle_length, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, gender=excluded.gender, age=excluded.age, height=excluded.height, weight=excluded.weight, target_weight=excluded.target_weight, activity_level=excluded.activity_level, primary_goal=excluded.primary_goal, custom_goal=excluded.custom_goal, notes=excluded.notes, nutrition_goals=excluded.nutrition_goals, ai_risk_factors=excluded.ai_risk_factors, ai_exercise_restrictions=excluded.ai_exercise_restrictions, ai_focus_areas=excluded.ai_focus_areas, competition_sport=excluded.competition_sport, competition_date=excluded.competition_date, cycle_start_date=excluded.cycle_start_date, cycle_length=excluded.cycle_length, language=excluded.language''',
                         (user_id, raw_data.get('name', 'Атлет'), raw_data.get('gender', 'male'), int(raw_data.get('age', 25)), int(raw_data.get('height', 170)), float(raw_data.get('weight', 70.0)), float(raw_data.get('target_weight', 70.0)), raw_data.get('activity_level', 'medium'), raw_data.get('primary_goal', 'maintain'), raw_data.get('custom_goal', ''), raw_data.get('notes', ''), json.dumps(ai_data.get('risk_factors', [])), json.dumps(ai_data.get('exercise_restrictions', [])), json.dumps(ai_data.get('focus_areas', [])), json.dumps(nutrition_goals), raw_data.get('competition_sport', ''), raw_data.get('competition_date', ''), raw_data.get('cycle_start_date', ''), raw_data.get('cycle_length', 28), raw_data.get('language', 'uk')))
        await db.commit()
        
    # Додаємо запис через нову таблицю weight_history
    today = datetime.now().strftime("%Y-%m-%d")
    await add_weight_entry(user_id, float(raw_data.get('weight', 70.0)), today)

async def update_user_profile_only(user_id, update_data, new_macros):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''UPDATE users SET name=?, age=?, height=?, weight=?, target_weight=?, activity_level=?, primary_goal=?, nutrition_goals=?, competition_sport=?, competition_date=?, cycle_start_date=?, cycle_length=?, language=? WHERE user_id = ?''',
                         (update_data.get('name'), int(update_data.get('age')), int(update_data.get('height')), float(update_data.get('weight')), float(update_data.get('target_weight')), update_data.get('activity_level'), update_data.get('primary_goal'), json.dumps(new_macros), update_data.get('competition_sport', ''), update_data.get('competition_date', ''), update_data.get('cycle_start_date', ''), update_data.get('cycle_length', 28), update_data.get('language', 'uk'), user_id))
        await db.commit()
        
    # Додаємо запис через нову таблицю weight_history
    today = datetime.now().strftime("%Y-%m-%d")
    await add_weight_entry(user_id, float(update_data.get('weight')), today)

async def update_user_ai_factors(user_id, ai_data):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''UPDATE users SET ai_risk_factors=?, ai_exercise_restrictions=?, ai_focus_areas=? WHERE user_id = ?''', (json.dumps(ai_data.get('risk_factors', [])), json.dumps(ai_data.get('exercise_restrictions', [])), json.dumps(ai_data.get('focus_areas', [])), user_id))
        await db.commit()

async def get_user(user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def save_plan(user_id, plan_data):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET workout_plan = ? WHERE user_id = ?', (json.dumps(plan_data), user_id))
        await db.commit()

async def log_workout_set(user_id, exercise_name, set_number, weight, reps, exercise_type='strength', duration=0, distance=0.0, plan_day=''):
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    today = datetime.now().strftime("%Y-%m-%d")

    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO workout_logs (user_id, date, exercise_name, set_number, weight, reps, exercise_type, duration, distance, plan_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (user_id, date_str, exercise_name, set_number, weight, reps, exercise_type, duration, distance, plan_day))
        await db.execute('UPDATE users SET exp = exp + 10 WHERE user_id = ?', (user_id,))

        # Оновлення квестів
        await _update_quest(db, user_id, today, 'sets', 1)
        await _update_quest(db, user_id, today, 'volume', weight * reps)

        await db.commit()
    await check_and_update_streak(user_id)

async def get_today_completed_sets(user_id: int, date_prefix: str):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT exercise_name, plan_day, COUNT(*) as sets_completed FROM workout_logs WHERE user_id = ? AND date LIKE ? GROUP BY exercise_name, plan_day', (user_id, f"{date_prefix}%")) as cursor:
            rows = await cursor.fetchall()
            return {f"{row['plan_day']}_{row['exercise_name']}": row['sets_completed'] for row in rows}

async def get_today_workout_logs(user_id: int, date_prefix: str):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM workout_logs WHERE user_id = ? AND date LIKE ? ORDER BY date ASC', (user_id, f"{date_prefix}%")) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def save_daily_checkin(user_id: int, date: str, sleep: int, energy: int, stress: int, soreness: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO daily_checkins (user_id, date, sleep, energy, stress, soreness) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET sleep=excluded.sleep, energy=excluded.energy, stress=excluded.stress, soreness=excluded.soreness', (user_id, date, sleep, energy, stress, soreness))
        await db.execute('UPDATE users SET exp = exp + 5 WHERE user_id = ?', (user_id,))

        # Оновлення квесту
        await _update_quest(db, user_id, date, 'checkin', 1)

        await db.commit()
    await check_and_update_streak(user_id)

async def get_daily_checkin(user_id: int, date: str):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?', (user_id, date)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def save_adapted_plan(user_id: int, date: str, adapted_plan: dict):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE daily_checkins SET adapted_plan = ? WHERE user_id = ? AND date = ?', (json.dumps(adapted_plan), user_id, date))
        await db.commit()

async def log_nutrition(user_id, date, calories, protein, fats, carbs, dish_name="Запис вручну", weight_g=0):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('INSERT INTO nutrition_logs (user_id, date, dish_name, calories, protein, fats, carbs, weight_g) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (user_id, date, dish_name, calories, protein, fats, carbs, weight_g))
        await db.execute('UPDATE users SET exp = exp + 5 WHERE user_id = ?', (user_id,))

        # Оновлення квесту
        await _update_quest(db, user_id, date, 'meals', 1)

        await db.commit()
    await check_and_update_streak(user_id)

async def update_nutrition_log(log_id, calories, protein, fats, carbs, dish_name=None, weight_g=0):
    async with aiosqlite.connect(DB_NAME) as db:
        if dish_name:
            await db.execute('UPDATE nutrition_logs SET dish_name = ?, calories = ?, protein = ?, fats = ?, carbs = ?, weight_g = ? WHERE id = ?', (dish_name, calories, protein, fats, carbs, weight_g, log_id))
        else:
            await db.execute('UPDATE nutrition_logs SET calories = ?, protein = ?, fats = ?, carbs = ?, weight_g = ? WHERE id = ?', (calories, protein, fats, carbs, weight_g, log_id))
        await db.commit()

async def get_today_nutrition(user_id, date):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT SUM(calories) as cals, SUM(protein) as prot, SUM(fats) as fat, SUM(carbs) as carb FROM nutrition_logs WHERE user_id = ? AND date = ?', (user_id, date)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row and row['cals'] is not None else {"cals": 0, "prot": 0, "fat": 0, "carb": 0}

async def get_today_nutrition_logs(user_id, date):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT id, dish_name, calories, protein, fats, carbs, weight_g FROM nutrition_logs WHERE user_id = ? AND date = ? ORDER BY id DESC', (user_id, date)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def delete_nutrition_log(log_id, user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', (log_id, user_id))
        await db.commit()

async def log_water(user_id: int, date: str, amount: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO water_logs (user_id, date, amount) VALUES (?, ?, MAX(0, ?)) ON CONFLICT(user_id, date) DO UPDATE SET amount = MAX(0, amount + ?)''', (user_id, date, amount, amount))

        # Оновлення квесту
        await _update_quest(db, user_id, date, 'water', amount)

        await db.commit()

async def get_today_water(user_id: int, date: str) -> int:
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT amount FROM water_logs WHERE user_id = ? AND date = ?', (user_id, date)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

async def log_body_metrics(user_id: int, date: str, waist: float, hips: float, chest: float, biceps: float):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO body_metrics (user_id, date, waist, hips, chest, biceps) VALUES (?, ?, ?, ?, ?, ?)''', (user_id, date, waist, hips, chest, biceps))
        await db.commit()

async def get_body_metrics_history(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT date, waist, hips, chest, biceps FROM body_metrics WHERE user_id = ? ORDER BY date ASC', (user_id,)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def get_muscle_fatigue_state(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT muscle, fatigue_level, last_updated FROM muscle_fatigue WHERE user_id = ?', (user_id,)) as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def update_muscle_fatigue_state(user_id: int, muscle: str, fatigue_level: float, update_time: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO muscle_fatigue (user_id, muscle, fatigue_level, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, muscle) DO UPDATE SET fatigue_level = ?, last_updated = ?''', (user_id, muscle, fatigue_level, update_time, fatigue_level, update_time))
        await db.commit()

async def get_progress_data(user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        # Unified: fetch from weight_history instead of weight_logs
        cursor = await db.execute('SELECT log_date as date, weight_kg as weight FROM weight_history WHERE user_id = ? ORDER BY log_date ASC', (user_id,))
        weight_history = [dict(row) for row in await cursor.fetchall()]

        exercise_history = {}
        async with db.execute('SELECT date(date) as log_date, exercise_name, MAX(weight) as max_weight FROM workout_logs WHERE user_id = ? GROUP BY date(date), exercise_name ORDER BY log_date ASC', (user_id,)) as cursor:
            async for row in cursor:
                ex_name = row['exercise_name']
                if ex_name not in exercise_history: exercise_history[ex_name] = []
                exercise_history[ex_name].append({"date": row['log_date'], "weight": row['max_weight']})

        body_metrics_history = await get_body_metrics_history(user_id)
        return { "body_weight": weight_history, "exercises": exercise_history, "body_metrics": body_metrics_history }

async def get_user_stats(user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        c = await db.execute('SELECT COUNT(DISTINCT date(date)) FROM workout_logs WHERE user_id = ?', (user_id,))
        w = (await c.fetchone())[0] or 0
        c = await db.execute('SELECT COUNT(*) FROM workout_logs WHERE user_id = ?', (user_id,))
        s = (await c.fetchone())[0] or 0
        c = await db.execute('SELECT SUM(weight * reps) FROM workout_logs WHERE user_id = ?', (user_id,))
        v = (await c.fetchone())[0] or 0
        c = await db.execute('SELECT COUNT(*) FROM nutrition_logs WHERE user_id = ?', (user_id,))
        m = (await c.fetchone())[0] or 0
        c = await db.execute('SELECT COUNT(*) FROM daily_checkins WHERE user_id = ?', (user_id,))
        ch = (await c.fetchone())[0] or 0
        return {"workouts": w, "sets": s, "volume": int(v), "meals": m, "checkins": ch}

async def get_exercise_info(name: str):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM exercise_library WHERE name = ?', (name.strip().lower(),)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def save_exercise_info(name: str, muscles: str, instruction: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT OR REPLACE INTO exercise_library (name, muscles, instruction) VALUES (?, ?, ?)''', (name.strip().lower(), muscles, instruction))
        await db.commit()

async def get_all_users_for_notifications():
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT user_id, name, workout_plan, nutrition_goals, language FROM users WHERE (role="client" OR role IS NULL) AND workout_plan IS NOT NULL AND workout_plan != ""') as cursor:
            return [dict(row) for row in await cursor.fetchall()]

async def get_user_daily_summary(user_id: int, date: str):
    async with aiosqlite.connect(DB_NAME) as db:
        c1 = await db.execute('SELECT COUNT(*) FROM daily_checkins WHERE user_id = ? AND date = ?', (user_id, date))
        has_checkin = (await c1.fetchone())[0] > 0

        c2 = await db.execute('SELECT amount FROM water_logs WHERE user_id = ? AND date = ?', (user_id, date))
        w_row = await c2.fetchone()
        water_ml = w_row[0] if w_row else 0

        c3 = await db.execute('SELECT COUNT(*) FROM workout_logs WHERE user_id = ? AND date LIKE ?', (user_id, f"{date}%"))
        workout_sets = (await c3.fetchone())[0]

        c4 = await db.execute('SELECT COUNT(*) FROM nutrition_logs WHERE user_id = ? AND date = ?', (user_id, date))
        meals_logged = (await c4.fetchone())[0]

        return { "has_checkin": has_checkin, "water_ml": water_ml, "workout_sets": workout_sets, "meals_logged": meals_logged }

# =========================================================
# FEMTECH ТА ЖІНОЧИЙ ЦИКЛ (ФАЗА 1)
# =========================================================

async def update_cycle_start(user_id: int, start_date: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("UPDATE users SET cycle_start_date = ? WHERE user_id = ?", (start_date, user_id))
        await db.commit()

async def save_cycle_history(user_id: int, start_date: str, end_date: str, cycle_length: int, period_length: int):
    """Зберігає завершений цикл в історію для графіків."""
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO cycle_history (user_id, start_date, end_date, cycle_length, period_length) 
                            VALUES (?, ?, ?, ?, ?)''',
                         (user_id, start_date, end_date, cycle_length, period_length))
        await db.commit()

async def get_cycle_history(user_id: int, limit: int = 12):
    """Повертає історію останніх N циклів користувачки."""
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('''SELECT * FROM cycle_history 
                                     WHERE user_id = ? 
                                     ORDER BY start_date DESC LIMIT ?''', (user_id, limit))
        return [dict(row) for row in await cursor.fetchall()]

async def save_cycle_symptoms(user_id: int, date: str, flow_level: str, pain_level: int, mood: str, sleep: str, digestion: str, physical: str, libido: str, sexual_activity: str, notes: str):
    """Зберігає розширені симптоми (сон, травлення, настрій тощо) за конкретний день."""
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''INSERT INTO cycle_symptoms 
                            (user_id, date, flow_level, pain_level, mood, sleep, digestion, physical, libido, sexual_activity, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(user_id, date) DO UPDATE SET
                            flow_level=excluded.flow_level, pain_level=excluded.pain_level, mood=excluded.mood,
                            sleep=excluded.sleep, digestion=excluded.digestion, physical=excluded.physical, 
                            libido=excluded.libido, sexual_activity=excluded.sexual_activity, notes=excluded.notes''',
                         (user_id, date, flow_level, pain_level, mood, sleep, digestion, physical, libido, sexual_activity, notes))
        await db.commit()

async def get_cycle_symptoms_range(user_id: int, start_date: str, end_date: str):
    """Отримує масив симптомів для відображення їх на календарі (червоні крапки)."""
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('''SELECT * FROM cycle_symptoms \r
                                     WHERE user_id = ? AND date >= ? AND date <= ? \r
                                     ORDER BY date ASC''', (user_id, start_date, end_date))
        return [dict(row) for row in await cursor.fetchall()]

async def get_cycle_symptoms_by_date(user_id: int, date: str):
    """Отримує всі симптоми за один конкретний день."""
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute('SELECT * FROM cycle_symptoms WHERE user_id = ? AND date = ?', (user_id, date))
        row = await cursor.fetchone()
        return dict(row) if row else None

# =========================================================
# ПІДПИСКИ ТА ЛІМІТИ (ФАЗА 5)
# =========================================================

async def check_and_increment_usage(user_id: int, feature_key: str, max_limit: int, period: str = "daily") -> bool:
    """
    Перевіряє ліміти на ШІ-функції та збільшує лічильник використання.
    period: "daily" або "monthly"
    """
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d") if period == "daily" else now.strftime("%Y-%m")
    full_key = f"{feature_key}_{date_str}"

    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute('SELECT daily_feature_usage FROM users WHERE user_id = ?', (user_id,))
        row = await cursor.fetchone()
        if not row:
            return False

        usage_data = json.loads(row[0] or "{}")
        current_usage = usage_data.get(full_key, 0)

        if current_usage >= max_limit:
            return False  # Ліміт вичерпано

        usage_data[full_key] = current_usage + 1
        
        # Очищення старих ключів для економії місця (залишаємо тільки поточний місяць/день)
        keys_to_delete = [k for k in usage_data.keys() if k.startswith(feature_key) and k != full_key]
        for k in keys_to_delete:
            del usage_data[k]

        await db.execute('UPDATE users SET daily_feature_usage = ? WHERE user_id = ?', (json.dumps(usage_data), user_id))
        await db.commit()
        return True

# --- СІМЕЙНА ЛОГІКА (ФАЗА 6) ---

async def create_family_group(owner_id: int):
    """Створює нову сімейну групу та додає власника."""
    async with aiosqlite.connect(DB_NAME) as db:
        # Створюємо групу
        cursor = await db.execute('INSERT OR IGNORE INTO family_groups (owner_id) VALUES (?)', (owner_id,))
        if cursor.rowcount == 0:
            # Група вже існує, знайдемо її ID
            cursor = await db.execute('SELECT id FROM family_groups WHERE owner_id = ?', (owner_id,))
            row = await cursor.fetchone()
            family_id = row[0]
        else:
            family_id = cursor.lastrowid
        
        # Додаємо власника як першого члена
        await db.execute('INSERT OR IGNORE INTO family_members (family_id, user_id) VALUES (?, ?)', (family_id, owner_id))
        await db.execute('UPDATE users SET subscription_tier = "FAMILY" WHERE user_id = ?', (owner_id,))
        await db.commit()
        return family_id

async def generate_family_invite(user_id: int):
    """Генерує токен для запрошення в сім'ю."""
    async with aiosqlite.connect(DB_NAME) as db:
        # Знаходимо family_id користувача
        cursor = await db.execute('SELECT family_id FROM family_members WHERE user_id = ?', (user_id,))
        row = await cursor.fetchone()
        if not row: return None
        family_id = row[0]

        import secrets
        token = secrets.token_urlsafe(16)
        await db.execute('INSERT INTO family_invites (token, family_id) VALUES (?, ?)', (token, family_id))
        await db.commit()
        return token

async def join_family_by_token(user_id: int, token: str):
    """Приєднує користувача до сім'ї за токеном."""
    async with aiosqlite.connect(DB_NAME) as db:
        # Перевіряємо токен
        cursor = await db.execute('SELECT family_id FROM family_invites WHERE token = ?', (token,))
        row = await cursor.fetchone()
        if not row: return False, "invalid_token"
        family_id = row[0]

        # Перевіряємо кількість членів (ліміт 4)
        cursor = await db.execute('SELECT COUNT(*) FROM family_members WHERE family_id = ?', (family_id,))
        count_row = await cursor.fetchone()
        if count_row[0] >= 4:
            return False, "family_full"

        # Приєднуємо
        await db.execute('INSERT OR IGNORE INTO family_members (family_id, user_id) VALUES (?, ?)', (family_id, user_id))
        await db.execute('UPDATE users SET subscription_tier = "FAMILY" WHERE user_id = ?', (user_id,))
        # Видаляємо використаний токен
        await db.execute('DELETE FROM family_invites WHERE token = ?', (token,))
        await db.commit()
        return True, "success"

async def get_family_members(user_id: int):
    """Повертає список усіх членів сім'ї користувача."""
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        q = '''SELECT u.user_id, u.name, u.level, u.exp, u.avatar_url, 
                      (SELECT owner_id FROM family_groups WHERE id = m.family_id) as owner_id
               FROM family_members m
               JOIN users u ON m.user_id = u.user_id
               WHERE m.family_id = (SELECT family_id FROM family_members WHERE user_id = ?)'''
        cursor = await db.execute(q, (user_id,))
        return [dict(row) for row in await cursor.fetchall()]

async def get_family_leaderboard(user_id: int):
    """Рейтинг всередині сім'ї."""
    members = await get_family_members(user_id)
    return sorted(members, key=lambda x: x['exp'], reverse=True)

async def upgrade_subscription(user_id: int, new_tier: str, new_role: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET subscription_tier = ?, role = ? WHERE user_id = ?', (new_tier, new_role, user_id))
        await db.commit()