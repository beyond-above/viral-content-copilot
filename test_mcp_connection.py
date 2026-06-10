import os
import sys
import httpx
import asyncio
import json
import time
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

async def test_connection():
    endpoint_url = os.environ.get("MCP_ENDPOINT_URL")
    auth_token = os.environ.get("MCP_AUTH_TOKEN")

    if not endpoint_url or not auth_token:
        raise ValueError(
            "Missing required MCP environment variables! "
            "Please ensure both MCP_ENDPOINT_URL and MCP_AUTH_TOKEN are set."
        )

    print("==================================================")
    print("Testing MCP Connection & Auto-Video Generation Bridge")
    print("==================================================")
    print(f"Endpoint URL: {endpoint_url}")
    print(f"Auth Token: {auth_token[:10]}...{auth_token[-5:] if len(auth_token) > 10 else ''}")

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }

    async with httpx.AsyncClient(headers=headers, timeout=60.0) as client:
        async with streamable_http_client(endpoint_url, http_client=client) as (read_stream, write_stream, get_session_id):
            async with ClientSession(read_stream, write_stream) as session:
                print("\n1. Initializing MCP Client Session and listing tools...")
                await session.initialize()
                
                tools_result = await session.list_tools()
                print("\nDiscovered Tool Schemas:")
                for tool in tools_result.tools:
                    print(f"\n- Tool Name: {tool.name}")
                    print(f"  Description: {tool.description}")
                    print(f"  Input Schema: {json.dumps(tool.inputSchema, indent=2)}")

                print("\n2. Invoking create_auto_video tool...")
                mock_prompt = sys.argv[1] if len(sys.argv) > 1 else "Ice creams"
                arguments = {
                    "topic": mock_prompt,
                    "overrides": {
                        "aspect_ratio": "9:16"
                    }
                }
                print(f"Payload Arguments: {json.dumps(arguments, indent=2)}")
                
                response = await session.call_tool("create_auto_video", arguments=arguments)
                text_content = ""
                if response.content:
                    text_content = "".join([block.text for block in response.content if hasattr(block, "text") and block.text])
                
                print(f"\nRaw response from create_auto_video:\n{text_content}")
                
                # Parse job_id
                try:
                    job_data = json.loads(text_content)
                except Exception as e:
                    print(f"Error parsing JSON response: {e}")
                    return

                if "error" in job_data:
                    print(f"\n❌ Error returned by server: {job_data.get('error')} - {job_data.get('message')}")
                    return

                job_id = job_data.get("job_id")
                if not job_id:
                    print("\n❌ No job_id returned in the response!")
                    return

                print(f"\n✅ Job created successfully! Job ID: {job_id}")
                
                print("\n3. Polling get_auto_video_status every 5s...")
                start_time = time.time()
                timeout_seconds = 5 * 60  # 5 minutes timeout
                poll_interval = 5.0

                while True:
                    elapsed = time.time() - start_time
                    if elapsed > timeout_seconds:
                        print("\n❌ Timeout reached (~5 minutes) while waiting for job completion.")
                        break

                    print(f"\nChecking status (Elapsed: {int(elapsed)}s)...")
                    status_response = await session.call_tool(
                        "get_auto_video_status",
                        arguments={"job_id": job_id}
                    )
                    
                    status_text = ""
                    if status_response.content:
                        status_text = "".join([block.text for block in status_response.content if hasattr(block, "text") and block.text])

                    try:
                        status_data = json.loads(status_text)
                    except Exception as e:
                        print(f"Error parsing status JSON: {e}")
                        print(f"Raw status text: {status_text}")
                        await asyncio.sleep(poll_interval)
                        continue

                    if "error" in status_data and not status_data.get("status"):
                        print(f"❌ Error during status check: {status_data}")
                        break

                    status = status_data.get("status")
                    current_step = status_data.get("current_step")
                    progress = status_data.get("progress_pct")
                    msg = status_data.get("step_message")

                    print(f"Status: {status} | Step: {current_step} | Progress: {progress}% | Message: {msg}")

                    if status in ["completed", "failed"]:
                        print("\n==================================================")
                        print(f"🎉 Job reached terminal state: {status.upper()}")
                        print("==================================================")
                        print(json.dumps(status_data, indent=2))
                        break

                    await asyncio.sleep(poll_interval)

if __name__ == "__main__":
    asyncio.run(test_connection())
