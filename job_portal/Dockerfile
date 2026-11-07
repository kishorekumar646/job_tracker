FROM python:3.11-slim

WORKDIR /app

# Dependencies first — better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Explicit SIGTERM (same as Docker default, but documented clearly) so the
# orchestrator triggers our lifespan shutdown hook instead of SIGKILL.
STOPSIGNAL SIGTERM

# --timeout-graceful-shutdown 20: uvicorn waits up to 20 s for in-flight work
# (our shutdown_background_tasks hook cancels tasks within milliseconds, but
# this cap ensures the process always exits before Docker's stop_grace_period
# sends SIGKILL).
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--timeout-graceful-shutdown", "20"]

