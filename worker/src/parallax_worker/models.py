"""Pydantic models for the Parallax worker API."""

from pydantic import BaseModel


class InferRequest(BaseModel):
    id: str
    type: str
    params: dict
