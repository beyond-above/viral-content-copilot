import os
import re
import httpx
import json
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

LAST_JOB_ID = None

def clean_and_trim_prompt(prompt: str) -> str:
    """
    Sanitizes, cleans search noise/status headers, removes hashtags, and limits 
    the prompt to a maximum of 40 words before transmitting to the MCP endpoint.
    """
    # 1. Try to extract the actual prompt from quotes if present
    quoted_phrases = re.findall(r'"([^"]+)"', prompt)
    cleaned = ""
    if quoted_phrases:
        # If there are quoted parts, pick the longest one (which is usually the prompt itself)
        cleaned = max(quoted_phrases, key=len)
    else:
        cleaned = prompt

    # 2. Strip search progress headers, system markers, and introductory phrases
    cleaned = re.sub(r'🔍\s*\*\*PROGRESS:\*\*.*?(?=(?:🔍\s*\*\*PROGRESS:\*\*|✅\s*\*\*STATUS:\*\*|"|$))', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'✅\s*\*\*STATUS:\*\*.*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(?:here is the prompt for your content|here is the prompt|prompt:)', '', cleaned, flags=re.IGNORECASE)

    # 3. Strip hashtags (e.g. #TNPowervCut)
    cleaned = re.sub(r'#[a-zA-Z0-9_]+', '', cleaned)

    # 4. Clean up excess whitespace/quotes
    cleaned = cleaned.strip()
    cleaned = cleaned.replace('"', '')
    # Remove leading/trailing single quotes if they wrap the entire string
    if cleaned.startswith("'") and cleaned.endswith("'"):
        cleaned = cleaned[1:-1]

    # 5. Word trimming to max 40 words
    words = cleaned.split()
    if len(words) > 40:
        cleaned = " ".join(words[:40]) + "..."
    else:
        cleaned = " ".join(words)

    return cleaned.strip()

async def send_to_mcp(prompt: str) -> str:
    """
    Sends the final generated prompt to the MCP endpoint for artifact creation.

    Args:
        prompt: The final, user-approved prompt.

    Returns:
        A confirmation message indicating success or failure.
    """
    global LAST_JOB_ID
    endpoint_url = os.environ.get("MCP_ENDPOINT_URL")
    auth_token = os.environ.get("MCP_AUTH_TOKEN")

    if not endpoint_url or not auth_token:
        raise ValueError(
            "Missing required MCP environment variables! "
            "Please ensure both MCP_ENDPOINT_URL and MCP_AUTH_TOKEN are set."
        )

    cleaned_prompt = clean_and_trim_prompt(prompt)

    print(f"--- Connecting to MCP Endpoint via Streamable HTTP ---")
    print(f"URL: {endpoint_url}")
    print(f"Original Prompt: '{prompt}'")
    print(f"Sanitized & Trimmed Prompt: '{cleaned_prompt}'")

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
                    
                    # standard MCP client flow (initialize -> tools/list)
                    tools_result = await session.list_tools()
                    print(f"Successfully discovered {len(tools_result.tools)} tools from MCP server.")
                    
                    print(f"Calling create_auto_video with prompt: '{cleaned_prompt}'")
                    response = await session.call_tool(
                        "create_auto_video",
                        arguments={
                            "topic": cleaned_prompt,
                            "overrides": {
                                "aspect_ratio": "9:16"
                            }
                        }
                    )
                    
                    text_content = ""
                    if response.content:
                        text_content = "".join([block.text for block in response.content if hasattr(block, "text") and block.text])
                    
                    print(f"MCP create_auto_video response: {text_content}")
                    
                    # Parse the job_id and store in global LAST_JOB_ID
                    if text_content:
                        try:
                            data = json.loads(text_content)
                            parsed_id = data.get("job_id")
                            if parsed_id:
                                LAST_JOB_ID = parsed_id
                                print(f"DEBUG: Captured auto-generated job_id: '{parsed_id}'")
                        except Exception as parse_err:
                            # regex fallback
                            match = re.search(r'"job_id"\s*:\s*"([^"]+)"', text_content)
                            if match:
                                LAST_JOB_ID = match.group(1)
                                print(f"DEBUG: Captured auto-generated job_id (regex): '{LAST_JOB_ID}'")
                            else:
                                print(f"DEBUG: Failed to parse job_id from response: {parse_err}")

                    return text_content or str(response)
                    
    except Exception as e:
        error_msg = f"Failed to send prompt to MCP: {e}"
        print(error_msg)
        return f"Error: {error_msg}"
