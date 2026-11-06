"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr


class UserCreate(BaseModel):
    """User registration schema."""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="Secure password")
    name: Optional[str] = Field(None, max_length=100, description="User's full name")


class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: str
    name: Optional[str] = None
    role: str = "user"
    is_admin: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token response schema."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(default=2592000)  # 30 days in seconds


class TokenPayload(BaseModel):
    """JWT token payload schema."""
    sub: Optional[str] = None
    role: Optional[str] = "user"
    exp: Optional[int] = None


class JobCreate(BaseModel):
    """Job creation schema."""
    title: str = Field(..., max_length=255)
    company: str = Field(..., max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    salary_min_lpa: Optional[float] = Field(None, ge=0)
    salary_max_lpa: Optional[float] = Field(None, ge=0)
    job_type: Optional[str] = None
    experience_min: Optional[int] = Field(None, ge=0)
    experience_max: Optional[int] = Field(None, ge=0)
    external_id: Optional[str] = None
    job_url: str
    source: Optional[str] = "linkedin"


class JobResponse(JobCreate):
    """Job response schema."""
    id: int
    posted_at: datetime
    scraped_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True


class ApplicationCreate(BaseModel):
    """Application creation schema."""
    job_id: int


class ApplicationResponse(BaseModel):
    """Application response schema."""
    id: int
    status: str
    cover_letter: Optional[str] = None
    notes: Optional[str] = None
    interview_date: Optional[datetime] = None
    offer_salary_lpa: Optional[float] = None
    applied_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str = Field(..., min_length=8)


class TOTPSetup(BaseModel):
    """TOTP setup response."""
    secret: str
    qr_code: str


class TOTPVerify(BaseModel):
    """TOTP verification."""
    code: str = Field(..., min_length=6, max_length=6)
    secret: str = Field("", description="TOTP secret (optional, uses user's saved secret if empty)")