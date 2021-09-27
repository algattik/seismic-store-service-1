from fastapi import APIRouter

from core.config import settings

router = APIRouter()


@router.get(settings.API_PATH + "service-status")
def get_status():
    return {"status": "ok"}
