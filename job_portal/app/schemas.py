"""
Author: Kishore Kumar
Pydantic request/response schemas.
"""

from datetime import date, datetime
from typing import Annotated, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator

# Naive datetimes in the DB are UTC; emit them with a Z so browsers parse correctly.
UTCDateTime = Annotated[
    datetime,
    PlainSerializer(
        lambda d: d.isoformat() + "Z" if d.tzinfo is None else d.isoformat(), return_type=str
    ),
]

ApplicationStatusLiteral = Literal[
    "applied", "shortlisted", "interview_scheduled", "interview_completed",
    "offer", "rejected", "withdrawn", "to_apply",
]
JobSourceLiteral = Literal[
    "linkedin", "naukri", "indeed", "glassdoor", "foundit", "instahyre", "manual", "other",
]


def _clean_list(values: list[str], max_items: int = 30, max_len: int = 80) -> list[str]:
    """Trim, drop blanks and de-duplicate (case-insensitive) while keeping order."""
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        v = " ".join(str(v).split())[:max_len]
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out[:max_items]


# ---------- auth ----------

class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    date_of_birth: date
    email: EmailStr

    @field_validator("date_of_birth")
    @classmethod
    def _valid_dob(cls, v: date) -> date:
        today = date.today()
        if v >= today or v.year < today.year - 100:
            raise ValueError("Enter a valid date of birth")
        return v

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Name is too short")
        return v

    @field_validator("email")
    @classmethod
    def _gmail_only(cls, v: str) -> str:
        if not v.lower().endswith("@gmail.com"):
            raise ValueError("Only @gmail.com email addresses can sign up")
        return v


class SignupResponse(BaseModel):
    message: str
    email: str
    totp_secret: str
    otpauth_url: str
    qr_code: str  # PNG data URI for the authenticator app


class ActivationResponse(BaseModel):
    message: str
    user: "UserOut"


class OtpRequest(BaseModel):
    """Used for both account activation and login."""
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    role: str = "user"
    email_verified: bool = False
    receive_announcements: bool = True
    plan: str = "free"
    plan_expires_at: Optional[UTCDateTime] = None
    pro_welcome_pending: bool = False
    created_at: Optional[UTCDateTime] = None


class AuthResponse(BaseModel):
    user: UserOut
    expires_at: int
    refresh_expires_at: Optional[int] = None
    server_time: int


class PasskeyCode(BaseModel):
    otp: str = Field(..., pattern=r"^\d{6}$")


class PasskeyFinish(BaseModel):
    challenge: str = Field(..., min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    credential: dict
    name: str = Field(default="My device", min_length=1, max_length=80)


class PasskeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: UTCDateTime


class GuideClaim(BaseModel):
    show: bool
    shown: int


class ProWelcomeClaim(BaseModel):
    show: bool


class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5, strict=True)
    comment: str = Field(default="", max_length=2000)
    page: str = Field(default="", max_length=160)

    @field_validator("comment")
    @classmethod
    def _trim_comment(cls, value: str) -> str:
        return value.strip()

    @field_validator("page")
    @classmethod
    def _page_path(cls, value: str) -> str:
        if value and (not value.startswith("/") or value.startswith("//") or "?" in value or "#" in value):
            raise ValueError("Send only the page path, without query parameters or fragments")
        return value


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rating: int
    comment: str
    page: str
    status: Literal["new", "reviewed"]
    created_at: UTCDateTime


class AdminFeedbackOut(FeedbackOut):
    user_email: str
    user_name: Optional[str]


class FeedbackList(BaseModel):
    items: list[AdminFeedbackOut]
    total: int


class FeedbackUpdate(BaseModel):
    status: Literal["new", "reviewed"]


# ---------- profile & preferences ----------

class ProfileUpdate(BaseModel):
    headline: Optional[str] = Field(None, max_length=160)
    summary: Optional[str] = Field(None, max_length=2000)
    phone: Optional[str] = Field(None, max_length=30)
    location: Optional[str] = Field(None, max_length=120)
    experience_years: Optional[float] = Field(None, ge=0, le=60)
    skills: Optional[list[str]] = None

    @field_validator("skills")
    @classmethod
    def _skills(cls, v):
        return None if v is None else _clean_list(v, max_items=60, max_len=40)


class ProfileOut(BaseModel):
    headline: Optional[str] = None
    summary: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    experience_years: Optional[float] = None
    skills: list[str] = []
    resume_filename: Optional[str] = None
    resume_size: Optional[int] = None
    resume_uploaded_at: Optional[UTCDateTime] = None
    completeness: int = 0


class PreferencesUpdate(BaseModel):
    job_titles: Optional[list[str]] = None
    locations: Optional[list[str]] = None
    job_types: Optional[list[Literal["full_time", "part_time", "contract", "internship"]]] = None
    remote_ok: Optional[bool] = None
    min_salary_lpa: Optional[float] = Field(None, ge=0, le=1000)
    auto_apply_enabled: Optional[bool] = None
    daily_limit: Optional[int] = Field(None, ge=1, le=50)
    min_match_score: Optional[int] = Field(None, ge=0, le=100)

    @field_validator("job_titles", "locations")
    @classmethod
    def _lists(cls, v):
        return None if v is None else _clean_list(v)


class PreferencesOut(BaseModel):
    job_titles: list[str] = []
    locations: list[str] = []
    job_types: list[str] = []
    remote_ok: bool = True
    min_salary_lpa: Optional[float] = None
    auto_apply_enabled: bool = False
    daily_limit: int = 10
    min_match_score: int = 60


# ---------- social connections ----------

class ConnectRequest(BaseModel):
    handle: Optional[str] = Field(None, max_length=120)
    profile_url: Optional[str] = Field(None, max_length=300)


class ConnectionOut(BaseModel):
    platform: str
    label: str
    description: str
    connected: bool
    handle: Optional[str] = None
    profile_url: Optional[str] = None
    connected_at: Optional[UTCDateTime] = None


# ---------- jobs ----------

class JobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    company: str = Field(..., min_length=1, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=10000)
    external_link: Optional[str] = Field(None, max_length=1000)
    source: JobSourceLiteral = "manual"
    job_type: Optional[Literal["full_time", "part_time", "contract", "internship"]] = None
    skills: Optional[list[str]] = None
    is_remote: bool = False
    salary_min_lpa: Optional[float] = Field(None, ge=0)
    salary_max_lpa: Optional[float] = Field(None, ge=0)

    @field_validator("external_link")
    @classmethod
    def _url(cls, v):
        if v and not v.lower().startswith(("http://", "https://")):
            raise ValueError("Link must start with http:// or https://")
        return v or None

    @field_validator("skills")
    @classmethod
    def _skills(cls, v):
        return None if v is None else _clean_list(v, max_items=40, max_len=40)


class JobOut(BaseModel):
    id: int
    title: str
    company: str
    location: Optional[str] = None
    description: Optional[str] = None
    external_link: Optional[str] = None
    source: str
    job_type: Optional[str] = None
    skills: list[str] = []
    is_remote: bool = False
    salary_min_lpa: Optional[float] = None
    salary_max_lpa: Optional[float] = None
    posted_date: Optional[UTCDateTime] = None
    match_score: Optional[int] = None
    matched_skills: list[str] = []
    applied: bool = False
    is_own: bool = False


# ---------- applications ----------

class ApplicationCreate(BaseModel):
    job_id: int
    notes: Optional[str] = Field(None, max_length=5000)
    status: ApplicationStatusLiteral = "applied"


class ApplicationUpdate(BaseModel):
    status: Optional[ApplicationStatusLiteral] = None
    notes: Optional[str] = Field(None, max_length=5000)
    interview_date: Optional[datetime] = None
    offer_salary_lpa: Optional[float] = Field(None, ge=0)


class ApplicationOut(BaseModel):
    id: int
    job_id: int
    status: str
    notes: Optional[str] = None
    interview_date: Optional[UTCDateTime] = None
    offer_salary_lpa: Optional[float] = None
    match_score: Optional[int] = None
    auto_applied: bool = False
    applied_at: UTCDateTime
    updated_at: UTCDateTime
    job: JobOut


class DashboardStats(BaseModel):
    total_applications: int
    auto_applied: int
    by_status: dict[str, int]
    by_source: dict[str, int]
    interviews: int
    offers: int
    response_rate: int
    connected_platforms: int
    profile_completeness: int
    by_day: dict[str, int] = {}
    recent: list[ApplicationOut]


# ---------- auto apply ----------

class AutoApplyRunOut(BaseModel):
    id: int
    trigger: str
    started_at: UTCDateTime
    evaluated: int
    applied: int
    skipped: int
    message: Optional[str] = None
    details_recorded: bool = False


class AutoApplyRunJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    company: str
    location: Optional[str] = None
    source: str
    external_link: str
    match_score: int
    outcome: Literal["applied", "to_apply"]


class AutoApplyRunDetail(AutoApplyRunOut):
    model_config = ConfigDict(from_attributes=True)
    jobs: list[AutoApplyRunJobOut] = Field(default_factory=list)


class AutoApplyStatus(BaseModel):
    enabled: bool
    ready: bool
    blockers: list[str]
    connected_platforms: list[str]
    applied_today: int
    daily_limit: int
    lifetime_used: int = 0
    lifetime_limit: Optional[int] = None
    schedule_interval_minutes: int
    next_scheduled_at: Optional[UTCDateTime] = None
    scheduled_sweep_running: bool = False
    last_run: Optional[AutoApplyRunOut] = None


# ---------- admin ----------

class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: Optional[str] = None
    role: str = "user"
    plan: str = "free"
    plan_expires_at: Optional[UTCDateTime] = None
    is_active: bool = True
    is_approved: bool = False
    date_of_birth: Optional[str] = None
    email_verified: bool = False
    last_seen: Optional[UTCDateTime] = None
    created_at: Optional[UTCDateTime] = None
    applications: int = 0
    connections: int = 0


class AdminUserList(BaseModel):
    users: list[AdminUserOut]
    total: int
    pending: int
    pro_days: int


class AdminCreateUser(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(None, max_length=120)
    role: Literal["user", "admin"] = "user"

    @field_validator("email")
    @classmethod
    def _gmail(cls, v: str) -> str:
        if not v.lower().endswith("@gmail.com"):
            raise ValueError("Only @gmail.com email addresses are allowed")
        return v.lower()


class AdminRoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class EmailCodeRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class EmailSendResult(BaseModel):
    message: str
    delivered: bool


class AdminTotpResult(BaseModel):
    user: AdminUserOut
    totp_secret: str
    qr_code: str
    message: str


class NameUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class AdminNameUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)


class AdminUserDetail(BaseModel):
    user: AdminUserOut
    headline: Optional[str] = None
    location: Optional[str] = None
    experience_years: Optional[float] = None
    skills: list[str] = []
    resume_filename: Optional[str] = None
    job_titles: list[str] = []
    locations: list[str] = []
    auto_apply_enabled: bool = False
    platforms: list[str] = []
    status_counts: dict[str, int] = {}


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    notif_type: str
    title: str
    message: str
    is_read: bool
    created_at: UTCDateTime


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=1000)


class AnnouncementOut(BaseModel):
    id: int
    title: str
    message: str
    sender_name: Optional[str] = None
    sender_email: str
    created_at: UTCDateTime
    recipient_count: int
    read_count: int
    opted_out_count: int = 0


class AnnouncementRecipient(BaseModel):
    name: Optional[str] = None
    email: str
    is_read: bool
    read_at: Optional[UTCDateTime] = None
    opted_out: bool = False


class NotificationPrefs(BaseModel):
    receive_announcements: bool


# ---------- billing ----------

class PlanLimits(BaseModel):
    daily_auto_apply: Optional[int] = None
    total_auto_apply: Optional[int] = None


class BillingMe(BaseModel):
    plan: str
    plan_expires_at: Optional[UTCDateTime] = None
    free: PlanLimits
    pro: PlanLimits
    price_inr: int
    pro_days: int
    applied_today: int
    daily_limit: int
    lifetime_used: int
    lifetime_limit: Optional[int] = None
    upi_configured: bool


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_ref: str
    plan_id: str
    base_amount: int  # paise
    unique_amount: int  # paise
    status: str
    expires_at: UTCDateTime
    paid_at: Optional[UTCDateTime] = None
    created_at: UTCDateTime
    invoice_no: Optional[str] = None


class Checkout(BaseModel):
    order: OrderOut
    amount: str
    payee_name: str
    upi_uri: str
    qr_code: str
    seconds_left: int


class UtrSubmit(BaseModel):
    utr: str = Field(..., min_length=12, max_length=12)


class AdminOrderOut(OrderOut):
    user_email: str
    user_name: Optional[str] = None
    utr: Optional[str] = None
    source: Optional[str] = None


class WebhookLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    raw: str
    amount_paise: Optional[int] = None
    utr: Optional[str] = None
    order_ref: Optional[str] = None
    result: str
    order_id: Optional[int] = None
    created_at: UTCDateTime
