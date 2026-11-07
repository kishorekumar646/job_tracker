#!/usr/bin/env python
"""Main entry point for running the server."""

import logging
import uvicorn

# Configure logging to show in uvicorn output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8886, log_level="info", reload=True)