import os
import requests

def get_news(topic: str) -> dict:
    """
    Searches for news articles on a specific topic using the NewsAPI.

    Args:
        topic: The topic to search for news articles about.

    Returns:
        A dictionary containing the top headlines for the topic,
        or an error message if the API call fails.
    """
    # TODO: Replace 'YOUR_NEWS_API_KEY' with your actual key from newsapi.org.
    # You can also store it as an environment variable for better security.
    api_key = os.environ.get("NEWS_API_KEY", "YOUR_NEWS_API_KEY")

    if api_key == "YOUR_NEWS_API_KEY":
        return {
            "error": "API key not configured. Please edit tools/news_api_tool.py"
        }

    url = f"https://newsapi.org/v2/everything?q={topic}&apiKey={api_key}&pageSize=5"

    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": f"API request failed: {e}"}
