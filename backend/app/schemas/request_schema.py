from pydantic import BaseModel


class HerbRequestCreate(BaseModel):
    herb: str
    quantity: str
    to_farmer_name: str
    to_farmer_email: str | None = None


class HerbRequestResponse(BaseModel):
    decision: str
    reason: str | None = None
