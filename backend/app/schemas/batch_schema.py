from pydantic import BaseModel


class BatchCreate(BaseModel):
    farmer_name: str
    herb_name: str | None = None
    quantity: int

    # 🌍 Location (from frontend GPS later)
    location: str

    # OPTIONAL (for future upgrade)
    latitude: float | None = None
    longitude: float | None = None