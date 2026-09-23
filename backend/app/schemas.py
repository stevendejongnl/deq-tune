from __future__ import annotations

from pydantic import BaseModel

from app.eq_data import TuningData


class ProfileRead(BaseModel):
    id: int
    name: str
    source: str
    brand_name: str | None
    car_model: str | None
    speaker_type: str | None
    supported_processors: list[str]
    data: TuningData


class ProfileCreate(BaseModel):
    name: str
    data: TuningData
    brand_name: str | None = None
    car_model: str | None = None
    speaker_type: str | None = None
    supported_processors: list[str] = []


class ProfileUpdate(BaseModel):
    name: str | None = None
    data: TuningData | None = None
