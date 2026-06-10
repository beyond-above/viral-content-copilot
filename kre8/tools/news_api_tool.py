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
    # API key has been hardcoded as requested for testing.
    api_key = "58f5cedca80d4afbad8c7be0db34cd39"

    url = f"https://newsapi.org/v2/everything?q={topic}&apiKey={api_key}&pageSize=5"

    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": f"API request failed: {e}"}
