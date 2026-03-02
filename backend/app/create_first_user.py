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

async def create_user(email, password, full_name, role):
    engine = create_async_engine(str(settings.DATABASE_URL))
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if user already exists
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if user:
            print(f"User with email {email} already exists.")
            return

        # Create new user
        new_user = User(
            email=email,
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
