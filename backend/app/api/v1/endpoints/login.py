from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.schemas.token import Token

router = APIRouter()


@router.post("/login/access-token", response_model=Token)
async def login_access_token(
    db: AsyncSession = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    print(f"DEBUG: Login attempt for user: {form_data.username}")
    
    # Authenticate user
    stmt = select(User).where(User.email == form_data.username)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        print(f"DEBUG: User {form_data.username} not found in database")
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    if not security.verify_password(form_data.password, user.hashed_password):
        print(f"DEBUG: Password verification failed for user: {form_data.username}")
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.is_active:
        print(f"DEBUG: User {form_data.username} is inactive")
        raise HTTPException(status_code=400, detail="Inactive user")
        
    print(f"DEBUG: Login successful for user: {form_data.username}")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }
