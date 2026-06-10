from pydantic import BaseModel
from typing import Optional


class RefineRequest(BaseModel):
    instruction: str
    target_section: Optional[str] = None


class RefineResponse(BaseModel):
    id: str
    original_text: str
    suggested_text: str
    refined_text: str
    refine_count: int