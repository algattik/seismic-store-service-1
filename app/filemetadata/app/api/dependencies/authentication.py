import segysdk
from fastapi import Security
from fastapi.security import HTTPBearer
from fastapi.security.api_key import APIKeyHeader

from core.config import settings

security = HTTPBearer()
api_key_header = APIKeyHeader(scheme_name="appkey", name="appkey")
bearer_header = APIKeyHeader(scheme_name="bearer", name="Authorization")


async def get_bearer(
        bearer_header: str = Security(bearer_header)
):
    return bearer_header


async def get_api_key(
        api_key_header: str = Security(api_key_header)
):
    return api_key_header


def configure_remote_access(sdms_bearer_token, sdms_app_key):
    segysdk.segy_configure_remote_access(settings.SDMS_URL, sdms_app_key, sdms_bearer_token)
