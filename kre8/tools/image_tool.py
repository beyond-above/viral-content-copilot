import logging
from google import genai
from google.genai import types
from google.adk.tools.tool_context import ToolContext

# Initialize the modern client
client = genai.Client()

async def generate_image(prompt: str, negative_prompt: str, tool_context: ToolContext) -> dict:
    """
    Generates an image based on a text prompt using the modern google.genai SDK
    and saves it as an ADK artifact.
    Args:
        prompt: The text prompt for image generation.
        negative_prompt: The negative text prompt for image generation.
        tool_context: The ADK tool context for saving artifacts.
    Returns:
        A dictionary containing the status and artifact_id.
    """
    try:
        # Use the modern unified generation method.
        # The 'config' parameter was removed as 'aspect_ratio' and other fields
        # were causing a validation error. The model endpoint is sufficient.
        response = client.models.generate_content(
            model="gemini-3.0-pro-image-preview",
            contents=f"High-quality digital illustration: {prompt}",
            generation_config={"negative_prompt": negative_prompt}
        )
        
        # Extract raw binary data from the response part wrapper
        image_part = response.candidates[0].content.parts[0]
        image_bytes = image_part.inline_data.data
        
        # Create a unique filename for the ADK Artifact Service, placing it
        # in a logical 'generated_images' path.
        artifact_name = f"generated_images/image_{tool_context.function_call_id}.png"
        
        # Save the file into ADK's managed session storage
        await tool_context.save_artifact(
            filename=artifact_name, 
            artifact=image_bytes
        )
        
        logging.info(f"--- Image successfully generated and saved as artifact: {artifact_name} ---")
        
        # Return a structured response the agent can interpret
        return {
            "status": "success",
            "artifact_id": artifact_name,
            "message": "Image successfully generated and cached."
        }
        
    except Exception as e:
        # Send clean debug details back to the terminal log
        logging.error(f"--- IMAGE GENERATION ERROR: {str(e)} ---")
        return {"status": "failed", "error": str(e)}