from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import json
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

# Load environment variables from the parent directory's .env file
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=True)
print(f"DEBUG: GOOGLE_CLOUD_PROJECT={os.environ.get('GOOGLE_CLOUD_PROJECT')}")

import re

from backend_agent import copilot_agent, phase1_workflow, phase2_workflow
from tools.mcp_tool import clean_and_trim_prompt
from google.adk.runners import InMemoryRunner
from google.genai import types
import uvicorn

app = FastAPI(title="Viral Content Copilot Backend")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ADK Runners for overall and individual phases
runner = InMemoryRunner(agent=copilot_agent)
phase1_runner = InMemoryRunner(agent=phase1_workflow)
phase2_runner = InMemoryRunner(agent=phase2_workflow)

# In-memory session state tracker
SESSION_STATES = {} # session_id -> {"step": "START", "choices": []}

def parse_choices_from_text(text: str) -> list[str]:
    choices = []
    # 1. Try to find **Topic Title** after a number
    matches = re.findall(r'\d+\.\s+\*\*([^*]+)\*\*', text)
    if matches:
        choices = [m.strip() for m in matches]
    else:
        # 2. Fallback to number followed by title up to the colon
        matches = re.findall(r'\d+\.\s+([^:]+)', text)
        choices = [m.strip() for m in matches]
    return [c for c in choices if c][:3]

@app.post("/chat")
async def chat(request: Request):
    import tools.mcp_tool
    tools.mcp_tool.LAST_JOB_ID = None

    data = await request.json()
    message = data.get("message")
    user_id = data.get("user_id") or "default_user"
    session_id = data.get("session_id") or "default_session"
    
    # Check session state
    if session_id not in SESSION_STATES:
        SESSION_STATES[session_id] = {"step": "START", "choices": []}
        
    state_info = SESSION_STATES[session_id]
    step = state_info.get("step", "START")
    
    # Ensure session exists in runners
    for r in [runner, phase1_runner, phase2_runner]:
        try:
            sess = r.session_service.get_session_sync(
                session_id=session_id,
                user_id=user_id,
                app_name=r.app_name
            )
            if sess is None:
                r.session_service.create_session_sync(
                    session_id=session_id, 
                    user_id=user_id,
                    app_name=r.app_name
                )
        except Exception:
            try:
                r.session_service.create_session_sync(
                    session_id=session_id, 
                    user_id=user_id,
                    app_name=r.app_name
                )
            except Exception:
                pass
    
    response_text = ""
    choices = []
    next_step = "START"
    
    try:
        if step == "AWAITING_TOPIC_CHOICE":
            print(f"DEBUG: Processing user selection in Phase 2: '{message}'")
            # Run phase 2
            async for event in phase2_runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(parts=[types.Part(text=message)], role="user"),
            ):
                if event.content and event.content.role == "model":
                    text = "".join([p.text for p in event.content.parts if p.text]).strip()
                    if not text:
                        continue
                    
                    if event.author == "prompt_generator":
                        response_text += f"✨ **GENERATED PROMPT:**\n{text}\n\n"
                    elif event.author == "final_handoff":
                        if "Here is the prompt" in text or "prompt" in text.lower():
                            response_text += f"✨ **GENERATED PROMPT:**\n{text}\n\n"
                        else:
                            response_text += f"✅ **STATUS:**\n{text}\n\n"
            
            # Reset state back to START on completion of Phase 2
            SESSION_STATES[session_id] = {"step": "START", "choices": []}
            next_step = "START"
            
        else:
            print(f"DEBUG: Processing user topic input in Phase 1: '{message}'")
            
            # Clear previous session history to avoid context contamination
            for r in [runner, phase1_runner, phase2_runner]:
                try:
                    await r.session_service.delete_session(
                        app_name=r.app_name,
                        user_id=user_id,
                        session_id=session_id
                    )
                except Exception as e:
                    print(f"Error clearing session context for fresh run: {e}")
                
                # Re-create empty session
                try:
                    r.session_service.create_session_sync(
                        session_id=session_id, 
                        user_id=user_id,
                        app_name=r.app_name
                    )
                except Exception:
                    pass

            # Run phase 1
            async for event in phase1_runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(parts=[types.Part(text=message)], role="user"),
            ):
                if event.content and event.content.role == "model":
                    text = "".join([p.text for p in event.content.parts if p.text]).strip()
                    if not text:
                        continue
                    
                    if event.author == "trend_searcher":
                        response_text += f"🔍 **PROGRESS:**\n{text}\n\n"
                    elif event.author == "trend_comparator":
                        response_text += f"{text}\n\n"
            
            # Parse choices from response_text
            choices = parse_choices_from_text(response_text)
            if choices:
                print(f"DEBUG: Successfully parsed {len(choices)} choices: {choices}")
                SESSION_STATES[session_id] = {"step": "AWAITING_TOPIC_CHOICE", "choices": choices}
                next_step = "AWAITING_TOPIC_CHOICE"
            else:
                print("DEBUG: No choices could be parsed from response. Keeping START step.")
                SESSION_STATES[session_id] = {"step": "START", "choices": []}
                next_step = "START"
                
        if not response_text:
            response_text = "✨ **Processing complete.** Your viral content is ready!"
            
    except Exception as e:
        response_text = f"Error: {str(e)}"
        SESSION_STATES[session_id] = {"step": "START", "choices": []}
        next_step = "START"
    
    job_id = tools.mcp_tool.LAST_JOB_ID
    if job_id:
        print(f"DEBUG: Returning auto-generated job_id in /chat response: '{job_id}'")

    return {
        "message": response_text.strip(), 
        "job_id": job_id,
        "choices": choices,
        "step": next_step
    }

@app.post("/api/create_auto_video")
async def create_auto_video_api(request: Request):
    data = await request.json()
    raw_topic = data.get("topic") or ""
    topic = clean_and_trim_prompt(raw_topic)
    print(f"DEBUG: /api/create_auto_video received raw_topic: '{raw_topic}'")
    print(f"DEBUG: Sanatized/Trimmed topic: '{topic}'")
    overrides = data.get("overrides") or {}
    
    endpoint_url = os.environ.get(
        "MCP_ENDPOINT_URL", 
        "https://frcusgsfxbgrkvslksaz.supabase.co/functions/v1/mcp-auto-video"
    )
    auth_token = os.environ.get(
        "MCP_AUTH_TOKEN", 
        "mcp_agent_demo_v1_8k9p2q4r6s8t1w3x5y7z9bd"
    )

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }

    try:
        async with httpx.AsyncClient(headers=headers, timeout=60.0) as client:
            async with streamable_http_client(endpoint_url, http_client=client) as (read_stream, write_stream, get_session_id):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    
                    response = await session.call_tool(
                        "create_auto_video",
                        arguments={
                            "topic": topic,
                            "overrides": overrides
                        }
                    )
                    
                    text_content = ""
                    if response.content:
                        text_content = "".join([block.text for block in response.content if hasattr(block, "text") and block.text])
                    
                    return json.loads(text_content)
    except Exception as e:
        return {"error": "internal_error", "message": str(e)}

@app.get("/api/get_auto_video_status")
async def get_auto_video_status_api(job_id: str):
    endpoint_url = os.environ.get(
        "MCP_ENDPOINT_URL", 
        "https://frcusgsfxbgrkvslksaz.supabase.co/functions/v1/mcp-auto-video"
    )
    auth_token = os.environ.get(
        "MCP_AUTH_TOKEN", 
        "mcp_agent_demo_v1_8k9p2q4r6s8t1w3x5y7z9bd"
    )

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }

    try:
        async with httpx.AsyncClient(headers=headers, timeout=60.0) as client:
            async with streamable_http_client(endpoint_url, http_client=client) as (read_stream, write_stream, get_session_id):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    
                    response = await session.call_tool(
                        "get_auto_video_status",
                        arguments={"job_id": job_id}
                    )
                    
                    text_content = ""
                    if response.content:
                        text_content = "".join([block.text for block in response.content if hasattr(block, "text") and block.text])
                    
                    return json.loads(text_content)
    except Exception as e:
        return {"error": "internal_error", "message": str(e)}

@app.post("/api/cancel_auto_video")
async def cancel_auto_video_api(request: Request):
    data = await request.json()
    job_id = data.get("job_id")
    
    endpoint_url = os.environ.get(
        "MCP_ENDPOINT_URL", 
        "https://frcusgsfxbgrkvslksaz.supabase.co/functions/v1/mcp-auto-video"
    )
    auth_token = os.environ.get(
        "MCP_AUTH_TOKEN", 
        "mcp_agent_demo_v1_8k9p2q4r6s8t1w3x5y7z9bd"
    )

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }

    try:
        async with httpx.AsyncClient(headers=headers, timeout=60.0) as client:
            async with streamable_http_client(endpoint_url, http_client=client) as (read_stream, write_stream, get_session_id):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    
                    response = await session.call_tool(
                        "cancel_auto_video",
                        arguments={"job_id": job_id}
                    )
                    
                    text_content = ""
                    if response.content:
                        text_content = "".join([block.text for block in response.content if hasattr(block, "text") and block.text])
                    
                    return json.loads(text_content)
    except Exception as e:
        return {"error": "internal_error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
