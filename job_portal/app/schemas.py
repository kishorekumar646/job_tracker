"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    name: Optional[str] = Field(None, max_length=100)
    date_of_birth: Optional[str] = Field(None, max_length=10)
    roll_number: Optional[str] = Field(None, max_length=50)


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str = "user"
    is_admin: bool = False
    is_approved: bool = False
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    dob_update_count: Optional[int] = None
    avatar_url: Optional[str] = None
    receive_announcements: Optional[bool] = True
    permissions: Optional[list[str]] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 2592000


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class JobCreate(BaseModel):
    title: str = Field(..., max_length=255)
    company: str = Field(..., max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    external_link: Optional[str] = None
    application_date: Optional[datetime] = None


class JobResponse(BaseModel):
    id: int
    title: str
    company: str
    location: Optional[str] = None
    description: Optional[str] = None
    external_link: Optional[str] = None
    application_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicationCreate(BaseModel):
    job_id: int
    notes: Optional[str] = None


class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    notes: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True