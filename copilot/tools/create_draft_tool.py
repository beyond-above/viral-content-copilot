def create_draft(content: str) -> dict:
  """
  Creates a draft with the given content.

  Args:
    content: The content of the draft.

  Returns:
    A dictionary with a success message.
  """
  print(f"Creating draft with content: {content}")
  return {"status": "Draft created successfully"}