import json

import segysdk
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security.api_key import APIKey
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_401_UNAUTHORIZED, HTTP_500_INTERNAL_SERVER_ERROR

from api.dependencies.authentication import get_bearer, get_api_key, configure_remote_access
from core.config import settings
from resources import strings

router = APIRouter()

authorization_error = HTTPException(
    status_code=HTTP_401_UNAUTHORIZED,
    detail=strings.AUTHENTICATION_ERROR
)

input_error = HTTPException(
    status_code=HTTP_400_BAD_REQUEST,
    detail=strings.INCORRECT_SDPATH_ERROR
)

internal_server_error = HTTPException(
    status_code=HTTP_500_INTERNAL_SERVER_ERROR,
    detail=strings.INTERNAL_ERROR
)

@router.get(settings.API_PATH + "segy/textualHeader")
async def get_textual_header(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        ascii_headers_as_json = segy.get_ascii_headers_as_json()
        json_header = json.loads(ascii_headers_as_json)["Textualheader"]
    except:
        raise internal_server_error

    return {"header": f"{json_header}"}


@router.get(settings.API_PATH + "segy/binaryHeader")
async def get_binary_header(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_binary_header_as_json()
    except:
        raise internal_server_error

    return {"header": f"{header}"}


def __create_segy_session(bearer, api_key, sdpath):
    try:
        configure_remote_access(bearer, api_key)
    except Exception:
        raise authorization_error
    try:
        return segysdk.create_session(sdpath, '{}')
    except:
        raise input_error
