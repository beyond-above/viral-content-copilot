import os
from google import genai

# 1. Load the API key from your root directory
key_path = os.path.expanduser('~/API_KEY.txt')
if os.path.exists(key_path):
    with open(key_path, 'r') as f:
        os.environ["GEMINI_API_KEY"] = f.read().strip()
else:
    print("Could not find ~/API_KEY.txt. Make sure your key is set!")

# 2. Initialize the client
client = genai.Client()
project_path = '/home/snapabi33/viral-content-factory/viral-content-factory/kre8'

# 3. Request clean configs from Gemini
for filename in ['news_workflow.yaml', 'trend_discovery_workflow.yaml']:
    filepath = os.path.join(project_path, filename)
    
    prompt = f"""
    Act as a Google ADK expert. Generate a valid sub-agent YAML configuration file named {filename}. 
    It MUST contain these top-level keys required by Pydantic:
    name: {filename.split('.')[0]}
    model: gemini-2.5-pro-preview-0520
    agent_class: LlmAgent
    instruction: A meaningful, descriptive instruction for what a {filename.split('_')[0]} workflow agent should do.
    sub_agents: []
    tools: []
    
    Return ONLY the raw clean YAML text properties. Do NOT wrap it in markdown code blocks like ```yaml.
    """
    
    print(f"Asking Gemini to build {filename}...")
    response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
    
    # Strip away any accidental markdown wrapping if the model ignores instructions
    clean_yaml = response.text.replace('```yaml', '').replace('```', '').strip()
    
    with open(filepath, 'w') as f:
        f.write(clean_yaml)
    print(f"Successfully fixed {filename}!")
