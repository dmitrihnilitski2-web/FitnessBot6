import google.generativeai as genai
import json
import re
import logging
import asyncio
import io
from PIL import Image
import config

genai.configure(api_key=config.GEMINI_API_KEY)

# Dynamic routing models based on 2.5 prices
MODELS_PRO = ["gemini-2.5-pro", "gemini-2.5-flash"]
MODELS_FLASH = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
MODELS_LITE = ["gemini-2.5-flash-lite", "gemini-2.5-flash"]

def extract_json(text: str) -> dict:
    if not text: return None
    try: return json.loads(text)
    except json.JSONDecodeError: pass
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        return json.loads(match.group(0)) if match else json.loads(text)
    except Exception as e:
        logging.error(f"JSON Parse Error: {e}")
        return None

def sanitize_workout_plan(day_plan: dict) -> dict:
    """Removes heavy bloat (instructions, URLs) from plan to save tokens. User traits remain untouched."""
    if not day_plan or not isinstance(day_plan, dict): return day_plan
    clean_plan = {"focus": day_plan.get("focus", ""), "exercises": []}
    for ex in day_plan.get("exercises", []):
        clean_plan["exercises"].append({
            "name": ex.get("name"),
            "sets": ex.get("sets"),
            "reps": ex.get("reps"),
            "weight": ex.get("weight")
        })
    return clean_plan

def sanitize_nutrition_data(goals: dict) -> dict:
    """Strips unnecessary meta to save tokens."""
    if not goals or not isinstance(goals, dict): return goals
    return {k: v for k, v in goals.items() if k in ["calories", "protein", "fats", "carbs"]}

async def get_model_response(prompt: str, image=None, expect_json=True, tier="STARTER", task_type="standard"):
    gen_config = {"response_mime_type": "application/json"} if expect_json else None
    
    # Model Routing Logic
    if task_type == "micro":
        models_to_try = MODELS_LITE
    elif tier in ["FREE", "STARTER"]:
        models_to_try = MODELS_LITE if task_type == "simple" else MODELS_FLASH
    elif tier in ["PRO", "COACH_PRO", "FAMILY"]:
        models_to_try = MODELS_PRO if task_type == "complex" else MODELS_FLASH
    else:
        models_to_try = MODELS_FLASH

    for model_name in models_to_try:
        try:
            model = genai.GenerativeModel(model_name)
            content = [prompt, image] if image else prompt
            res = await model.generate_content_async(content, generation_config=gen_config)
            if expect_json:
                parsed = extract_json(res.text)
                if parsed: return parsed
            else:
                return res.text
        except Exception as e:
            logging.warning(f"Model {model_name} failed: {e}")
            continue
    return None

async def analyze_user_profile(user_data: dict, tier="FREE") -> dict:
    prompt = f"""
    Role: Sports doctor and rehab specialist.
    Analyze client data: Age {user_data.get('age')}, Weight {user_data.get('weight')}kg, Height {user_data.get('height')}cm. Goal: {user_data.get('primary_goal')}. Activity: {user_data.get('activity_level')}.
    Injuries/Notes: {user_data.get('notes', 'None')}
    CRITICAL: DO NOT USE EMOJIS.
    Output JSON ONLY: {{"risk_factors": ["r1"], "exercise_restrictions": ["ex1"], "focus_areas": ["area1"]}} (Empty arrays if none)
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")
    return res if res else {"risk_factors": [], "exercise_restrictions": [], "focus_areas": []}

async def analyze_profile_update(update_text: str, current_factors: dict, tier="FREE") -> dict:
    prompt = f"""
    Role: Sports doctor. Client update: "{update_text}". Current factors: {json.dumps(current_factors, ensure_ascii=False)}.
    Update arrays based on new data. NO EMOJIS.
    Output JSON ONLY: {{"risk_factors": [], "exercise_restrictions": [], "focus_areas": []}}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")
    return res if res else current_factors

async def generate_workout_plan(user_data: dict, ai_data: dict, cycle_phase: str = "", tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    is_female = user_data.get('gender') == 'female'
    
    femtech_prompt = "Use female pronouns." if is_female else "Use male pronouns."
    if is_female and cycle_phase in ['menstruation', 'luteal']:
        femtech_prompt += f" Phase: '{cycle_phase}'. LOWER RPE and volume. Avoid heavy lower back loads."

    prompt = f"""
    Role: Elite fitness coach & sports scientist.
    Client Data:
    - Goal: {user_data.get('primary_goal')}
    - Detailed Goal/Preferences: {user_data.get('custom_goal', 'None')}
    - Sport: {user_data.get('competition_sport', 'None')}
    - Metrics: {user_data.get('age')}y, {user_data.get('weight')}kg
    {femtech_prompt}
    - AI Restrictions: {ai_data.get('exercise_restrictions', [])}

    Task: Create a highly personalized 1-week microcycle (JSON).
    CRITICAL RULE 1: NO EMOJIS. Use markdown for styling.
    CRITICAL RULE 2: You MUST output all textual descriptions in {lang} exclusively. Do not use English in the response body!

    JSON Format:
    {{
        "plan_name": "Name",
        "explanation": "Detailed biomechanical explanation (3-4 sentences)",
        "projections": "Physical adaptation forecast (3-4 sentences)",
        "days": [
            {{ "day": 1, "focus": "Chest", "exercises": [ {{"name": "Bench Press", "sets": "4", "reps": "8-10 @ RPE 8"}} ] }}
        ]
    }}
    """
    return await get_model_response(prompt, expect_json=True, tier=tier, task_type="complex")

async def adapt_daily_workout(user_data: dict, checkin_data: dict, cycle_phase: str = "", tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    is_female = user_data.get('gender') == 'female'
    
    # Prune heavy data to save tokens
    clean_plan = sanitize_workout_plan(checkin_data.get('current_day_plan', {}))
    
    femtech_prompt = "Use female pronouns." if is_female else "Use male pronouns."
    if is_female:
        symptoms_str = json.dumps(checkin_data.get('symptoms', {}), ensure_ascii=False)
        femtech_prompt += f" Phase: '{cycle_phase}'. Symptoms: {symptoms_str}. IF pain_level > 0 OR menstruation: COMPLETELY rewrite exercises to isolation, lower RPE to 5-6, remove lower back load, add stretching."

    prompt = f"""
    Role: Pro fitness coach. Adapt today's workout.
    Cleaned Original Plan: {json.dumps(clean_plan, ensure_ascii=False)}
    State (1-10): Sleep {checkin_data.get('sleep')}, Energy {checkin_data.get('energy')}, Stress {checkin_data.get('stress')}, Soreness {checkin_data.get('soreness')}
    {femtech_prompt}

    Task: Adjust intensity based on state.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: You MUST respond in {lang} exclusively. Do not use English in the response body!

    JSON Format:
    {{
        "coach_message": "Empathetic clinical reasoning (3-4 sentences)",
        "focus": "New focus",
        "exercises": [ {{"name": "Name", "sets": "3", "reps": "12"}} ]
    }}
    """
    return await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")

async def analyze_food_photo(image_bytes: bytes, lang: str = "uk", tier="FREE") -> dict:
    prompt = f"""
    Role: Expert Nutritionist. Analyze food photo.
    CRITICAL RULE 1: NO EMOJIS. 
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"dish_name": "Name", "estimated_weight_g": 250, "calories": 450, "protein": 30, "fats": 20, "carbs": 40}}
    """
    try:
        image_obj = Image.open(io.BytesIO(image_bytes))
        res = await get_model_response(prompt, image=image_obj, expect_json=True, tier=tier, task_type="simple")
        return res if res else {"error": "Fail"}
    except Exception as e:
        logging.error(f"Photo error: {e}")
        return {"error": str(e)}

async def reanalyze_food_text_webapp(current_data: dict, correction: str, tier="FREE") -> dict:
    prompt = f"""
    Original data: {json.dumps(current_data, ensure_ascii=False)}. User correction: "{correction}".
    Recalculate macros. NO EMOJIS.
    JSON Format: {{"dish_name": "Name", "weight_g": 200, "calories": 400, "protein": 30, "fats": 20, "carbs": 40}}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="simple")
    return res if res else {"error": "Fail"}

async def identify_muscle_group(exercise_name: str) -> str:
    valid_muscles = ['chest', 'obliques', 'abs', 'biceps', 'triceps', 'forearm', 'trapezius', 'deltoids', 'upper-back', 'lower-back', 'gluteal', 'quadriceps', 'hamstring', 'adductors', 'calves', 'tibialis', 'neck']
    prompt = f"Which SINGLE main muscle group does '{exercise_name}' target? Choose ONLY ONE exact word from: {valid_muscles}. No emojis. Output only the word."
    res = await get_model_response(prompt, expect_json=False, tier="FREE", task_type="micro")
    if res:
        word = res.strip().lower()
        for v in valid_muscles:
            if v in word: return v
    return 'abs'

async def generate_exercise_instruction(exercise_name: str, lang: str = "uk", tier="FREE") -> dict:
    prompt = f"""
    Role: Pro Coach. Give short instructions for "{exercise_name}".
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"muscles": "Primary muscles", "instruction": "Step-by-step (3-4 points)"}}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="simple")
    return res if res else {"muscles": "Unknown", "instruction": "Not available."}

async def generate_recipe_from_ingredients(ingredients_text: str, cals_left: int, prot_left: int, fats_left: int, carbs_left: int, lang: str = "uk", tier="FREE") -> dict:
    target_cals = min(cals_left, 800)
    ratio = target_cals / cals_left if cals_left > 0 else 1
    prompt = f"""
    Role: Fitness Chef. Ingredients: "{ingredients_text}". Target macros per ONE MEAL: {target_cals}kcal, {int(prot_left*ratio)}g P, {int(fats_left*ratio)}g F, {int(carbs_left*ratio)}g C.
    Create a recipe. Provide exact weights.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"dish_name": "Name", "calories": 400, "protein": 30, "fats": 15, "carbs": 40, "weight_g": 350, "recipe_text": "Ingredients:\\n...\\nSteps:\\n..."}}
    """
    return await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")

async def generate_cycle_insight(user_profile: dict, symptoms: dict, cycle_day: int, tier="FREE") -> dict:
    lang = user_profile.get('language', 'uk')
    symptoms_str = json.dumps(symptoms, ensure_ascii=False) if symptoms else "None"
    prompt = f"""
    Role: Sports Endocrinologist. Female athlete, cycle length {user_profile.get('cycle_length', 28)}d. Current day: {cycle_day}. Symptoms: {symptoms_str}.
    Provide a clinical text recommendation (2-4 sentences) regarding training, nutrition, and sleep. Use female pronouns.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"insight": "Recommendation text"}}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="simple")
    return res if res else {"insight": "Listen to your body."}

async def generate_exercise_substitute(user_data: dict, exercise_name: str, tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    notes = user_data.get('notes', 'None')
    prompt = f"""
    Role: Rehab Coach. Client wants to substitute "{exercise_name}". Injuries/Notes: {notes}.
    Suggest 3 safe gym alternatives hitting similar muscles.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"substitutes": [ {{"name": "Alt 1", "reason": "Why"}} ] }}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")
    return res if res else {"substitutes": []}

async def generate_smart_grocery_list(user_data: dict, tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    clean_macros = sanitize_nutrition_data(user_data.get('nutrition_goals', {}))
    prompt = f"""
    Role: Nutritionist. Create a balanced weekly grocery list.
    Goal: {user_data.get('primary_goal')}. Macros: {json.dumps(clean_macros)}. Prefs: {user_data.get('food_preferences')}.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"proteins": ["P1"], "fats": ["F1"], "carbs": ["C1"], "vegetables": ["V1"]}}
    """
    res = await get_model_response(prompt, expect_json=True, tier=tier, task_type="standard")
    return res if res else {"proteins": [], "fats": [], "carbs": [], "vegetables": []}

async def generate_peaking_plan(user_data: dict, exercise_name: str, target_weight: float, weeks: int, tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    prompt = f"""
    Role: Elite Powerlifting Coach. Goal: 1RM Peak for "{exercise_name}" at {target_weight}kg in {weeks} weeks.
    Create a peaking program.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"plan_name": "Name", "explanation": "Methodology", "weeks": [ {{"week_number": 1, "focus": "Volume", "routine": "..."}} ] }}
    """
    return await get_model_response(prompt, expect_json=True, tier=tier, task_type="complex")

async def generate_report_summary(user_data: dict, stats: dict, tier="FREE") -> str:
    lang = user_data.get('language', 'uk')
    prompt = f"""
    Role: Senior Fitness Analyst. Write a 3-4 sentence PDF summary.
    Name: {user_data.get('name')}. Goal: {user_data.get('primary_goal')}. Stats: {stats['workouts']} workouts, {stats['volume']}kg total volume.
    CRITICAL RULE 1: NO EMOJIS. NO MARKDOWN.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    """
    res = await get_model_response(prompt, expect_json=False, tier=tier, task_type="simple")
    return res if res else "Stats analyzed. Keep training."

async def generate_daily_cycle_advice(user_data: dict, symptoms: dict, cycle_day: int, tier="FREE") -> dict:
    lang = user_data.get('language', 'uk')
    symptoms_str = json.dumps(symptoms, ensure_ascii=False) if symptoms else "None"
    prompt = f"""
    Role: Sports Endocrinologist. Daily cycle advice. Day {cycle_day}. Symptoms: {symptoms_str}.
    Provide 1-2 sentence advice on training, nutrition, recovery. Use female pronouns.
    CRITICAL RULE 1: NO EMOJIS.
    CRITICAL RULE 2: Output text in {lang} exclusively.
    JSON Format: {{"training": "Advice", "nutrition": "Advice", "recovery": "Advice"}}
    """
    return await get_model_response(prompt, expect_json=True, tier=tier, task_type="simple")