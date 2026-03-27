from fastapi import FastAPI, Request, HTTPException, File, Form, UploadFile, Header, Depends
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
import uvicorn
import json
import math
import random
from datetime import datetime, timedelta
import asyncio
import urllib.request
import aiosqlite
import hmac
import hashlib
from urllib.parse import parse_qsl
import logging
import traceback
import time
import os
import uuid
import base64
import aiohttp

import ai_service
import database
import config


class ShareImageRequest(BaseModel):
    user_id: int
    image_base64: str
    caption: Optional[str] = None


# --- АВТОМАТИЧНА МІГРАЦІЯ ТА ІНІЦІАЛІЗАЦІЯ БАЗИ ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.init_db()
    yield


app = FastAPI(lifespan=lifespan)

# Підключаємо роздачу статичних файлів та HTML-шаблонів
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

ADMIN_ID = 1100202114
last_ping_cache = {}
rarity_cache = {"timestamp": 0, "data": {}}


# =========================================================
# ГЛОБАЛЬНА СИСТЕМА ЛОГУВАННЯ ПОМИЛОК
# =========================================================

class ClientErrorLog(BaseModel):
    user_id: Optional[int] = None
    error_msg: str
    url: str
    line: Optional[int] = None
    col: Optional[int] = None
    stack: Optional[str] = None


@app.post("/api/log_client_error")
async def log_client_error(err: ClientErrorLog):
    logging.error(f"❌ ФРОНТЕНД ПОМИЛКА (User: {err.user_id}):\n"
                  f"Повідомлення: {err.error_msg}\n"
                  f"Файл: {err.url} (Рядок {err.line})\n"
                  f"Стек:\n{err.stack}")
    return {"status": "success"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    err_msg = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    logging.error(f"🚨 БЕКЕНД ПОМИЛКА 500 [{request.method} {request.url}]:\n{err_msg}")
    return JSONResponse(status_code=500, content={"status": "error", "message": "Внутрішня помилка сервера"})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error(f"⚠️ ПОМИЛКА ВАЛІДАЦІЇ 422 [{request.method} {request.url}]:\nДеталі: {exc.errors()}")
    return JSONResponse(status_code=422,
                        content={"status": "error", "message": "Помилка валідації даних", "details": exc.errors()})


# --- ТЕЛЕГРАМ УТИЛІТИ ---

def verify_tg_init_data(init_data: str) -> bool:
    if not init_data: return False
    try:
        parsed_data = dict(parse_qsl(init_data))
        if 'hash' not in parsed_data: return False
        received_hash = parsed_data.pop('hash')
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        secret_key = hmac.new(b"WebAppData", config.BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        return calculated_hash == received_hash
    except Exception:
        return False

@app.middleware("http")
async def verify_tg_auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in ["/api/ping", "/api/log_client_error"]:
        init_data = request.headers.get("X-Telegram-Init-Data")
        if not init_data or not verify_tg_init_data(init_data):
            return JSONResponse(status_code=403, content={"status": "error", "message": "Invalid Telegram Init Data"})
    return await call_next(request)

def get_current_user(x_telegram_init_data: str = Header(None)) -> int:
    if not verify_tg_init_data(x_telegram_init_data):
        raise HTTPException(status_code=403, detail="Invalid Init Data")
    uid = get_user_id_from_init_data(x_telegram_init_data)
    if not uid: raise HTTPException(status_code=403)
    return uid


def get_user_id_from_init_data(init_data: str) -> int:
    try:
        return json.loads(dict(parse_qsl(init_data)).get('user', '{}')).get('id', 0)
    except:
        return 0


def send_tg_message_sync(chat_id: int, text: str):
    url = f"https://api.telegram.org/bot{config.BOT_TOKEN}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logging.error(f"TG Push failed: {e}")


# =========================================================
# МОДЕЛІ ДАНИХ (Pydantic)
# =========================================================

class UserData(BaseModel):
    user_id: int
    name: str
    gender: str
    age: int
    height: int
    weight: float
    target_weight: float
    activity_level: str
    primary_goal: str
    custom_goal: Optional[str] = ""
    notes: Optional[str] = ""
    competition_sport: Optional[str] = ""
    competition_date: Optional[str] = ""
    cycle_start_date: Optional[str] = ""
    cycle_length: Optional[int] = 28
    language: Optional[str] = "uk"


class SetLog(BaseModel):
    user_id: int
    exercise_name: str
    set_number: int
    weight: float
    reps: int
    exercise_type: Optional[str] = "strength"
    duration: Optional[int] = 0
    distance: Optional[float] = 0.0
    plan_day: Optional[str] = ""


class NutritionEntry(BaseModel):
    user_id: int
    calories: int
    protein: int
    fats: int
    carbs: int
    dish_name: Optional[str] = "Запис вручну"
    weight_g: Optional[int] = 0


class FoodCorrectionRequest(BaseModel):
    user_id: int
    log_id: int
    current_data: Dict[str, Any]
    correction: str


class UpgradeTierRequest(BaseModel):
    user_id: int
    new_tier: str


class CompleteOnboardingRequest(BaseModel):
    user_id: int





class RecipeRequest(BaseModel):
    user_id: int
    ingredients: str


class CheckinData(BaseModel):
    user_id: int
    sleep: int
    energy: int
    stress: int
    soreness: int
    current_day_plan: Dict[str, Any]


class WorkoutPlanUpdate(BaseModel):
    user_id: int
    plan: Any


class AdaptedPlanUpdate(BaseModel):
    user_id: int
    plan: Dict[str, Any]


class FoodPrefs(BaseModel):
    user_id: int
    prefs: str


class NutritionPlanUpdate(BaseModel):
    user_id: int
    plan: str


class PingData(BaseModel):
    user_id: int
    username: Optional[str] = ""
    language: Optional[str] = "uk"


class ProfileUpdateText(BaseModel):
    user_id: int
    update_text: str


class WaterEntry(BaseModel):
    user_id: int
    amount: int


class BodyMetricsEntry(BaseModel):
    user_id: int
    waist: float
    hips: float
    chest: float
    biceps: float


class CyclePeriodEntry(BaseModel):
    user_id: int
    start_date: str
    end_date: Optional[str] = ""


class CycleSymptomEntry(BaseModel):
    user_id: int
    date: str
    flow_level: str
    pain_level: int
    mood: str
    sleep: Optional[str] = ""
    digestion: Optional[str] = ""
    physical: Optional[str] = ""
    libido: Optional[str] = ""
    sexual_activity: Optional[str] = ""
    notes: Optional[str] = ""


class CycleAdaptWorkoutRequest(BaseModel):
    user_id: int
    date: str
    symptoms: Dict[str, Any]
    cycle_day: int
    current_day_plan: Dict[str, Any]


class RegisterTrainerRequest(BaseModel):
    user_id: int


class BuyFreezeRequest(BaseModel):
    user_id: int


class CreateDuelRequest(BaseModel):
    initiator_id: int
    opponent_id: int
    bet_exp: int
    duel_type: str
    days: int

class ShareImageRequest(BaseModel):
    user_id: int
    image_base64: str
    caption: Optional[str] = "Мій результат у Fitness Hub Pro!"


class DuelActionRequest(BaseModel):
    user_id: int
    duel_id: int


class FavoriteMealRequest(BaseModel):
    user_id: int
    dish_name: str
    calories: int
    protein: int
    fats: int
    carbs: int
    weight_g: int


class SaveTemplateRequest(BaseModel):
    trainer_id: int
    template_name: str
    plan_data: Any


# --- НОВІ МОДЕЛІ V2.0 ---
class SubstituteExerciseRequest(BaseModel):
    user_id: int
    exercise_name: str


class SyncOfflineRequest(BaseModel):
    user_id: int
    workout_logs: Optional[List[SetLog]] = []
    nutrition_logs: Optional[List[NutritionEntry]] = []


class GroceryListRequest(BaseModel):
    user_id: int


class PrivacySettingsUpdate(BaseModel):
    user_id: int
    privacy_settings: Dict[str, Any]


class CoachCommentRequest(BaseModel):
    user_id: int
    trainer_id: int
    entity_type: str
    entity_id: str
    comment_text: str

class StrengthRecordEntry(BaseModel):
    user_id: int
    exercise_name: str
    weight_1rm: float

class StrengthPlanRequest(BaseModel):
    user_id: int
    exercise_name: str
    target_weight: float
    weeks: int

class GenerateAIReportRequest(BaseModel):
    user_id: int
    weight_chart_b64: Optional[str] = None
    strength_chart_b64: Optional[str] = None
    metrics_chart_b64: Optional[str] = None

# --- ДОПОМІЖНІ ФУНКЦІЇ ---


def calculate_macros(weight, height, age, gender, activity_level, primary_goal):
    if gender == 'male':
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161

    activity_multipliers = {'sedentary': 1.2, 'light': 1.375, 'medium': 1.55, 'active': 1.725, 'very_active': 1.9}
    tdee = bmr * activity_multipliers.get(activity_level, 1.2)

    if primary_goal == 'lose':
        target_cals = tdee - 500
        protein_per_kg = 2.2
    elif primary_goal in ['gain', 'strength', 'competition']:
        target_cals = tdee + 400
        protein_per_kg = 2.0
    elif primary_goal == 'endurance':
        target_cals = tdee + 200
        protein_per_kg = 1.6
    else:
        target_cals = tdee
        protein_per_kg = 1.8

    protein = weight * protein_per_kg
    fats = weight * 1.0
    carbs = max((target_cals - (protein * 4) - (fats * 9)) / 4, 50)

    return {
        "calories": int(target_cals),
        "protein": int(protein),
        "fats": int(fats),
        "carbs": int(carbs)
    }


def get_level_info(exp):
    level = int(math.floor(math.sqrt(exp / 100))) + 1
    current_level_base = (level - 1) ** 2 * 100
    next_level_base = level ** 2 * 100
    exp_progress = exp - current_level_base
    exp_needed = next_level_base - current_level_base
    return level, exp_progress, exp_needed


def safe_int(value):
    try:
        return int(float(value))
    except:
        return 0


def get_cycle_phase(user_dict):
    if not user_dict or user_dict.get('gender') != 'female': return ""
    start_date = user_dict.get('cycle_start_date')
    if not start_date: return ""

    try:
        length = user_dict.get('cycle_length') or 28
        start = datetime.strptime(start_date, "%Y-%m-%d")
        diff = (datetime.now() - start).days
        day = (diff % length) + 1

        if 1 <= day <= 5:
            return "menstruation"
        elif 6 <= day <= 13:
            return "follicular"
        elif 14 <= day <= 16:
            return "ovulation"
        else:
            return "luteal"
    except:
        return ""


# =========================================================
# РОУТИНГ СТОРІНОК
# =========================================================

@app.get("/favicon.ico", include_in_schema=False)
async def favicon(): return Response(content="", media_type="image/x-icon")


@app.get("/")
async def serve_app(request: Request): return templates.TemplateResponse("index.html", {"request": request})


@app.get("/trainer")
async def serve_trainer_app(request: Request, x_telegram_init_data: str = Header(None)):
    # Ми не можемо легко перевірити Header у звичайному GET запиті браузера (при завантаженні сторінки)
    # Тому перевірка буде відбуватися на фронтенді, а тут ми просто віддаємо шаблон.
    # Проте API ендпоінти нижче БУДУТЬ захищені жорстко.
    return templates.TemplateResponse("trainer.html", {"request": request})


@app.get("/admin")
async def serve_admin_app(request: Request): return templates.TemplateResponse("admin.html", {"request": request})


# =========================================================
# API ДЛЯ АДМІНІСТРАТОРА ТА АНАЛІТИКИ
# =========================================================

@app.post("/api/ping")
async def process_ping(data: PingData):
    now = datetime.now()
    if last_ping_cache.get(data.user_id) and (now - last_ping_cache[data.user_id]).total_seconds() < 50:
        return {"status": "success", "ignored": True}

    last_ping_cache[data.user_id] = now
    await database.update_user_activity(data.user_id, data.username, data.language)
    return {"status": "success"}


@app.get("/api/admin/stats")
async def get_admin_stats(x_telegram_init_data: str = Header(None)):
    if not verify_tg_init_data(x_telegram_init_data): raise HTTPException(status_code=403)
    user_id = get_user_id_from_init_data(x_telegram_init_data)
    if user_id != ADMIN_ID: raise HTTPException(status_code=403)
    stats = await database.get_all_system_stats()
    return {"status": "success", "data": stats}


@app.get("/api/admin/users")
async def get_admin_users(x_telegram_init_data: str = Header(None)):
    if not verify_tg_init_data(x_telegram_init_data): raise HTTPException(status_code=403)
    user_id = get_user_id_from_init_data(x_telegram_init_data)
    if user_id != ADMIN_ID: raise HTTPException(status_code=403)
    users = await database.get_all_users_admin()
    return {"status": "success", "data": users}


# =========================================================
# API ЕНДПОІНТИ: КОРИСТУВАЧ ТА ПРОФІЛЬ
# =========================================================

@app.get("/api/user/{user_id}")
async def get_user_endpoint(user_id: int, current_user: int = Depends(get_current_user)):
    if current_user != user_id and current_user != ADMIN_ID: raise HTTPException(status_code=403)

    user = await database.get_user(user_id)
    if not user: return {"status": "not_found"}

    role_info = await database.check_user_role(user_id)
    trainer_name = None
    trainer_username = None
    if role_info.get("trainer_id"):
        trainer_data = await database.get_user(role_info["trainer_id"])
        if trainer_data:
            trainer_name = trainer_data.get("name", "Ваш Тренер")
            trainer_username = trainer_data.get("username", "")

    today = datetime.now().strftime("%Y-%m-%d")
    checkin = await database.get_daily_checkin(user_id, today)
    checkin_data = dict(checkin) if checkin else None

    if checkin_data and checkin_data.get('adapted_plan'):
        try:
            checkin_data['adapted_plan'] = json.loads(checkin_data['adapted_plan'])
        except:
            pass

    workout_plan = json.loads(user['workout_plan']) if user.get('workout_plan') else None
    nutrition_goals = json.loads(user['nutrition_goals']) if user.get('nutrition_goals') else None
    today_completed_sets = await database.get_today_completed_sets(user_id, today)

    privacy_settings = json.loads(user['privacy_settings']) if user.get('privacy_settings') else {"share_weight": True,
                                                                                                  "share_cycle": False,
                                                                                                  "share_food": True}

    lvl, exp_prog, exp_need = get_level_info(user.get('exp', 0))

    return {
        "status": "found",
        "user": {
            "user_id": user['user_id'],
            "name": user.get('name') or "Атлет",
            "gender": user.get('gender') or "male",
            "age": user.get('age') or 25,
            "height": user.get('height') or 170,
            "weight": user.get('weight') or 70.0,
            "target_weight": user.get('target_weight') or 70.0,
            "activity_level": user.get('activity_level') or "medium",
            "primary_goal": user.get('primary_goal') or "maintain",
            "custom_goal": user.get('custom_goal') or "",
            "competition_sport": user.get('competition_sport') or "",
            "competition_date": user.get('competition_date') or "",
            "cycle_start_date": user.get('cycle_start_date') or "",
            "cycle_length": user.get('cycle_length') or 28,
            "language": user.get('language') or "uk",
            "level": lvl, "exp": user.get('exp', 0),
            "role": role_info.get("role", "client"),
            "trainer_id": role_info.get("trainer_id"),
            "trainer_name": trainer_name,
            "trainer_username": trainer_username,
            "food_preferences": user.get('food_preferences') or "",
            "nutrition_plan": user.get('nutrition_plan') or "",
            "current_streak": user.get('current_streak') or 0,
            "longest_streak": user.get('longest_streak') or 0,
            "streak_freezes": user.get('streak_freezes') or 0,
            "privacy_settings": privacy_settings,
            "avatar_url": user.get('avatar_url')
        },
        "workout_plan": workout_plan,
        "nutrition_goals": nutrition_goals,
        "today_checkin": checkin_data,
        "today_completed_sets": today_completed_sets,
        "subscription_tier": user.get('subscription_tier', 'FREE'),
        "onboarding_completed": user.get('onboarding_completed', 0)
    }


@app.post("/api/profile")
async def save_profile(data: UserData, current_user: int = Depends(get_current_user)):
    if current_user != data.user_id: raise HTTPException(status_code=403)
    raw_data = data.model_dump()
    macros = calculate_macros(data.weight, data.height, data.age, data.gender, data.activity_level, data.primary_goal)
    ai_analysis = await ai_service.analyze_user_profile(raw_data)
    await database.save_user(data.user_id, raw_data, ai_analysis, macros)
    return {"status": "success"}


@app.post("/api/edit_profile")
async def edit_profile(data: UserData, current_user: int = Depends(get_current_user)):
    if current_user != data.user_id: raise HTTPException(status_code=403)
    raw_data = data.model_dump()
    macros = calculate_macros(data.weight, data.height, data.age, data.gender, data.activity_level, data.primary_goal)
    await database.update_user_profile_only(data.user_id, raw_data, macros)
    return {"status": "success"}


class WeightLogRequest(BaseModel):
    user_id: int
    weight: float
    date: str = None  # Make date optional

@app.post("/api/user/weight")
async def api_user_weight_post(data: WeightLogRequest, current_user: int = Depends(get_current_user)):
    if current_user != data.user_id: raise HTTPException(status_code=403)
    log_date = data.date or datetime.now().strftime("%Y-%m-%d")
    await database.add_weight_entry(data.user_id, data.weight, log_date)
    return {"status": "success"}

@app.get("/api/user/weight/history/{user_id}")
async def api_user_weight_history(user_id: int):
    # Unified implementation using weight_history table via database.py
    history = await database.get_weight_history(user_id)
    return {"status": "success", "data": history}


@app.post("/api/register_trainer")
async def register_trainer_endpoint(data: RegisterTrainerRequest):
    await database.set_user_role(data.user_id, "trainer")
    return {"status": "success"}

class UpgradeTierRequest(BaseModel):
    user_id: int
    new_tier: str

@app.post("/api/test_upgrade_tier")
async def api_test_upgrade_tier(data: UpgradeTierRequest):
    new_role = "trainer" if data.new_tier in ["COACH_BASIC", "COACH_PRO"] else "client"
    await database.upgrade_subscription(data.user_id, data.new_tier, new_role)
    return {"status": "success"}

@app.get("/trainer")
async def trainer_page(request: Request):
    return templates.TemplateResponse("trainer.html", {"request": request})

class JoinTrainerRequest(BaseModel):
    client_id: int
    trainer_id: int

@app.post("/api/join_trainer")
async def join_trainer_endpoint(data: JoinTrainerRequest):
    success = await database.link_client_to_trainer(data.client_id, data.trainer_id)
    if success:
        return {"status": "success"}
    return {"status": "error"}


@app.post("/api/user/food_prefs")
async def save_food_prefs_endpoint(data: FoodPrefs):
    await database.update_food_prefs(data.user_id, data.prefs)
    return {"status": "success"}


# =========================================================
# API: ПЛАНУВАННЯ ТА ТРЕНУВАННЯ
# =========================================================

@app.post("/api/generate_plan/{user_id}")
async def create_plan(user_id: int):
    user = await database.get_user(user_id)
    if not user: return {"status": "error"}

    # Визначаємо, хто робить запит: сам юзер чи тренер
    # Якщо user_id == trainer_id у запиті, значить це тренер генерує для клієнта
    # Але наш поточний API простіший. Припустимо, ми перевіряємо тариф того, хто ініціював.
    
    tier = user.get('subscription_tier', 'FREE')
    
    # ЛІМІТИ ГЕНЕРАЦІЇ ПЛАНІВ
    # FREE: 0, STARTER: 1, PRO: 4, COACH_PRO: 50 (для клієнтів)
    limit = 0
    if tier == 'FREE': limit = 0
    elif tier == 'STARTER': limit = 1
    elif tier == 'PRO' or tier == 'FAMILY': limit = 4
    elif tier == 'COACH_PRO': limit = 50
    elif tier == 'COACH_BASIC': limit = 0 # Basic не має ШІ-помічника
    
    can_use = await database.check_and_increment_usage(user_id, "AI_WORKOUT_GEN", limit, "monthly")
    if not can_use:
        return {"status": "error", "message": "PAYWALL", "feature": "AI_WORKOUT_GEN"}

    ai_data = {
        "risk_factors": json.loads(user.get("ai_risk_factors") or "[]"),
        "exercise_restrictions": json.loads(user.get("ai_exercise_restrictions") or "[]"),
        "focus_areas": json.loads(user.get("ai_focus_areas") or "[]")
    }
    phase = get_cycle_phase(user)
    plan = await ai_service.generate_workout_plan(user, ai_data, phase, tier=tier)

    if plan:
        await database.save_plan(user_id, plan)
        return {"status": "success", "plan": plan}
    return {"status": "error"}


@app.post("/api/smart_rebuild_plan")
async def smart_rebuild_plan(data: ProfileUpdateText):
    user = await database.get_user(data.user_id)
    if not user: return {"status": "error"}

    tier = user.get('subscription_tier', 'FREE')
    # FREE: 0, STARTER: 1, PRO+: 4
    limit = 0 if tier == 'FREE' else (1 if tier == 'STARTER' else 4)
    
    can_use = await database.check_and_increment_usage(data.user_id, "AI_WORKOUT_GEN", limit, "monthly")
    if not can_use:
        return {"status": "error", "message": "PAYWALL", "feature": "AI_WORKOUT_GEN"}

    current_factors = {
        "risk_factors": json.loads(user.get("ai_risk_factors") or "[]"),
        "exercise_restrictions": json.loads(user.get("ai_exercise_restrictions") or "[]"),
        "focus_areas": json.loads(user.get("ai_focus_areas") or "[]")
    }
    ai_update = await ai_service.analyze_profile_update(data.update_text, current_factors, tier=tier)
    await database.update_user_ai_factors(data.user_id, ai_update)

    new_plan = await ai_service.generate_workout_plan(user, ai_update, get_cycle_phase(user), tier=tier)
    if new_plan:
        await database.save_plan(data.user_id, new_plan)
        return {"status": "success", "plan": new_plan}
    return {"status": "error"}


@app.post("/api/update_workout_plan")
async def update_workout_plan(data: WorkoutPlanUpdate):
    await database.save_plan(data.user_id, data.plan)
    return {"status": "success"}


@app.post("/api/update_adapted_plan")
async def update_adapted_plan(data: AdaptedPlanUpdate):
    today = datetime.now().strftime("%Y-%m-%d")
    await database.save_adapted_plan(data.user_id, today, data.plan)
    return {"status": "success"}


@app.post("/api/checkin")
async def process_checkin(data: CheckinData):
    today = datetime.now().strftime("%Y-%m-%d")
    await database.save_daily_checkin(data.user_id, today, data.sleep, data.energy, data.stress, data.soreness)

    user = await database.get_user(data.user_id)
    if not user: return {"status": "error"}

    tier = user.get('subscription_tier', 'FREE')
    limit = 0 if tier in ['FREE', 'STARTER'] else 30
    
    can_use = await database.check_and_increment_usage(data.user_id, "DYNAMIC_ADAPT", limit, "daily")
    if not can_use:
        return {"status": "success", "adapted_plan": None, "message": "PAYWALL", "feature": "DYNAMIC_ADAPT"}

    readiness = {
        "sleep": data.sleep, "energy": data.energy, "stress": data.stress, "soreness": data.soreness,
        "current_day_plan": data.current_day_plan
    }
    phase = get_cycle_phase(user)

    adapted_plan = await ai_service.adapt_daily_workout(user, readiness, phase, tier=tier)
    if adapted_plan:
        await database.save_adapted_plan(data.user_id, today, adapted_plan)
        return {"status": "success", "adapted_plan": adapted_plan}
    return {"status": "error"}


@app.post("/api/log_set")
async def save_set_log(data: SetLog):
    await database.log_workout_set(data.user_id, data.exercise_name, data.set_number, data.weight, data.reps,
                                   data.exercise_type, data.duration, data.distance, data.plan_day)

    if data.exercise_type == 'strength':
        # --- ФАЗА 3: Агресивне кешування ШІ ---
        muscle_id = None
        
        # 1. Перевіряємо локальний кеш бази даних
        cached_info = await database.get_exercise_info(data.exercise_name)
        if cached_info and cached_info.get("muscles") and cached_info.get("muscles") != "Unknown":
            # Беремо перше слово з кешу м'язів, якщо їх там декілька
            muscle_id = cached_info["muscles"].split(",")[0].strip().lower()
            
        # 2. Якщо в кеші немає, викликаємо ШІ (найдешевшу модель)
        if not muscle_id:
            muscle_id = await ai_service.identify_muscle_group(data.exercise_name)
            if muscle_id:
                # Зберігаємо результат в БД, щоб наступного разу не платити токенами
                await database.save_exercise_info(data.exercise_name, muscle_id, "Оновіть для детальної інструкції.")
        
        # 3. Оновлення втоми
        if muscle_id:
            state = await database.get_muscle_fatigue_state(data.user_id)
            old_fatigue = 0.0
            now = datetime.now()

            for row in state:
                if row['muscle'] == muscle_id:
                    try:
                        last_update = datetime.strptime(row['last_updated'], "%Y-%m-%d %H:%M:%S")
                        hours_passed = (now - last_update).total_seconds() / 3600.0
                        old_fatigue = max(0.0, row['fatigue_level'] - (hours_passed * 1.5))
                    except:
                        pass
                    break

            added_fatigue = 10.0 + (data.reps * 0.5)
            new_fatigue = min(100.0, old_fatigue + added_fatigue)
            await database.update_muscle_fatigue_state(data.user_id, muscle_id, new_fatigue,
                                                       now.strftime("%Y-%m-%d %H:%M:%S"))

    return {"status": "success"}


@app.get("/api/muscle_fatigue/{user_id}")
async def get_fatigue_data(user_id: int):
    state = await database.get_muscle_fatigue_state(user_id)
    valid_muscles = [
        'chest', 'obliques', 'abs', 'biceps', 'triceps', 'forearm',
        'trapezius', 'deltoids', 'upper-back', 'lower-back',
        'gluteal', 'quadriceps', 'hamstring', 'adductors', 'calves', 'tibialis', 'neck'
    ]
    result = {m: 0.0 for m in valid_muscles}
    now = datetime.now()

    for row in state:
        m = row['muscle']
        if m in result:
            try:
                last_update = datetime.strptime(row['last_updated'], "%Y-%m-%d %H:%M:%S")
                hours_passed = (now - last_update).total_seconds() / 3600.0
                current_f = max(0.0, row['fatigue_level'] - (hours_passed * 1.5))
                result[m] = round(current_f, 1)
                await database.update_muscle_fatigue_state(user_id, m, current_f, now.strftime("%Y-%m-%d %H:%M:%S"))
            except:
                pass

    return {"status": "success", "data": result}


@app.get("/api/exercise_info/{exercise_name:path}")
async def get_exercise_information(exercise_name: str):
    cached_info = await database.get_exercise_info(exercise_name)
    if cached_info:
        return {"status": "success", "data": {"name": cached_info["name"].title(), "muscles": cached_info["muscles"],
                                              "instruction": cached_info["instruction"]}}

    ai_info = await ai_service.generate_exercise_instruction(exercise_name)
    if ai_info:
        muscles = ai_info.get("muscles", "Не вказано")
        instruction = ai_info.get("instruction", "Інструкція відсутня.")
        await database.save_exercise_info(exercise_name, muscles, instruction)
        return {"status": "success",
                "data": {"name": exercise_name.title(), "muscles": muscles, "instruction": instruction}}

    return {"status": "error"}


# =========================================================
# API: ХАРЧУВАННЯ ТА ШІ
# =========================================================

@app.get("/api/nutrition/{user_id}")
async def get_nutrition_stats(user_id: int, date: str = None):
    user = await database.get_user(user_id)
    goals = json.loads(user['nutrition_goals']) if user and user.get('nutrition_goals') else None
    
    target_date = date if date else datetime.now().strftime("%Y-%m-%d")
    
    consumed = await database.get_today_nutrition(user_id, target_date)
    logs = await database.get_today_nutrition_logs(user_id, target_date)
    water_amount = await database.get_today_water(user_id, target_date)

    return {"status": "success", "goals": goals, "consumed": consumed, "logs": logs, "water": water_amount}


@app.post("/api/log_nutrition")
async def add_nutrition_log(data: NutritionEntry):
    today = datetime.now().strftime("%Y-%m-%d")
    await database.log_nutrition(data.user_id, today, data.calories, data.protein, data.fats, data.carbs,
                                 data.dish_name, data.weight_g)
    return {"status": "success"}


@app.put("/api/nutrition_log/{user_id}/{log_id}")
async def edit_nutrition_log(user_id: int, log_id: int, data: NutritionEntry):
    await database.update_nutrition_log(log_id, data.calories, data.protein, data.fats, data.carbs, data.dish_name,
                                        data.weight_g)
    return {"status": "success"}


@app.delete("/api/nutrition_log/{user_id}/{log_id}")
async def remove_nutrition_log(user_id: int, log_id: int):
    await database.delete_nutrition_log(log_id, user_id)
    return {"status": "success"}


@app.post("/api/analyze_food")
async def analyze_food(file: UploadFile = File(...), user_id: int = Form(None)):
    if not user_id:
        return {"status": "error", "message": "Missing user_id"}
    user = await database.get_user(user_id)
    if not user:
        return {"status": "error", "message": "User not found"}
        
    tier = user.get('subscription_tier', 'FREE')
    # FREE: 0, STARTER: 0, PRO+: 15
    limit = 0 if tier in ['FREE', 'STARTER'] else 15
    
    can_use = await database.check_and_increment_usage(user_id, "AI_FOOD_SCAN", limit, "daily")
    if not can_use:
        return {"status": "error", "message": "PAYWALL", "feature": "AI_FOOD_SCAN"}

    try:
        image_bytes = await file.read()
        result = await ai_service.analyze_food_photo(image_bytes, lang=user.get('language', 'uk'), tier=tier)
        if result and not result.get("error"):
            return {"status": "success", "data": result}
        return {"status": "error"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/recalc_food")
async def api_recalc_food(data: FoodCorrectionRequest):
    try:
        result = await ai_service.reanalyze_food_text_webapp(data.current_data, data.correction)
        if result and not result.get("error"):
            await database.update_nutrition_log(
                data.log_id,
                result.get('calories', 0),
                result.get('protein', 0),
                result.get('fats', 0),
                result.get('carbs', 0),
                result.get('dish_name', 'Оновлено ШІ'),
                result.get('weight_g', 0)
            )
            return {"status": "success", "data": result}
        return {"status": "error"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/generate_recipe")
async def api_generate_recipe(data: RecipeRequest):
    user = await database.get_user(data.user_id)
    if not user: return {"status": "error"}

    tier = user.get('subscription_tier', 'FREE')
    # FREE: 0, STARTER: 0, PRO+: 3
    limit = 0 if tier in ['FREE', 'STARTER'] else 3
    
    can_use = await database.check_and_increment_usage(data.user_id, "AI_RECIPE", limit, "daily")
    if not can_use:
        return {"status": "error", "message": "PAYWALL", "feature": "AI_RECIPE"}

    if not user.get('nutrition_goals'):
        return {"status": "error", "message": "Nutrition goals not set"}

    goals = json.loads(user['nutrition_goals'])
    today = datetime.now().strftime("%Y-%m-%d")
    consumed = await database.get_today_nutrition(data.user_id, today)

    cals_left = max(0, int(goals.get('calories', 2000)) - (consumed.get('cals') or 0))
    prot_left = max(0, int(goals.get('protein', 150)) - (consumed.get('prot') or 0))
    fats_left = max(0, int(goals.get('fats', 70)) - (consumed.get('fat') or 0))
    carbs_left = max(0, int(goals.get('carbs', 200)) - (consumed.get('carb') or 0))

    if cals_left < 50:
        cals_left, prot_left, fats_left, carbs_left = 150, 10, 5, 10

    recipe_data = await ai_service.generate_recipe_from_ingredients(
        data.ingredients, cals_left, prot_left, fats_left, carbs_left,
        lang=user.get('language', 'uk'), tier=tier
    )

    if recipe_data: return {"status": "success", "data": recipe_data}
    return {"status": "error"}


@app.get("/api/scan_barcode/{barcode}")
async def scan_barcode_endpoint(barcode: str, user_id: int = 0):
    if user_id > 0:
        can_use = await database.check_and_increment_usage(user_id, "BARCODE_SCAN", 100, "daily")
        if not can_use:
            return {"status": "error", "message": "PAYWALL", "feature": "BARCODE_SCAN"}

    def fetch_data():
        url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        req = urllib.request.Request(url, headers={'User-Agent': 'FitnessHubPro/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                if data.get("status") == 1:
                    product = data.get("product", {})
                    nutriments = product.get("nutriments", {})
                    name = product.get("product_name_uk") or product.get("product_name_en") or product.get(
                        "product_name") or "Продукт"
                    return {
                        "status": "success",
                        "data": {
                            "dish_name": name,
                            "calories": safe_int(nutriments.get("energy-kcal_100g", 0)),
                            "protein": safe_int(nutriments.get("proteins_100g", 0)),
                            "fats": safe_int(nutriments.get("fat_100g", 0)),
                            "carbs": safe_int(nutriments.get("carbohydrates_100g", 0)),
                            "weight_g": 100
                        }
                    }
                return {"status": "error"}
        except:
            return {"status": "error"}

    return await asyncio.to_thread(fetch_data)


@app.post("/api/log_water")
async def log_water_endpoint(data: WaterEntry):
    today = datetime.now().strftime("%Y-%m-%d")
    await database.log_water(data.user_id, today, data.amount)
    return {"status": "success"}


# =========================================================
# API: FEMTECH ЖІНОЧИЙ ЦИКЛ
# =========================================================

@app.post("/api/cycle/period")
async def update_period(data: CyclePeriodEntry):
    user = await database.get_user(data.user_id)
    if user and user.get('cycle_start_date'):
        old_start = user['cycle_start_date']
        try:
            old_date = datetime.strptime(old_start, "%Y-%m-%d")
            new_date = datetime.strptime(data.start_date, "%Y-%m-%d")
            if new_date > old_date:
                cycle_length = (new_date - old_date).days
                end_date = (new_date - timedelta(days=1)).strftime("%Y-%m-%d")
                await database.save_cycle_history(data.user_id, old_start, end_date, cycle_length, 5)
        except Exception as e:
            logging.error(f"Error saving cycle history: {e}")

    await database.update_cycle_start(data.user_id, data.start_date)
    return {"status": "success"}


@app.post("/api/cycle/symptoms")
async def update_symptoms(data: CycleSymptomEntry):
    await database.save_cycle_symptoms(
        data.user_id, data.date, data.flow_level, data.pain_level, data.mood,
        data.sleep, data.digestion, data.physical, data.libido, data.sexual_activity, data.notes
    )
    return {"status": "success"}


@app.get("/api/cycle/dashboard/{user_id}")
async def cycle_dashboard(user_id: int):
    user = await database.get_user(user_id)
    if not user: return {"status": "error"}

    today = datetime.now().strftime("%Y-%m-%d")
    symptoms = await database.get_cycle_symptoms_by_date(user_id, today)

    return {
        "status": "success",
        "cycle_start_date": user.get('cycle_start_date'),
        "cycle_length": user.get('cycle_length', 28),
        "today_symptoms": symptoms or {}
    }


@app.get("/api/cycle/calendar/{user_id}")
async def cycle_calendar(user_id: int, start_date: str, end_date: str):
    symptoms = await database.get_cycle_symptoms_range(user_id, start_date, end_date)
    return {"status": "success", "data": symptoms}


@app.get("/api/cycle/history/{user_id}")
async def cycle_history_endpoint(user_id: int):
    history = await database.get_cycle_history(user_id)
    return {"status": "success", "data": history}


@app.get("/api/cycle/symptoms/{user_id}/{date}")
async def get_cycle_symptoms_retrospective(user_id: int, date: str):
    symptoms = await database.get_cycle_symptoms_by_date(user_id, date)
    return {"status": "success", "data": symptoms or {}}


@app.post("/api/cycle/adapt_workout")
async def cycle_adapt_workout(data: CycleAdaptWorkoutRequest):
    user = await database.get_user(data.user_id)
    if not user: return {"status": "error"}

    tier = user.get('subscription_tier', 'FREE')
    limit = 0 if tier in ['FREE', 'STARTER'] else 30
    
    can_use = await database.check_and_increment_usage(data.user_id, "DYNAMIC_ADAPT", limit, "daily")
    if not can_use:
        return {"status": "success", "adapted_plan": None, "message": "PAYWALL", "feature": "DYNAMIC_ADAPT"}

    cycle_len = user.get('cycle_length') or 28
    phase = ""
    if 1 <= data.cycle_day <= 5:
        phase = "menstruation"
    elif 6 <= data.cycle_day <= max(6, cycle_len - 15):
        phase = "follicular"
    elif max(7, cycle_len - 14) <= data.cycle_day <= max(7, cycle_len - 12):
        phase = "ovulation"
    else:
        phase = "luteal"

    checkin_data = {
        "sleep": 5,
        "energy": 5,
        "stress": 5,
        "soreness": data.symptoms.get('pain_level', 0) * 5,
        "current_day_plan": data.current_day_plan,
        "symptoms": data.symptoms
    }

    adapted_plan = await ai_service.adapt_daily_workout(user, checkin_data, phase, tier=tier)
    if adapted_plan:
        await database.save_daily_checkin(
            data.user_id,
            data.date,
            checkin_data['sleep'],
            checkin_data['energy'],
            checkin_data['stress'],
            checkin_data['soreness']
        )
        await database.save_adapted_plan(data.user_id, data.date, adapted_plan)
        return {"status": "success", "adapted_plan": adapted_plan}
    return {"status": "error"}


@app.get("/api/cycle/insight/{user_id}")
async def cycle_insight(user_id: int):
    try:
        user = await database.get_user(user_id)
        if not user:
            return JSONResponse({"status": "error", "message": "User not found"})

        today = datetime.now().strftime("%Y-%m-%d")
        symptoms = await database.get_cycle_symptoms_by_date(user_id, today) or {}

        cycle_day = 1
        if user.get("cycle_start_date"):
            start_date = datetime.strptime(user["cycle_start_date"], "%Y-%m-%d")
            diff = (datetime.now() - start_date).days
            c_len = user.get("cycle_length") or 28
            cycle_day = (diff % c_len) + 1 if diff >= 0 else 1

        insight_data = await ai_service.generate_cycle_insight(user, symptoms, cycle_day)
        return {"status": "success", "data": insight_data}
    except Exception as e:
        logging.error(f"Insight error: {e}")
        return {"status": "error", "message": str(e)}


# =========================================================
# API: СТАТИСТИКА ТА ПРОГРЕС
# =========================================================

@app.get("/api/progress/{user_id}")
async def get_progress(user_id: int):
    data = await database.get_progress_data(user_id)
    return {"status": "success", "data": data}


@app.post("/api/log_body_metrics")
async def log_body_metrics_endpoint(data: BodyMetricsEntry):
    today = datetime.now().strftime("%Y-%m-%d")
    await database.log_body_metrics(data.user_id, today, data.waist, data.hips, data.chest, data.biceps)
    return {"status": "success"}


async def get_rarity_percentages(achievements_list):
    global rarity_cache
    now = time.time()

    if now - rarity_cache.get("timestamp", 0) > 3600 or not rarity_cache.get("data"):
        metrics = await database.get_all_users_metrics_for_rarity()
        total = max(1, metrics['total'])
        cache_data = {}

        levels = [r['level'] for r in metrics['users']]
        streaks = [r['longest_streak'] for r in metrics['users']]
        workouts = [r.get('w', 0) for r in metrics['workouts']]
        sets = [r.get('s', 0) for r in metrics['workouts']]
        volumes = [r.get('v') or 0 for r in metrics['workouts']]
        meals = [r.get('m', 0) for r in metrics['meals']]
        checkins = [r.get('ch', 0) for r in metrics['checkins']]

        data_map = {
            'levels': levels,
            'streaks': streaks,
            'workouts': workouts,
            'sets': sets,
            'volumes': volumes,
            'meals': meals,
            'checkins': checkins
        }

        for a in achievements_list:
            count = sum(1 for x in data_map.get(a['type'], []) if x >= a['target'])
            cache_data[a['id']] = round((count / total) * 100, 1)

        rarity_cache["timestamp"] = now
        rarity_cache["data"] = cache_data

    return rarity_cache["data"]


@app.get("/api/gamification/{user_id}")
async def get_gamification(user_id: int):
    user = await database.get_user(user_id)
    if not user: return {"status": "error"}

    stats = await database.get_user_stats(user_id)
    lvl, exp_prog, exp_need = get_level_info(user.get('exp', 0))
    ls = user.get('longest_streak', 0)

    achievements = [
        # Тренування (Workouts)
        {"id": "w1", "title": "Перший крок", "desc": "1 тренування", "target": 1, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w10", "title": "Любитель", "desc": "10 тренувань", "target": 10, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w50", "title": "Атлет", "desc": "50 тренувань", "target": 50, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w100", "title": "Машина", "desc": "100 тренувань", "target": 100, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w250", "title": "Фанатик", "desc": "250 тренувань", "target": 250, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w500", "title": "Кіборг", "desc": "500 тренувань", "target": 500, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w750", "title": "Бог Фітнесу", "desc": "750 тренувань", "target": 750, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w1000", "title": "Містер Олімпія", "desc": "1000 тренувань", "target": 1000, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w1500", "title": "Легенда", "desc": "1500 тренувань", "target": 1500, "cur": stats['workouts'], "type": "workouts"},
        {"id": "w2000", "title": "Титан Фітнесу", "desc": "2000 тренувань", "target": 2000, "cur": stats['workouts'], "type": "workouts"},

        # Тоннаж (Volumes)
        {"id": "v1", "title": "Розминка", "desc": "Підняти 1,000 кг", "target": 1000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v10", "title": "Новачок", "desc": "Підняти 10,000 кг", "target": 10000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v50", "title": "Важкоатлет", "desc": "Підняти 50,000 кг", "target": 50000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v100", "title": "Клуб 100к", "desc": "Підняти 100,000 кг", "target": 100000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v250", "title": "Екскаватор", "desc": "Підняти 250,000 кг", "target": 250000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v500", "title": "Підйомний кран", "desc": "Підняти 500,000 кг", "target": 500000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v1000", "title": "Клуб Мільйона", "desc": "Підняти 1,000,000 кг", "target": 1000000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v1500", "title": "Гора", "desc": "Підняти 1,500,000 кг", "target": 1500000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v2000", "title": "Атлант", "desc": "Підняти 2,000,000 кг", "target": 2000000, "cur": stats['volume'], "type": "volumes"},
        {"id": "v5000", "title": "Халк", "desc": "Підняти 5,000,000 кг", "target": 5000000, "cur": stats['volume'], "type": "volumes"},

        # Стріки (Streaks)
        {"id": "strk3", "title": "Іскра", "desc": "3 дні підряд", "target": 3, "cur": ls, "type": "streaks"},
        {"id": "strk7", "title": "В ритмі", "desc": "7 днів підряд", "target": 7, "cur": ls, "type": "streaks"},
        {"id": "strk14", "title": "Звичка", "desc": "14 днів підряд", "target": 14, "cur": ls, "type": "streaks"},
        {"id": "strk30", "title": "Залізна дисципліна", "desc": "30 днів підряд", "target": 30, "cur": ls, "type": "streaks"},
        {"id": "strk60", "title": "Незламний", "desc": "60 днів підряд", "target": 60, "cur": ls, "type": "streaks"},
        {"id": "strk100", "title": "Клуб 100 Днів", "desc": "100 днів підряд", "target": 100, "cur": ls, "type": "streaks"},
        {"id": "strk180", "title": "Півроку вогню", "desc": "180 днів підряд", "target": 180, "cur": ls, "type": "streaks"},
        {"id": "strk365", "title": "Рік стійкості", "desc": "365 днів підряд", "target": 365, "cur": ls, "type": "streaks"},
        {"id": "strk500", "title": "Абсолют", "desc": "500 днів підряд", "target": 500, "cur": ls, "type": "streaks"},
        {"id": "strk1000", "title": "Ера Дисципліни", "desc": "1000 днів підряд", "target": 1000, "cur": ls, "type": "streaks"},

        # Їжа (Meals)
        {"id": "m1", "title": "Перший укус", "desc": "1 запис їжі", "target": 1, "cur": stats['meals'], "type": "meals"},
        {"id": "m10", "title": "Стежу за раціоном", "desc": "10 записів їжі", "target": 10, "cur": stats['meals'], "type": "meals"},
        {"id": "m50", "title": "Гурман", "desc": "50 записів їжі", "target": 50, "cur": stats['meals'], "type": "meals"},
        {"id": "m100", "title": "Дієтолог", "desc": "100 записів їжі", "target": 100, "cur": stats['meals'], "type": "meals"},
        {"id": "m250", "title": "Шеф-кухар", "desc": "250 записів їжі", "target": 250, "cur": stats['meals'], "type": "meals"},
        {"id": "m500", "title": "Магістр Нутриціології", "desc": "500 записів їжі", "target": 500, "cur": stats['meals'], "type": "meals"},
        {"id": "m750", "title": "Здорове життя", "desc": "750 записів їжі", "target": 750, "cur": stats['meals'], "type": "meals"},
        {"id": "m1000", "title": "Експерт Раціону", "desc": "1000 записів їжі", "target": 1000, "cur": stats['meals'], "type": "meals"},
        {"id": "m2000", "title": "Роботизований метаболізм", "desc": "2000 записів їжі", "target": 2000, "cur": stats['meals'], "type": "meals"},
        {"id": "m5000", "title": "Бог Їжі", "desc": "5000 записів їжі", "target": 5000, "cur": stats['meals'], "type": "meals"},

        # Підходи (Sets)
        {"id": "s10", "title": "Розігрів", "desc": "10 підходів", "target": 10, "cur": stats['sets'], "type": "sets"},
        {"id": "s50", "title": "Стійкий", "desc": "50 підходів", "target": 50, "cur": stats['sets'], "type": "sets"},
        {"id": "s250", "title": "Пахар", "desc": "250 підходів", "target": 250, "cur": stats['sets'], "type": "sets"},
        {"id": "s500", "title": "Пампер", "desc": "500 підходів", "target": 500, "cur": stats['sets'], "type": "sets"},
        {"id": "s1000", "title": "Воїн Залу", "desc": "1000 підходів", "target": 1000, "cur": stats['sets'], "type": "sets"},
        {"id": "s2500", "title": "Нестомний", "desc": "2500 підходів", "target": 2500, "cur": stats['sets'], "type": "sets"},
        {"id": "s5000", "title": "Сталеві М'язи", "desc": "5000 підходів", "target": 5000, "cur": stats['sets'], "type": "sets"},
        {"id": "s10000", "title": "Клуб 10к", "desc": "10000 підходів", "target": 10000, "cur": stats['sets'], "type": "sets"},
        {"id": "s15000", "title": "Кінетична машина", "desc": "15000 підходів", "target": 15000, "cur": stats['sets'], "type": "sets"},
        {"id": "s25000", "title": "Бог Пампінгу", "desc": "25000 підходів", "target": 25000, "cur": stats['sets'], "type": "sets"},

        # Активність/Чек-іни (Checkins)
        {"id": "c1", "title": "Я тут!", "desc": "1 перевірка", "target": 1, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c7", "title": "Тиждень активу", "desc": "7 перевірок", "target": 7, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c30", "title": "Місяць в грі", "desc": "30 перевірок", "target": 30, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c90", "title": "Квартал", "desc": "90 перевірок", "target": 90, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c180", "title": "Півроку з нами", "desc": "180 перевірок", "target": 180, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c250", "title": "Амбасадор", "desc": "250 перевірок", "target": 250, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c365", "title": "Рік разом", "desc": "365 перевірок", "target": 365, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c500", "title": "Ветеран", "desc": "500 перевірок", "target": 500, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c750", "title": "Еліта", "desc": "750 перевірок", "target": 750, "cur": stats['checkins'], "type": "checkins"},
        {"id": "c1000", "title": "Жива Легенда", "desc": "1000 перевірок", "target": 1000, "cur": stats['checkins'], "type": "checkins"},

        # Рівні (Levels)
        {"id": "l2", "title": "Новий рівень", "desc": "Досягти 2 рівня", "target": 2, "cur": lvl, "type": "levels"},
        {"id": "l5", "title": "Досвідчений", "desc": "Досягти 5 рівня", "target": 5, "cur": lvl, "type": "levels"},
        {"id": "l10", "title": "Майстер", "desc": "Досягти 10 рівня", "target": 10, "cur": lvl, "type": "levels"},
        {"id": "l20", "title": "Кандидат", "desc": "Досягти 20 рівня", "target": 20, "cur": lvl, "type": "levels"},
        {"id": "l30", "title": "Профі", "desc": "Досягти 30 рівня", "target": 30, "cur": lvl, "type": "levels"},
        {"id": "l40", "title": "Експерт", "desc": "Досягти 40 рівня", "target": 40, "cur": lvl, "type": "levels"},
        {"id": "l50", "title": "Гросмейстер", "desc": "Досягти 50 рівня", "target": 50, "cur": lvl, "type": "levels"},
        {"id": "l75", "title": "Еліта", "desc": "Досягти 75 рівня", "target": 75, "cur": lvl, "type": "levels"},
        {"id": "l90", "title": "Чемпіон", "desc": "Досягти 90 рівня", "target": 90, "cur": lvl, "type": "levels"},
        {"id": "l100", "title": "Абсолютний розум", "desc": "Досягти 100 рівня", "target": 100, "cur": lvl, "type": "levels"}
    ]

    rarities = await get_rarity_percentages(achievements)

    for a in achievements:
        a['unlocked'] = a['cur'] >= a['target']
        pct = rarities.get(a['id'], 0.0)
        if a['unlocked'] and pct == 0.0: pct = 1.0
        a['rarity_pct'] = int(pct) if float(pct).is_integer() else pct

    return {"status": "success", "level": lvl, "exp": user.get('exp', 0), "exp_prog": exp_prog, "exp_need": exp_need,
            "achievements": achievements}


@app.get("/api/leaderboard/global")
async def get_global_leaderboard():
    return {"status": "success", "data": await database.get_global_leaderboard()}


@app.get("/api/leaderboard/team/{trainer_id}")
async def get_team_leaderboard(trainer_id: int):
    return {"status": "success", "data": await database.get_team_leaderboard(trainer_id)}


@app.get("/api/leaderboard/friends/{user_id}")
async def get_friends_leaderboard_endpoint(user_id: int):
    return {"status": "success", "data": await database.get_friends_leaderboard(user_id)}


@app.get("/api/friends/{user_id}")
async def get_friends_list_endpoint(user_id: int):
    return {"status": "success", "data": await database.get_friends_list(user_id)}


@app.post("/api/store/buy_freeze")
async def buy_freeze(data: BuyFreezeRequest, current_user: int = Depends(get_current_user)):
    if current_user != data.user_id: raise HTTPException(status_code=403)
    success = await database.buy_streak_freeze(data.user_id)
    if success:
        return {"status": "success", "message": "Заморозку успішно придбано!"}
    return {"status": "error", "message": "Недостатньо досвіду (EXP) для покупки."}


# --- ДУЕЛІ ТА ВИКЛИКИ ---

@app.post("/api/duels/create")
async def api_create_duel(data: CreateDuelRequest, current_user: int = Depends(get_current_user)):
    if current_user != data.initiator_id: raise HTTPException(status_code=403)
    user = await database.get_user(data.initiator_id)
    if not user or user.get('exp', 0) < data.bet_exp:
        return {"status": "error", "message": "Недостатньо EXP."}

    if data.opponent_id != 0 and await database.check_existing_duel(data.initiator_id, data.opponent_id,
                                                                    data.duel_type):
        return {"status": "error", "message": "Ви вже кинули виклик цьому другу в цій категорії! Зачекайте завершення."}

    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute("UPDATE users SET exp = exp - ? WHERE user_id = ?", (data.bet_exp, data.initiator_id))
        await db.commit()

    duel_id = await database.create_duel(data.initiator_id, data.opponent_id, data.bet_exp, data.duel_type, data.days)

    if data.opponent_id != 0:
        opponent = await database.get_user(data.opponent_id)
        if opponent:
            msg = f"⚔️ {user.get('name')} кинув вам виклик! Зайдіть у Хаб, щоб прийняти."
            asyncio.create_task(asyncio.to_thread(send_tg_message_sync, data.opponent_id, msg))

    return {"status": "success", "duel_id": duel_id}


@app.post("/api/duels/accept")
async def api_accept_duel(data: DuelActionRequest, current_user: int = Depends(get_current_user)):
    if current_user != data.user_id: raise HTTPException(status_code=403)
    duel = await database.get_duel(data.duel_id)
    if not duel or duel['status'] != 'pending':
        return {"status": "error", "message": "Виклик не знайдено або він вже активний."}
    if duel['opponent_id'] != data.user_id:
        return {"status": "error", "message": "Це не ваш виклик."}

    user = await database.get_user(data.user_id)
    if not user or user.get('exp', 0) < duel['bet_exp']:
        return {"status": "error", "message": "Недостатньо EXP для прийняття виклику."}

    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute("UPDATE users SET exp = exp - ? WHERE user_id = ?", (duel['bet_exp'], data.user_id))
        await db.execute("UPDATE duels SET status = 'active' WHERE id = ?", (data.duel_id,))
        await db.commit()

    await database.log_social_event(data.user_id, 'duel',
                                    f"сміливо прийняв(-ла) виклик на дуель ({duel['bet_exp']} EXP)!")

    initiator = await database.get_user(duel['initiator_id'])
    if initiator:
        msg = f"🔥 {user.get('name')} прийняв ваш виклик на {duel['bet_exp']} EXP! Дуель почалась."
        asyncio.create_task(asyncio.to_thread(send_tg_message_sync, duel['initiator_id'], msg))

    return {"status": "success"}


@app.post("/api/duels/reject")
async def api_reject_duel(data: DuelActionRequest):
    if await database.refund_duel_bet(data.duel_id):
        return {"status": "success"}
    return {"status": "error"}


@app.get("/api/duels/{user_id}")
async def get_duels(user_id: int):
    return {"status": "success", "data": await database.get_user_duels(user_id)}


# --- КВЕСТИ, ТЕПЛОВА МАПА ТА СТРІЧКА ---

@app.get("/api/social_feed/{user_id}")
async def get_social_feed_endpoint(user_id: int):
    return {"status": "success", "data": await database.get_friends_social_feed(user_id)}


@app.get("/api/heatmap/{user_id}")
async def get_heatmap_endpoint(user_id: int):
    return {"status": "success", "data": await database.get_user_heatmap_data(user_id)}


@app.get("/api/quests/{user_id}")
async def get_daily_quests_endpoint(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    quests = await database.get_daily_quests(user_id, today)

    if not quests:
        possible_quests = [
            {"type": "water", "target": 2000, "reward": 30},
            {"type": "sets", "target": 25, "reward": 40},
            {"type": "volume", "target": 5000, "reward": 50},
            {"type": "meals", "target": 3, "reward": 30},
            {"type": "checkin", "target": 1, "reward": 15}
        ]
        await database.create_daily_quests(user_id, today, random.sample(possible_quests, 3))
        quests = await database.get_daily_quests(user_id, today)

    return {"status": "success", "data": quests}


@app.post("/api/favorite_meals")
async def add_favorite_meal(data: FavoriteMealRequest):
    await database.save_favorite_meal(data.user_id, data.dish_name, data.calories, data.protein, data.fats, data.carbs,
                                      data.weight_g)
    return {"status": "success"}


@app.get("/api/favorite_meals/{user_id}")
async def fetch_favorite_meals(user_id: int):
    return {"status": "success", "data": await database.get_favorite_meals(user_id)}


@app.delete("/api/favorite_meals/{user_id}/{meal_id}")
async def remove_favorite_meal(user_id: int, meal_id: int):
    await database.delete_favorite_meal(meal_id, user_id)
    return {"status": "success"}


# =========================================================
# API ДЛЯ ТРЕНЕРА ТА ШАБЛОНІВ
# =========================================================

@app.get("/api/trainer/{trainer_id}/clients")
async def api_get_trainer_clients(trainer_id: int):
    clients = await database.get_trainer_clients(trainer_id)
    return {"status": "success", "clients": clients}


@app.post("/api/trainer/nutrition_plan")
async def api_save_trainer_nutrition(data: NutritionPlanUpdate):
    await database.update_nutrition_plan(data.user_id, data.plan)
    return {"status": "success"}


@app.post("/api/trainer/templates")
async def api_save_template(data: SaveTemplateRequest):
    await database.save_trainer_template(data.trainer_id, data.template_name, data.plan_data)
    return {"status": "success"}


@app.get("/api/trainer/{trainer_id}/templates")
async def api_get_templates(trainer_id: int):
    return {"status": "success", "data": await database.get_trainer_templates(trainer_id)}


@app.delete("/api/trainer/{trainer_id}/templates/{template_id}")
async def api_delete_template(trainer_id: int, template_id: int):
    await database.delete_trainer_template(template_id, trainer_id)
    return {"status": "success"}


# =========================================================
# ПІДСУМОК ТРЕНУВАННЯ
# =========================================================

@app.get("/api/workout_logs/{user_id}")
async def api_get_workout_logs(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    logs = await database.get_today_workout_logs(user_id, today)
    return {"status": "success", "data": logs}

@app.get("/api/workout_summary/{user_id}")
async def get_workout_summary(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(database.DB_NAME) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute('''
                                  SELECT SUM(weight * reps) as v, COUNT(*) as s, SUM(duration) as d
                                  FROM workout_logs
                                  WHERE user_id = ? AND date LIKE ?
                                  ''', (user_id, f"{today}%"))
        row = await cursor.fetchone()

        v = int(row['v'] or 0)
        s = int(row['s'] or 0)
        d = int(row['d'] or 0)

        cals = (s * 12) + (d * 8)
        mins = d or (s * 3)

        u_cursor = await db.execute('SELECT exp, current_streak FROM users WHERE user_id = ?', (user_id,))
        u_row = await u_cursor.fetchone()
        lvl, _, _ = get_level_info(u_row['exp'] if u_row else 0)
        streak = u_row['current_streak'] if u_row else 0

        if s > 0:
            ev_cursor = await db.execute(
                "SELECT id FROM social_events WHERE user_id=? AND event_type='workout' AND timestamp LIKE ?",
                (user_id, f"{today}%"))
            ev = await ev_cursor.fetchone()
            if not ev:
                await database.log_social_event(user_id, 'workout', f"успішно завершив(-ла) тренування! ({v} кг)")

        return {
            "status": "success",
            "data": {"volume": v, "sets": s, "calories": cals, "duration": mins, "level": lvl, "streak": streak}
        }


# =========================================================
# НОВІ ЕНДПОІНТИ V2.0 (IN-GYM UX, NUTRITION, PRIVACY, CRM)
# =========================================================

@app.post("/api/ai/substitute_exercise")
async def api_substitute_exercise(data: SubstituteExerciseRequest):
    user = await database.get_user(data.user_id)
    if not user:
        return {"status": "error", "message": "User not found"}
    result = await ai_service.generate_exercise_substitute(user, data.exercise_name)
    return {"status": "success", "data": result}


@app.post("/api/sync_offline")
async def api_sync_offline(data: SyncOfflineRequest):
    today = datetime.now().strftime("%Y-%m-%d")

    for w_log in data.workout_logs:
        await database.log_workout_set(
            w_log.user_id, w_log.exercise_name, w_log.set_number,
            w_log.weight, w_log.reps, w_log.exercise_type,
            w_log.duration, w_log.distance, w_log.plan_day
        )

    for n_log in data.nutrition_logs:
        await database.log_nutrition(
            n_log.user_id, today, n_log.calories, n_log.protein,
            n_log.fats, n_log.carbs, n_log.dish_name, n_log.weight_g
        )

    return {"status": "success",
            "message": f"Synced {len(data.workout_logs)} workouts and {len(data.nutrition_logs)} meals."}


@app.post("/api/ai/grocery_list")
async def api_grocery_list(data: GroceryListRequest):
    user = await database.get_user(data.user_id)
    if not user:
        return {"status": "error", "message": "User not found"}

    tier = user.get('subscription_tier', 'FREE')
    limit = 0 if tier == 'FREE' else (4 if tier == 'STARTER' else 30)
    
    can_use = await database.check_and_increment_usage(data.user_id, "AUTO_GROCERY", limit, "monthly")
    if not can_use:
        return {"status": "error", "message": "PAYWALL", "feature": "AUTO_GROCERY"}

    if user.get("nutrition_goals") and isinstance(user["nutrition_goals"], str):
        try:
            user["nutrition_goals"] = json.loads(user["nutrition_goals"])
        except:
            pass

    result = await ai_service.generate_smart_grocery_list(user, tier=tier)
    return {"status": "success", "data": result}


@app.post("/api/user/privacy")
async def api_update_privacy(data: PrivacySettingsUpdate):
    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute('UPDATE users SET privacy_settings = ? WHERE user_id = ?',
                         (json.dumps(data.privacy_settings), data.user_id))
        await db.commit()
    return {"status": "success"}


@app.post("/api/test_upgrade_tier")
async def api_test_upgrade_tier(data: UpgradeTierRequest):
    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute('UPDATE users SET subscription_tier = ? WHERE user_id = ?', (data.new_tier, data.user_id))
        await db.commit()

    # Якщо це сімейна підписка, одразу створюємо групу
    if data.new_tier == "FAMILY":
        await database.create_family_group(data.user_id)

    return {"status": "success", "new_tier": data.new_tier}

# --- СІМЕЙНІ ЕНДПОІНТИ (ФАЗА 6) ---

@app.post("/api/family/invite")
async def api_family_invite(data: Dict[str, int]):
    user_id = data.get("user_id")
    token = await database.generate_family_invite(user_id)
    if token:
        # Посилання веде в Telegram-бота з параметром start
        invite_link = f"https://t.me/pure_fitness_hub_bot?start=joinfam_{token}"
        return {"status": "success", "invite_link": invite_link}
    return {"status": "error", "message": "Не вдалося створити запрошення. Ви впевнені, що у вас FAMILY підписка?"}

@app.get("/api/family/members/{user_id}")
async def api_get_family_members(user_id: int):
    members = await database.get_family_members(user_id)
    return {"status": "success", "data": members}

@app.get("/api/leaderboard/family/{user_id}")
async def api_get_family_leaderboard(user_id: int):
    lb = await database.get_family_leaderboard(user_id)
    return {"status": "success", "data": lb}


@app.post("/api/onboarding/complete")
async def api_complete_onboarding(data: CompleteOnboardingRequest):
    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute('UPDATE users SET onboarding_completed = 1 WHERE user_id = ?', (data.user_id,))
        await db.commit()
    return {"status": "success"}


@app.post("/api/coach/comment")
async def api_coach_comment(data: CoachCommentRequest):
    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute('''INSERT INTO coach_comments
                                (user_id, trainer_id, entity_type, entity_id, comment_text)
                            VALUES (?, ?, ?, ?, ?)''',
                         (data.user_id, data.trainer_id, data.entity_type, data.entity_id, data.comment_text))
        await db.commit()

    msg = f"📩 Ваш тренер залишив новий коментар до вашого прогресу!"
    asyncio.create_task(asyncio.to_thread(send_tg_message_sync, data.user_id, msg))

    return {"status": "success"}

@app.post("/api/share_image")
async def api_share_image(data: ShareImageRequest):
    try:
        # Strip the data:image/jpeg;base64, prefix if present
        b64_str = data.image_base64
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
            
        img_bytes = base64.b64decode(b64_str)
        
        # Send to telegram
        url = f"https://api.telegram.org/bot{config.BOT_TOKEN}/sendPhoto"
        
        form = aiohttp.FormData()
        form.add_field('chat_id', str(data.user_id))
        form.add_field('photo', img_bytes, filename='summary.jpg', content_type='image/jpeg')
        if data.caption:
            form.add_field('caption', data.caption)
            
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=form) as resp:
                result = await resp.json()
                if result.get("ok"):
                    return {"status": "success", "message": "Image sent"}
                else:
                    logging.error(f"TG sendPhoto error: {result}")
                    return {"status": "error", "message": "TG API Error"}
    except Exception as e:
        logging.error(f"Error sharing image: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/recap/weekly/{user_id}")
async def api_weekly_recap(user_id: int):
    """Генерує 3 HTML-слайди з тижневими підсумками для Stories Engine."""
    try:
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        today = datetime.now().strftime("%Y-%m-%d")
        async with aiosqlite.connect(database.DB_NAME) as db:
            # --- Загальна статистика ---
            row = await (await db.execute(
                "SELECT COUNT(DISTINCT date(date)), COUNT(*), COALESCE(SUM(weight * reps), 0) FROM workout_logs WHERE user_id = ? AND date >= ?",
                (user_id, week_ago))).fetchone()
            total_days = row[0] if row else 0
            total_sets = row[1] if row else 0
            total_volume = int(row[2]) if row and row[2] else 0

            # --- Калорії за тиждень ---
            cal_row = await (await db.execute(
                "SELECT COALESCE(SUM(calories), 0) FROM nutrition_logs WHERE user_id = ? AND date >= ?",
                (user_id, week_ago))).fetchone()
            total_cal = int(cal_row[0]) if cal_row and cal_row[0] else 0

            # --- Streak ---
            streak_row = await (await db.execute(
                "SELECT current_streak FROM users WHERE user_id = ?", (user_id,))).fetchone()
            streak = streak_row[0] if streak_row and streak_row[0] else 0

            # --- Топ-3 вправи ---
            top_rows = await (await db.execute(
                "SELECT exercise_name, COUNT(*) as cnt, COALESCE(SUM(weight * reps), 0) as vol FROM workout_logs WHERE user_id = ? AND date >= ? GROUP BY exercise_name ORDER BY vol DESC LIMIT 3",
                (user_id, week_ago))).fetchall()

        if total_sets == 0:
            return {"status": "empty", "slides": []}

        # --- Генерація HTML-слайдів ---
        slide_style = "color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; width:100%; height:100%; padding:20px; box-sizing:border-box;"
        card_style = "background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:18px; margin:6px 0; width:100%; max-width:300px;"
        val_style = "font-size:32px; font-weight:900; line-height:1.2;"
        label_style = "font-size:11px; text-transform:uppercase; color:rgba(255,255,255,0.5); letter-spacing:0.5px; margin-top:4px;"

        # Слайд 1: Загальна статистика
        slide1 = f'''<div style="{slide_style}">
            <div style="font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">Тижневий звіт</div>
            <div style="font-size:28px; font-weight:900; margin-bottom:24px; background:linear-gradient(135deg,#ff2d55,#bf5af2); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">ТВОЇ ПІДСУМКИ</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%; max-width:300px;">
                <div style="{card_style}"><div style="{val_style} color:#ff2d55;">{total_days}</div><div style="{label_style}">Тренувань</div></div>
                <div style="{card_style}"><div style="{val_style} color:#bf5af2;">{total_sets}</div><div style="{label_style}">Підходів</div></div>
                <div style="{card_style}"><div style="{val_style} color:#00ea66;">{total_volume:,}</div><div style="{label_style}">Тоннаж (кг)</div></div>
                <div style="{card_style}"><div style="{val_style} color:#ff9500;">{total_cal:,}</div><div style="{label_style}">Калорій</div></div>
            </div>
        </div>'''

        # Слайд 2: Топ вправи
        top_html = ""
        medals = ["🥇", "🥈", "🥉"]
        for i, ex in enumerate(top_rows):
            name = ex[0] if ex[0] else "Вправа"
            cnt = ex[1]
            vol = int(ex[2]) if ex[2] else 0
            top_html += f'''<div style="{card_style} display:flex; align-items:center; gap:12px; text-align:left;">
                <div style="font-size:28px;">{medals[i] if i < 3 else "💪"}</div>
                <div style="flex:1;">
                    <div style="font-size:14px; font-weight:700;">{name}</div>
                    <div style="font-size:11px; color:rgba(255,255,255,0.4);">{cnt} підх. • {vol:,} кг</div>
                </div>
            </div>'''

        slide2 = f'''<div style="{slide_style}">
            <div style="font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">Твої лідери</div>
            <div style="font-size:24px; font-weight:900; margin-bottom:20px;">ТОП ВПРАВИ 💪</div>
            {top_html}
        </div>'''

        # Слайд 3: Мотивація
        motivation = "Ти на правильному шляху!" if total_days >= 3 else "Продовжуй! Кожен крок важливий."
        slide3 = f'''<div style="{slide_style}">
            <div style="font-size:60px; margin-bottom:16px;">🔥</div>
            <div style="font-size:48px; font-weight:900; background:linear-gradient(135deg,#ff9500,#ff2d55); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:8px;">{streak}</div>
            <div style="font-size:14px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px; margin-bottom:24px;">Днів поспіль</div>
            <div style="font-size:18px; font-weight:600; max-width:280px; line-height:1.5;">{motivation}</div>
            <div style="margin-top:24px; font-size:12px; color:rgba(255,255,255,0.3);">FITNESS HUB PRO</div>
        </div>'''

        return {"status": "success", "slides": [slide1, slide2, slide3]}
    except Exception as e:
        logging.error(f"Weekly recap error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/today_summary/{user_id}")
async def api_today_summary(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(database.DB_NAME) as db:
        cursor = await db.execute('''
            SELECT SUM(weight * reps) as total_volume 
            FROM workout_logs 
            WHERE user_id = ? AND date LIKE ?
        ''', (user_id, f"{today}%"))
        row = await cursor.fetchone()
        vol = row[0] if row and row[0] else 0
        cursor_gam = await db.execute('''
            SELECT SUM(duration) as dur
            FROM workout_logs 
            WHERE user_id = ? AND date LIKE ?
        ''', (user_id, f"{today}%"))
        row_gam = await cursor_gam.fetchone()
        dur = row_gam[0] if row_gam and row_gam[0] else 0
        cals = int((vol * 0.05) + (dur / 60.0 * 5.0))
        
        return {"status": "success", "volume": int(vol), "calories": int(cals)}

@app.get("/api/coach/comments/{user_id}")
async def api_get_coach_comments(user_id: int):
    async with aiosqlite.connect(database.DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            'SELECT entity_type, entity_id, comment_text FROM coach_comments WHERE user_id = ? ORDER BY timestamp DESC',
            (user_id,)
        )
        rows = await cursor.fetchall()
        comments = [{"entity_type": row["entity_type"], "entity_id": str(row["entity_id"]), "text": row["comment_text"]}
                    for row in rows]
    return {"status": "success", "data": comments}


@app.post("/api/upload_video")
async def api_upload_video(
        file: UploadFile = File(...),
        user_id: int = Form(...),
        exercise_name: str = Form(...),
        plan_day: str = Form(...)
):
    upload_dir = "static/uploads/videos/"
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if "." in file.filename else "mp4"
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(upload_dir, unique_filename)

    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    video_url = f"/{file_path}"

    today = datetime.now().strftime("%Y-%m-%d")

    async with aiosqlite.connect(database.DB_NAME) as db:
        await db.execute('''
                         UPDATE workout_logs
                         SET video_url = ?
                         WHERE id = (SELECT id
                                     FROM workout_logs
                                     WHERE user_id = ?
                                       AND exercise_name = ?
                                       AND date LIKE ?
                         ORDER BY id DESC LIMIT 1
                             )
                         ''', (video_url, user_id, exercise_name, f"{today}%"))
        await db.commit()

    return {"status": "success", "video_url": video_url}


@app.post("/api/user/upload_avatar")
async def upload_avatar_endpoint(user_id: int = Form(...), avatar: UploadFile = File(...)):
    upload_dir = "static/uploads/avatars/"
    os.makedirs(upload_dir, exist_ok=True)

    # Валідація розширення
    ext = avatar.filename.split('.')[-1].lower() if "." in avatar.filename else "jpg"
    if ext not in ['jpg', 'jpeg', 'png', 'webp']:
        raise HTTPException(status_code=400, detail="Invalid image format")

    # Формування унікального імені
    timestamp = int(datetime.now().timestamp())
    filename = f"user_{user_id}_{timestamp}.{ext}"
    file_path = os.path.join(upload_dir, filename)

    # Збереження файлу
    with open(file_path, "wb") as buffer:
        content = await avatar.read()
        buffer.write(content)

    # Оновлення в БД
    avatar_url = f"/{file_path.replace('\\', '/')}"
    await database.update_user_avatar(user_id, avatar_url)

    return {"status": "success", "avatar_url": avatar_url}


# Endpoint consolidated above at line 625


@app.post("/api/user/weight/log")
async def log_weight_endpoint(data: WeightLogRequest):
    # Handle optional date in the backend
    log_date = data.date or datetime.now().strftime("%Y-%m-%d")
    await database.add_weight_entry(data.user_id, data.weight, log_date)
    return {"status": "success"}


# =========================================================
# NEW API: STRENGTH, PDF REPORT, CYCLE ADVICE (PHASE 5)
# =========================================================

@app.post("/api/strength/log")
async def api_log_strength_record(data: StrengthRecordEntry):
    await database.save_1rm_record(data.user_id, data.exercise_name, data.weight_1rm)
    return {"status": "success"}

@app.get("/api/strength/records/{user_id}")
async def api_get_strength_records(user_id: int, exercise: Optional[str] = None):
    if exercise:
        records = await database.get_1rm_records(user_id, exercise)
        return {"status": "success", "data": records}
    
    unique_ex = await database.get_unique_1rm_exercises(user_id)
    all_records = {}
    for ex in unique_ex:
        all_records[ex] = await database.get_1rm_records(user_id, ex)
    return {"status": "success", "data": {"exercises": unique_ex, "records": all_records}}

@app.post("/api/strength/plan")
async def api_strength_plan(data: StrengthPlanRequest):
    user = await database.get_user(data.user_id)
    if not user:
        return {"status": "error"}
    # call AI service to generate a peaking plan
    plan = await ai_service.generate_peaking_plan(user, data.exercise_name, data.target_weight, data.weeks)
    return {"status": "success", "plan": plan}

@app.post("/api/report/generate")
async def api_generate_report(data: GenerateAIReportRequest):
    user = await database.get_user(data.user_id)
    if not user: return {"status": "error", "message": "User not found"}
    
    # Send TG message that report is generating
    asyncio.create_task(asyncio.to_thread(send_tg_message_sync, data.user_id, "⏳ ШІ генерує ваш детальний звіт. Це може зайняти хвилину..."))
    
    # Generate the actual PDF in background
    async def bg_generate():
        try:
            from fpdf import FPDF
            import tempfile
            
            stats = await database.get_user_stats(data.user_id)
            ai_summary = await ai_service.generate_report_summary(user, stats)
            
            pdf = FPDF()
            pdf.add_page()
            
            # Use XPos and YPos for fpdf2
            HAS_FPDF2 = False
            try:
                from fpdf.enums import XPos, YPos
                HAS_FPDF2 = True
            except ImportError:
                pass
            
            font_name = 'helvetica'
            try:
                import os
                font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
                pdf.add_font('ArialCustom', style='', fname=os.path.join(font_dir, 'arial.ttf'))
                pdf.add_font('ArialCustom', style='B', fname=os.path.join(font_dir, 'arialbd.ttf'))
                font_name = 'ArialCustom'
            except Exception:
                pass
            
            def safe_str(text: str) -> str:
                if font_name == 'helvetica':
                    return text.encode('latin-1', 'replace').decode('latin-1')
                return text

            # Using basic fonts for pdf
            pdf.set_font(font_name, size=16, style='B')
            
            athlete_name = user.get('name', 'Атлет')
            
            report_title_raw = "Fitness Hub Pro - Звіт ШІ" if font_name == 'ArialCustom' else "Fitness Hub Pro - AI Report"
            athlete_title_raw = f"Атлет: {athlete_name}" if font_name == 'ArialCustom' else f"Athlete: {athlete_name}"
            stats_text_raw = f"Всього тренувань: {stats['workouts']} | Тоннаж: {stats['volume']} кг" if font_name == 'ArialCustom' else f"Total Workouts: {stats['workouts']} | Volume: {stats['volume']} kg"
            analysis_title_raw = "ШІ-Аналіз успішності:" if font_name == 'ArialCustom' else "AI Analysis:"

            report_title = safe_str(report_title_raw)
            athlete_title = safe_str(athlete_title_raw)
            stats_text = safe_str(stats_text_raw)
            analysis_title = safe_str(analysis_title_raw)
            text_to_print = safe_str(str(ai_summary))
            
            # --- BEAUTIFUL STYLING ---
            
            # 1. Dark background
            pdf.set_fill_color(18, 18, 20)
            pdf.rect(0, 0, 210, 297, 'F')
            
            # 2. Header Banner Image
            banner_path = os.path.join("static", "img", "dashboard_dark_hero.jpg")
            if os.path.exists(banner_path):
                try:
                    pdf.image(banner_path, x=0, y=0, w=210, h=45)
                except Exception:
                    pass
            
            # 3. Position cursor below banner
            pdf.set_xy(10, 50)
            
            # 4. Draw Title
            pdf.set_text_color(255, 255, 255)
            pdf.set_font(font_name, size=24, style='B')
            if HAS_FPDF2:
                pdf.cell(0, 15, text=report_title, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align='C')
            else:
                pdf.cell(0, 15, txt=report_title, ln=True, align='C')
            
            pdf.ln(5)
            
            # 5. Draw Athlete Stats Card (Bento Style)
            pdf.set_fill_color(30, 30, 35) # card bg
            pdf.set_draw_color(191, 90, 242) # purple theme border
            pdf.set_line_width(0.6)
            pdf.set_text_color(212, 175, 55) # gold text
            pdf.set_font(font_name, size=13, style='B')
            
            stats_full = f"{athlete_title}\n{stats_text}"
            if HAS_FPDF2:
                pdf.multi_cell(0, 10, text=stats_full, border=1, fill=True, align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            else:
                pdf.multi_cell(0, 10, txt=stats_full, border=1, fill=True, align='C')
            
            pdf.ln(10)
            
            # 6. Analysis Title
            pdf.set_text_color(191, 90, 242) # Theme purple
            pdf.set_font(font_name, size=16, style='B')
            if HAS_FPDF2:
                pdf.cell(0, 10, text=analysis_title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            else:
                pdf.cell(0, 10, txt=analysis_title, ln=True)
                
            pdf.ln(2)
            
            # 7. Analysis Card (Bento Style)
            pdf.set_fill_color(25, 25, 30)
            pdf.set_draw_color(60, 60, 65)
            pdf.set_line_width(0.3)
            pdf.set_text_color(230, 230, 230)
            pdf.set_font(font_name, size=11)
            
            if HAS_FPDF2:
                pdf.multi_cell(0, 7, text=text_to_print, border=1, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            else:
                pdf.multi_cell(0, 7, txt=text_to_print, border=1, fill=True)
            
            # --- END OF STYLING ---
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                pdf_path = tmp.name
                
            pdf.output(pdf_path)
            
            # Send file to telegram
            url = f"https://api.telegram.org/bot{config.BOT_TOKEN}/sendDocument"
            form = aiohttp.FormData()
            form.add_field('chat_id', str(data.user_id))
            form.add_field('document', open(pdf_path, 'rb'), filename='Fitness_Report.pdf')
            form.add_field('caption', "🔥 Ваш персональний ШІ-звіт готовий!")
            
            async with aiohttp.ClientSession() as session:
                await session.post(url, data=form)
                
            os.remove(pdf_path)
        except Exception as e:
            logging.error(f"Report generation failed: {e}")
            send_tg_message_sync(data.user_id, "❌ Сталася помилка при генерації звіту.")
            
    asyncio.create_task(bg_generate())
    return {"status": "success"}

@app.get("/api/cycle/advice/{user_id}")
async def api_cycle_advice(user_id: int):
    user = await database.get_user(user_id)
    if not user or user.get('gender') != 'female':
        return {"status": "error", "message": "Not applicable"}
        
    today = datetime.now().strftime("%Y-%m-%d")
    symptoms = await database.get_cycle_symptoms_by_date(user_id, today) or {}
    
    cycle_day = 1
    if user.get("cycle_start_date"):
        try:
            start_date = datetime.strptime(user["cycle_start_date"], "%Y-%m-%d")
            diff = (datetime.now() - start_date).days
            c_len = user.get("cycle_length", 28)
            cycle_day = (diff % c_len) + 1 if diff >= 0 else 1
        except:
            pass
            
    advice = await ai_service.generate_daily_cycle_advice(user, symptoms, cycle_day)
    return {"status": "success", "advice": advice}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)