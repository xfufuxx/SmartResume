from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class SendCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = "register"


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    code: str
    platform: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = None
    platform: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    phone: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    is_verified: bool = False
    career_state: Optional[str] = None
    status: str = "active"

    model_config = {"from_attributes": True}


class UserProfileResponse(BaseModel):
    id: str
    email: str
    phone: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    career_state: Optional[str] = None
    expectation: Optional[dict] = None
    privacy_agreed: bool = False
    status: str = "active"
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class BindPhoneRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\d{11}$")


class UnbindPhoneRequest(BaseModel):
    password: str


class UpdateProfileRequest(BaseModel):
    nickname: Optional[str] = None
    career_state: Optional[str] = None
    privacy_agreed: Optional[bool] = None


class UpdateExpectationRequest(BaseModel):
    industries: Optional[list[str]] = None
    job_title: Optional[str] = None
    salary_range: Optional[str] = None
    cities: Optional[list[str]] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class MessageResponse(BaseModel):
    id: str
    msg_type: str
    title: Optional[str] = None
    content: Optional[str] = None
    ref_id: Optional[str] = None
    is_read: bool = False
    created_at: Optional[datetime] = None