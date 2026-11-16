"""
Author: Kishore Kumar
Notifications and admin announcements, mounted at ``/api/v1/notifications``.

    GET    /notifications/mine                         the caller's inbox (newest first)
    PATCH  /notifications/{id}/read                    mark one as read
    POST   /notifications/mark-all-read                mark everything read
    POST   /notifications/announce                     (admin) broadcast to every active user except the sender
    GET    /notifications/announcements                (admin) history with delivery / read counts
    GET    /notifications/announcements/{id}/recipients (admin) who received it and who read it
    DELETE /notifications/announcements/{id}           (admin) remove it from every inbox
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...deps import get_current_user, require_admin
from ...models import Announcement, Notification, User
from ...schemas import AnnouncementCreate, AnnouncementOut, AnnouncementRecipient, NotificationOut, NotificationPrefs, UserOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/mine", response_model=list[NotificationOut])
async def my_notifications(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if not user.receive_announcements:
        q = q.where(Notification.notif_type != "announcement")
    q = q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(50)
    return (await db.scalars(q)).all()


@router.post("/mark-all-read")
async def mark_all_read(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    await db.execute(update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False)).values(is_read=True, read_at=datetime.utcnow()))
    await db.commit()
    return {"ok": True}


@router.patch("/preferences", response_model=UserOut)
async def update_preferences(body: NotificationPrefs, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    user.receive_announcements = body.receive_announcements
    await db.commit()
    return UserOut.model_validate(user)


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    note = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if not note.is_read:
        note.is_read = True
        note.read_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/announce", dependencies=[Depends(require_admin)])
async def announce(body: AnnouncementCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    ann = Announcement(title=body.title.strip(), message=body.message.strip(), sender_email=admin.email, sender_name=admin.name)
    db.add(ann)
    await db.flush()
    recipients = (await db.scalars(select(User.id).where(User.is_active.is_(True), User.id != admin.id))).all()
    db.add_all(
        Notification(user_id=uid, announcement_id=ann.id, notif_type="announcement", title=ann.title, message=ann.message)
        for uid in recipients
    )
    await db.commit()
    return {"ok": True, "sent_to": len(recipients)}


@router.get("/announcements", response_model=list[AnnouncementOut], dependencies=[Depends(require_admin)])
async def announcement_history(db: AsyncSession = Depends(get_async_db)):
    counts: dict[int, list[int]] = {}
    for aid, is_read, opted in (await db.execute(
        select(Notification.announcement_id, Notification.is_read, User.receive_announcements)
        .join(User, User.id == Notification.user_id).where(Notification.announcement_id.is_not(None))
    )).all():
        c = counts.setdefault(aid, [0, 0, 0])
        if not opted:
            c[2] += 1
        else:
            c[0] += 1
            c[1] += 1 if is_read else 0
    items = (await db.scalars(select(Announcement).order_by(Announcement.created_at.desc(), Announcement.id.desc()))).all()
    return [
        AnnouncementOut(
            id=a.id, title=a.title, message=a.message, sender_name=a.sender_name, sender_email=a.sender_email,
            created_at=a.created_at, recipient_count=counts.get(a.id, [0, 0, 0])[0], read_count=counts.get(a.id, [0, 0, 0])[1],
            opted_out_count=counts.get(a.id, [0, 0, 0])[2],
        )
        for a in items
    ]


@router.get("/announcements/{announcement_id}/recipients", response_model=list[AnnouncementRecipient], dependencies=[Depends(require_admin)])
async def announcement_recipients(announcement_id: int, db: AsyncSession = Depends(get_async_db)):
    rows = (await db.execute(
        select(User.name, User.email, Notification.is_read, Notification.read_at, User.receive_announcements)
        .join(Notification, Notification.user_id == User.id)
        .where(Notification.announcement_id == announcement_id).order_by(User.email)
    )).all()
    return [AnnouncementRecipient(name=n, email=e, is_read=r and opt, read_at=at, opted_out=not opt) for n, e, r, at, opt in rows]


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_announcement(announcement_id: int, db: AsyncSession = Depends(get_async_db)):
    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    await db.execute(delete(Notification).where(Notification.announcement_id == announcement_id))
    await db.delete(ann)
    await db.commit()
