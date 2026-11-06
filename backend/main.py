#!/usr/bin/env python
"""Main entry point for running the server."""

# Re-export app from __init__.py for uvicorn
from __init__ import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8886, log_level="debug", reload=False)
