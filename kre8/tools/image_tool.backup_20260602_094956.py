import os
import uuid
import json
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel

# --- Configuration ---
PROJECT_ID = "agentic26"
LOCATION = "us-central1"
OUTPUT_DIR = "generated_images"

def generate_image(prompt: str) -> str:
    """
    Generates an image using Imagen on Vertex AI and saves it locally.

    Args:
        prompt: The text prompt for image generation.

    Returns:
        A JSON string containing the path to the generated image file.
    """
    print("--- Initializing Vertex AI ---")
    try:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
    except Exception as e:
        error_message = {
            "error": "Vertex AI initialization failed.",
            "details": str(e),
            "suggestion": "Ensure you have authenticated with 'gcloud auth application-default login' and the Vertex AI API is enabled for your project."
        }
        return json.dumps(error_message)

    print(f"--- Generating image for prompt: '{prompt}' ---")
    try:
        # Load the Imagen model
        model = ImageGenerationModel.from_pretrained("imagegeneration@006")

        # Generate the image
        images = model.generate_images(
            prompt=prompt,
            number_of_images=1
        )

        # Create the output directory if it doesn't exist
        os.makedirs(OUTPUT_DIR, exist_ok=True)

        # Save the image to a file
        image_bytes = images[0]._image_bytes
        file_name = f"generated_image_{uuid.uuid4().hex[:8]}.png"
        file_path = os.path.join(OUTPUT_DIR, file_name)
        
        with open(file_path, "wb") as f:
            f.write(image_bytes)

        print(f"--- Image successfully saved to: {file_path} ---")
        
        # Return the result as a JSON string
        result = {"image_path": file_path}
        return json.dumps(result)

    except Exception as e:
        error_message = {
            "error": "Image generation failed.",
            "details": str(e)
        }
        print(f"--- Error: {error_message} ---")
        return json.dumps(error_message)