
import google.generativeai as genai
import os
import json
import logging
import uuid
from google.adk.tools.tool_context import ToolContext

# --- Configuration -- -
# Configure the logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# The model name for image generation, as requested
IMAGE_MODEL = "imagen-3.0-generate-002"
# Directory to save generated images (as a fallback)
OUTPUT_DIR = "generated_images"

def generate_image(prompt: str, tool_context: ToolContext) -> dict:
    """
    Generates an image based on a text prompt, saves it as an ADK artifact,
    and optionally saves it to a local file.

    Args:
        prompt: The text prompt for image generation.
        tool_context: The ADK tool context for saving artifacts.

    Returns:
        A dictionary containing the artifact name and a success message.
    """
    request_details = {
        "model": IMAGE_MODEL,
        "prompt": prompt,
        "number_of_images": 1
    }
    logging.info(f"--- Image Generation Request ---\n{json.dumps(request_details, indent=2)}")

    try:
        # Initialize the image generation model
        model = genai.GenerativeModel(IMAGE_MODEL)

        # Generate the image content
        response = model.generate_content(
            prompt,
            generation_config={"candidate_count": 1}
        )

        if hasattr(response, 'candidates') and response.candidates:
            # Access the image bytes from the first candidate
            image_bytes = response.candidates[0].content.parts[0].data

            # Create a unique filename for the artifact
            artifact_filename = f"generated_image_{uuid.uuid4().hex[:8]}.png"

            # Save the image as an ADK artifact
            tool_context.save_artifact(
                name=artifact_filename,
                content=image_bytes,
                mime_type='image/png'
            )
            logging.info(f"--- Image successfully saved as artifact: {artifact_filename} ---")

            # (Optional) Also save to a local directory as a fallback
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            file_path = os.path.join(OUTPUT_DIR, artifact_filename)
            with open(file_path, "wb") as f:
                f.write(image_bytes)
            logging.info(f"--- Image also saved locally to: {file_path} ---")

            # Return structured artifact information
            result = {
                "artifact_name": artifact_filename,
                "message": f"Image generated and saved as artifact '{artifact_filename}'."
            }
            return result
        else:
            raise ValueError("API response did not contain valid image candidates.")

    except Exception as e:
        error_message = {
            "error": "Image generation failed.",
            "details": str(e),
            "failed_request": request_details
        }
        logging.error(f"--- Image Generation Failed ---\n{json.dumps(error_message, indent=2)}")
        return error_message
