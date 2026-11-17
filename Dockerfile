# Author: Kishore Kumar
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FRONTEND_DIST=/app/frontend/dist \
    COOKIE_SECURE=true
WORKDIR /app/job_portal
COPY job_portal/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY job_portal/app ./app
COPY job_portal/tools/make_admin.py ./tools/make_admin.py
COPY job_portal/createsuperuser ./createsuperuser
COPY --from=frontend /build/frontend/dist /app/frontend/dist
RUN useradd --create-home --uid 10001 jobpilot
USER jobpilot
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
