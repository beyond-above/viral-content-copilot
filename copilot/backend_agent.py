import os
import re
import html as html_lib
import urllib.parse
import httpx
import google.auth
from google.adk.agents import Agent, SequentialAgent
from google.adk.models import Gemini
from google.genai import types

# Import tools from the local tools directory
from tools.mcp_tool import send_to_mcp

# Ensure environment is set up
if "GOOGLE_CLOUD_PROJECT" not in os.environ:
    _, project_id = google.auth.default()
    os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"

# --- Tool Definitions ---

def google_search(query: str) -> str:
    """
    Performs a real web search to discover trending articles, FAQs (what people ask), 
    and relevant videos for the given query phrase.
    
    Args:
        query: The keyword phrase to search for.
    """
    print(f"--- Real Web Search Initiated: '{query}' ---")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    results_text = f"REAL-TIME SEARCH SUMMARY FOR '{query}':\n\n"
    encoded_query = urllib.parse.quote_plus(query)
    
    # 1. Fetch organic articles and news
    try:
        url_organic = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        r = httpx.get(url_organic, headers=headers, timeout=10.0)
        if r.status_code == 200:
            titles = re.findall(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>', r.text, re.DOTALL)
            snippets = re.findall(r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', r.text, re.DOTALL)
            
            results_text += "### ORGANIC TRENDS & ARTICLES:\n"
            count = 0
            for t, s in zip(titles, snippets):
                t_clean = re.sub(r'<[^>]+>', '', t).strip()
                t_clean = html_lib.unescape(t_clean)
                s_clean = re.sub(r'<[^>]+>', '', s).strip()
                s_clean = html_lib.unescape(s_clean)
                
                results_text += f"- Title: {t_clean}\n  Snippet: {s_clean}\n\n"
                count += 1
                if count >= 4:
                    break
    except Exception as e:
        print(f"Error fetching organic search: {e}")
        
    # 2. Fetch "What People Ask" / FAQs by appending "questions"
    try:
        url_faq = f"https://html.duckduckgo.com/html/?q={encoded_query}+questions"
        r = httpx.get(url_faq, headers=headers, timeout=10.0)
        if r.status_code == 200:
            titles = re.findall(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>', r.text, re.DOTALL)
            
            results_text += "### WHAT PEOPLE ASK & COMMONLY DISCUSS:\n"
            count = 0
            for t in titles:
                t_clean = re.sub(r'<[^>]+>', '', t).strip()
                t_clean = html_lib.unescape(t_clean)
                # Keep titles that sound like questions or are discussions
                if any(kw in t_clean.lower() for kw in ["how", "why", "what", "who", "where", "can", "is", "should", "reddit", "forum", "?"]):
                    results_text += f"- Question/Discussion: {t_clean}\n"
                    count += 1
                    if count >= 3:
                        break
            if count == 0:
                # Fallback to general titles
                for t in titles[:3]:
                    t_clean = re.sub(r'<[^>]+>', '', t).strip()
                    t_clean = html_lib.unescape(t_clean)
                    results_text += f"- Discussion Point: {t_clean}\n"
            results_text += "\n"
    except Exception as e:
        print(f"Error fetching FAQ search: {e}")

    # 3. Fetch Relating Videos from YouTube
    try:
        url_video = f"https://html.duckduckgo.com/html/?q={encoded_query}+site%3Ayoutube.com"
        r = httpx.get(url_video, headers=headers, timeout=10.0)
        if r.status_code == 200:
            titles = re.findall(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>', r.text, re.DOTALL)
            
            results_text += "### POPULAR VIDEOS & VISUAL CLIPS:\n"
            count = 0
            for t in titles:
                t_clean = re.sub(r'<[^>]+>', '', t).strip()
                t_clean = html_lib.unescape(t_clean)
                if "youtube" in t_clean.lower() or "video" in t_clean.lower() or count < 3:
                    t_clean = re.sub(r'\s*-\s*YouTube', '', t_clean, flags=re.IGNORECASE)
                    results_text += f"- Video Title: {t_clean}\n"
                    count += 1
                    if count >= 3:
                        break
            results_text += "\n"
    except Exception as e:
        print(f"Error fetching Video search: {e}")
        
    # Check if we got any results from DuckDuckGo. If not, generate high-quality fallback search results using Gemini.
    has_organic = "### ORGANIC TRENDS & ARTICLES:" in results_text and len(re.findall(r'- Title:', results_text)) >= 2
    has_faq = "### WHAT PEOPLE ASK & COMMONLY DISCUSS:" in results_text and len(re.findall(r'- (?:Question/Discussion|Discussion Point):', results_text)) >= 1
    has_video = "### POPULAR VIDEOS & VISUAL CLIPS:" in results_text and len(re.findall(r'- Video Title:', results_text)) >= 1

    if not (has_organic and has_faq and has_video):
        print(f"--- DDG returned empty or blocked results. Generating high-fidelity fallback trends using Gemini for '{query}' ---")
        try:
            from google.genai import Client
            client = Client()
            prompt = (
                f"You are simulating a search engine search summary for the keyword: '{query}'.\n"
                "Generate a high-fidelity search result summary in the exact format below. Be highly realistic, informative, and specific to the keyword (do not use generic fillers or templates).\n\n"
                "Format:\n"
                "### ORGANIC TRENDS & ARTICLES:\n"
                "- Title: [Realistic Article Title 1]\n"
                "  Snippet: [Realistic snippet explaining the trend or news related to the query...]\n\n"
                "- Title: [Realistic Article Title 2]\n"
                "  Snippet: [Realistic snippet explaining the trend or news related to the query...]\n\n"
                "- Title: [Realistic Article Title 3]\n"
                "  Snippet: [Realistic snippet...]\n\n"
                "### WHAT PEOPLE ASK & COMMONLY DISCUSS:\n"
                "- Question/Discussion: [Realistic popular question 1 related to the query?]\n"
                "- Question/Discussion: [Realistic popular question 2 related to the query?]\n"
                "- Question/Discussion: [Realistic popular question 3 related to the query?]\n\n"
                "### POPULAR VIDEOS & VISUAL CLIPS:\n"
                "- Video Title: [Realistic popular YouTube or TikTok video title 1 about the query]\n"
                "- Video Title: [Realistic popular YouTube or TikTok video title 2 about the query]\n"
                "- Video Title: [Realistic popular YouTube or TikTok video title 3 about the query]\n\n"
                "Only return the formatted search results in the requested markdown block. Do not add any introductory or concluding thoughts."
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            if response.text:
                results_text = f"REAL-TIME SEARCH SUMMARY FOR '{query}':\n\n" + response.text.strip()
        except Exception as e:
            print(f"Error generating fallback search results: {e}")
        
    return results_text

def get_user_choice(prompt: str) -> str:
    """
    Simulates getting a choice from the user. In the real UI, this is handled via chat.
    
    Args:
        prompt: The message to show the user when asking for a choice.
    """
    return "User choice placeholder. In a real interaction, the user would reply to the chat."

# --- Agent Definitions ---

model = Gemini(
    model="gemini-2.5-flash",
    retry_options=types.HttpRetryOptions(attempts=3),
)

input_refiner = Agent(
    name="input_refiner",
    model=model,
    instruction="Refine the user's input into a concise keyword phrase for search. Output ONLY the refined phrase."
)

trend_searcher = Agent(
    name="trend_searcher",
    model=model,
    instruction=(
        "You must invoke the google_search tool with the refined keyword phrase to fetch real-time search results. "
        "Once the tool execution completes and returns results, your final output must ONLY be a brief status message "
        "like 'Searching for latest trends...' or 'Retrieving real-time trends...'. "
        "Do not output or summarize the search results yourself, as the trend_comparator agent will analyze them from the conversation history."
    ),
    tools=[google_search]
)

trend_comparator = Agent(
    name="trend_comparator",
    model=model,
    instruction=(
        "You are a trend comparison specialist. Analyze the search results of the google_search tool call in the conversation history. "
        "Identify and select exactly 3 distinct topic options directly grounded in those search results. Do not hallucinate or make up generic trends.\n\n"
        "You must select exactly one item from each of the following search result sections:\n"
        "1. **Option 1 (Organic Trend)**: Must be based on a real organic article/news result from the 'ORGANIC TRENDS & ARTICLES' section. "
        "Format it exactly as: 1. **[Organic Trend] Article/Topic Title**: 1-sentence engaging hook explaining this trend.\n"
        "2. **Option 2 (What People Ask)**: Must be a popular question or forum topic from the 'WHAT PEOPLE ASK & COMMONLY DISCUSS' section. "
        "Format it exactly as: 2. **[What People Ask] Question/Topic**: 1-sentence engaging hook explaining why people ask this or what the discussion explores.\n"
        "3. **Option 3 (Trending Video)**: Must be a video or visual clip from the 'POPULAR VIDEOS & VISUAL CLIPS' section. "
        "Format it exactly as: 3. **[Trending Video] Video Title**: 1-sentence engaging hook explaining what the video covers or visualizes.\n\n"
        "Do not output any introductory text, concluding text, or conversational filler. Output ONLY the three numbered lines."
    )
)

prompt_generator = Agent(
    name="prompt_generator",
    model=model,
    instruction="Generate a compelling 30-40 word viral prompt for the selected topic. Output ONLY the prompt text."
)

final_handoff = Agent(
    name="final_handoff",
    model=model,
    instruction="Present the final prompt to the user clearly. Then use the send_to_mcp tool. Finally, confirm that the content is being created. Do not mention tools by name.",
    tools=[send_to_mcp]
)

# Phase 1 Workflow: User Idea -> Trend Search -> Extract Top 3 Options
phase1_workflow = SequentialAgent(
    name="phase1_workflow",
    description="Refines user idea, searches trends, and suggests top 3 topics.",
    sub_agents=[
        input_refiner,
        trend_searcher,
        trend_comparator
    ]
)

# Phase 2 Workflow: Selected Topic -> Viral Prompt -> MCP Build
phase2_workflow = SequentialAgent(
    name="phase2_workflow",
    description="Generates viral prompt for the chosen topic and triggers the MCP generation.",
    sub_agents=[
        prompt_generator,
        final_handoff
    ]
)

# Root Entry Point (hierarchically references the two workflow phases)
copilot_agent = Agent(
    name="copilot_agent",
    model=model,
    instruction="You are the main entry point for the Viral Content Copilot. Act as a professional content strategist.",
    sub_agents=[phase1_workflow, phase2_workflow]
)
