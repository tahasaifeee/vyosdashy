import asyncio
import sys
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
import os

# Add the parent directory to sys.path to import from 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core import security
from app.models.user import User
from app.models.router import Router
from app.models.metrics import RouterMetrics
from app.core.database import Base

async def create_user(email, password, full_name, role):
    engine = create_async_engine(str(settings.DATABASE_URL))
    
    # Ensure tables are created
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    normalized_email = email.lower()

    async with async_session() as session:
        # Check if user already exists
        stmt = select(User).where(User.email == normalized_email)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if user:
            print(f"User with email {normalized_email} already exists. Updating password...")
            user.hashed_password = security.get_password_hash(password)
            user.full_name = full_name
            user.role = role
            user.is_superuser = (role == "admin")
            await session.commit()
            print(f"User {normalized_email} updated successfully!")
            return

        # Create new user
        new_user = User(
            email=normalized_email,
            hashed_password=security.get_password_hash(password),
            full_name=full_name,
            role=role,
            is_superuser=(role == "admin")
        )
        session.add(new_user)
        await session.commit()
        print(f"User {email} created successfully!")

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python create_first_user.py <email> <password> <full_name> <role>")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    full_name = sys.argv[3]
    role = sys.argv[4]

    asyncio.run(create_user(email, password, full_name, role))
