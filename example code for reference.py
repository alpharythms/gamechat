from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import aiohttp
import os
import json
import gzip
from dotenv import load_dotenv
import base64
import time
import asyncio
import re

# --- Configuration ---
load_dotenv()
VENICE_API_KEY = os.getenv("VENICE_API_KEY")
VENICE_TEXT_API_ENDPOINT = "https://api.venice.ai/api/v1/chat/completions"
VENICE_IMAGE_API_ENDPOINT = "https://api.venice.ai/api/v1/image/generate"

# --- Image Generation Constants ---
IMAGE_GENERATION_DELAY = 10
IMAGE_GENERATION_RETRY_DELAY = 5
MAX_IMAGE_GENERATION_RETRIES = 3

# --- FastAPI App ---
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- Game Data Loading ---
with open("gameInstructions.txt", "r") as f:
    GAME_INSTRUCTIONS = f.read()

with open("static/initialGameState.txt", "r") as f:
    INITIAL_GAME_STATE = f.read()

# Initialize the conversation history (only the initial user prompt)
conversation_history = ""

# --- Data Models ---
class ChatInput(BaseModel):
    user_input: str

class ImageInput(BaseModel):
    prompt: str
    model: str

# --- Helper Functions ---
async def make_image_request(image_data: dict) -> bytes:
    """
    Makes a request to the Venice AI image generation API.
    Handles retries.
    """
    global last_image_request_time
    global IMAGE_GENERATION_DELAY
    retries = 0

    headers = {
        "Authorization": f"Bearer {VENICE_API_KEY}",
        "Content-Type": "application/json",
    }

    async with aiohttp.ClientSession() as client:
        while retries < MAX_IMAGE_GENERATION_RETRIES:
            try:
                # Rate limiting
                if 'last_image_request_time' in globals() and last_image_request_time is not None:
                    time_since_last_request = time.monotonic() - last_image_request_time
                    if time_since_last_request < IMAGE_GENERATION_DELAY:
                        wait_time = IMAGE_GENERATION_DELAY - time_since_last_request
                        print(f"Waiting {wait_time:.2f} seconds...")
                        await asyncio.sleep(wait_time)

                print(f"Image Request Data: {json.dumps(image_data)}")
                async with client.post(
                    VENICE_IMAGE_API_ENDPOINT, headers=headers, json=image_data, timeout=180.0
                ) as response:
                    print(f"Image API Status Code: {response.status}")
                    print(f"Image API Headers: {response.headers}")

                    if response.status == 429:
                        print(f"Received 429.")
                        retry_after = response.headers.get("Retry-After")
                        if retry_after:
                            try:
                                retry_seconds = int(retry_after)
                                print(f"Waiting {retry_seconds} seconds (Retry-After).")
                                IMAGE_GENERATION_DELAY = retry_seconds + IMAGE_GENERATION_RETRY_DELAY
                            except ValueError:
                                print("Could not parse Retry-After.")
                                IMAGE_GENERATION_DELAY += IMAGE_GENERATION_RETRY_DELAY
                        else:
                            print("No Retry-After. Using default.")
                            IMAGE_GENERATION_DELAY += IMAGE_GENERATION_RETRY_DELAY
                        raise aiohttp.ClientError(f"429 Error: {response.reason}")

                    response.raise_for_status()
                    last_image_request_time = time.monotonic()
                    IMAGE_GENERATION_DELAY = 5  # Reset delay

                    content_encoding = response.headers.get("Content-Encoding")
                    if content_encoding == "gzip":
                        image_data = gzip.decompress(await response.read())
                    else:
                        image_data = await response.read()
                    return image_data

            except aiohttp.ClientError as e:
                print(f"Error (Retry {retries + 1}/{MAX_IMAGE_GENERATION_RETRIES}): {e}")
                retries += 1
                if retries < MAX_IMAGE_GENERATION_RETRIES:
                    print(f"Retrying in {IMAGE_GENERATION_RETRY_DELAY} seconds...")
                    await asyncio.sleep(IMAGE_GENERATION_RETRY_DELAY)
                else:
                    print(f"Max retries reached.")
                    raise
            except Exception as e:
                print(f"Unexpected error: {e}")
                raise

        raise Exception("Max retries reached")

@app.post("/generate_image")
async def generate_image(image_input: ImageInput):
    """Generates an image based on a prompt and model."""
    prompt = image_input.prompt
    model = image_input.model
    print(model)

    headers = {
        "Authorization": f"Bearer {VENICE_API_KEY}",
        "Content-Type": "application/json",
    }
    image_data = {
        "model": model,
        "prompt": prompt,
        "width": 1024,
        "height": 1024,
        "steps": 30,
        "safe_mode": False,
        "hide_watermark": True,
        "cfg_scale": 5.0,
        "style_preset": "Photographic",
        "return_binary": True
    }
    try:
        raw_image_data = await make_image_request(image_data)
        encoded_image = base64.b64encode(raw_image_data).decode("utf-8")
        print(f"Image generated. Base64 (first 50 chars): {encoded_image[:50]}...")
        return {"image_data": encoded_image}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    global conversation_history
    try:
        while True:
            print("WebSocket: Receiving game state...")
            current_game_state = await websocket.receive_text()
            print(f"WebSocket: Game state received: {current_game_state[:100]}...")

            print("WebSocket: Receiving user message...")
            user_message = await websocket.receive_text()
            print(f"WebSocket: User message received: {user_message}")

            # --- Build conversation_history (Corrected) ---
            # We use the *full* response, and strip out think/gamestate *before* adding to history
            conversation_history += f"User: {user_message}<|endofsentence|>Assistant: "

            full_prompt = f"<SYSTEM_PROMPT>\n{GAME_INSTRUCTIONS}\n<gameState>{current_game_state}</gameState>\n</SYSTEM_PROMPT>\n\n{conversation_history}"
            print(f"Full Prompt (first 200 chars): {full_prompt[:200]}...")

            headers = {
                "Authorization": f"Bearer {VENICE_API_KEY}",
                "Content-Type": "application/json",
            }
            data = {
                "model": "deepseek-r1-671b",
                "messages": [{"role": "user", "content": full_prompt}],
                "temperature": 0.6,
                "stop": ["<|endofsentence|>"],
                "stream": True,
                "venice_parameters": {
                "include_venice_system_prompt": False
                }
            }
            print(f"Text API Request Data: {json.dumps(data)[:200]}...")

            await websocket.send_text(f"JSON_PAYLOAD: {json.dumps(data)}")

            try:
                async with aiohttp.ClientSession() as client:
                    print("Text API: Sending request...")
                    async with client.post(
                        VENICE_TEXT_API_ENDPOINT, headers=headers, json=data, timeout=180.0
                    ) as response:
                        print(f"Text API Status Code: {response.status}")
                        print(f"Text API Headers: {response.headers}")

                        if response.status != 200:
                            error_detail = await response.text()
                            print(f"Text API Error: {response.status}, {error_detail[:200]}...")
                            response.raise_for_status()

                        full_ai_response = "" # Accumulate *everything* (for processFullResponse)

                        async for chunk in response.content.iter_any():
                            raw_chunk = chunk
                            decoded_chunk = chunk.decode("utf-8", errors="ignore")
                            if decoded_chunk:
                                print(f"Raw Chunk (server): {raw_chunk[:100]}...")

                                for sse_event in decoded_chunk.split("\n\n"):
                                    sse_event = sse_event.strip()
                                    if not sse_event:
                                        continue

                                    if sse_event.startswith("data:"):
                                        data_str = sse_event[5:].strip()

                                        try:
                                            json_data = json.loads(data_str)

                                            if "choices" in json_data and json_data["choices"]:
                                                content_chunk = json_data["choices"][0]["delta"].get("content", "")
                                                if content_chunk:
                                                    full_ai_response += content_chunk  # Add to the full response
                                                    await websocket.send_text(f"AI: {content_chunk}")
                                            else:
                                                print("No 'choices'.")

                                        except json.JSONDecodeError as e:
                                            print(f"JSONDecodeError: {e}")
                                            print(f"Problematic data: {data_str[:100]}...")
                                        except Exception as e:
                                            print(f"Chunk error: {e}")

                        await websocket.send_text(f"AI: MESSAGE_COMPLETE")
                        cleaned_response = re.sub(r'<think>.*?</think>', '', full_ai_response, flags=re.DOTALL)
                        cleaned_response = re.sub(r'<gameState>.*?</gameState>', '', cleaned_response, flags=re.DOTALL)
                        cleaned_response = re.sub(r'<image.*?>.*?</image>', '', cleaned_response, flags=re.DOTALL)
                        conversation_history += f"{cleaned_response}<|endofsentence|>"
                        print("Text API: Response processed.")

            except aiohttp.ClientError as e:
                await websocket.send_text(f"Error: {e}")
                print(f"Text API aiohttp.ClientError: {e}")
            except Exception as e:
                await websocket.send_text(f"Error: {e}")
                print(f"Text API Exception: {e}")

    except WebSocketDisconnect:
        print("Client disconnected")      