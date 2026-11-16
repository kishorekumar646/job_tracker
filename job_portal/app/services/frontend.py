"""
Author: Kishore Kumar
Serve the production SPA without turning missing API or asset requests into HTML.
"""

from pathlib import PurePosixPath

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class FrontendFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        reserved = path.split("/", 1)[0] in {"api", "assets", "docs", "redoc"}
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or reserved or PurePosixPath(path).suffix:
                raise
            response = await super().get_response("index.html", scope)
        if path in {"sw.js", "manifest.json"} or response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-cache"
        elif path.startswith("assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
