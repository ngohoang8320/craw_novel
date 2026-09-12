"""Environment configuration for the backend."""
import os

from dotenv import load_dotenv

load_dotenv()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_URL = os.getenv("BASE_URL", "https://www.bilinovel.com").rstrip("/")
DEFAULT_NOVEL_ID = os.getenv("DEFAULT_NOVEL_ID", "")
DATA_DIR = os.getenv("DATA_DIR", os.path.join(_PROJECT_ROOT, "data"))

# Origins allowed to call this API (the Vite dev server by default).
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
