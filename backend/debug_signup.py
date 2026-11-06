from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.schemas import UserCreate, UserResponse
from app.models import User
from app.crud import create_user, get_user_by_email

app = FastAPI()

@app.post('/debug-signup', response_model=UserResponse)
async def debug_signup(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_async_db),
):
    """Debug signup endpoint."""
    print(f"Debug: received user_data = {user_data}")
    try:
        existing = await get_user_by_email(db, user_data.email)
        print(f"Debug: existing user = {existing}")
        if existing:
            raise HTTPException(status_code=409, detail="Email taken")
        
        user = await create_user(db, user_data)
        print(f"Debug: created user = {user.id}")
        return user
    except Exception as e:
        print(f"Debug: exception = {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8890)
