"""
Author: Kishore Kumar
Test helpers.
"""

import pyotp


async def register(client, email="asha@gmail.com", name="Asha Kumar", verified=True):
    """Sign up, activate and log in with real TOTP codes; returns (user, secret)."""
    res = await client.post("/api/v1/auth/signup", json={"full_name": name, "date_of_birth": "1998-01-01", "email": email})
    assert res.status_code == 201, res.text
    secret = res.json()["totp_secret"]
    act = await client.post("/api/v1/auth/activate", json={"email": email, "otp": pyotp.TOTP(secret).now()})
    assert act.status_code == 200, act.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "otp": pyotp.TOTP(secret).now()})
    assert login.status_code == 200, login.text
    if verified:
        from sqlalchemy import update
        from app.database import async_session_factory
        from app.models import User
        async with async_session_factory() as db:
            await db.execute(update(User).where(User.email == email).values(email_verified=True))
            await db.commit()
        login.json()["user"]["email_verified"] = True
    return login.json()["user"], secret
