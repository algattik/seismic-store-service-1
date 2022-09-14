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

@router.get(settings.API_PATH + "segy/revision",  tags=["SEGY"])
async def get_revision(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        revision = segy.get_revision()
    except:
        raise internal_server_error

    return revision

@router.get(settings.API_PATH + "segy/is3D", tags=["SEGY"])
async def get_is_3d(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        is_3d = segy.is_3d()
    except:
        raise internal_server_error

    return is_3d == 1

@router.get(settings.API_PATH + "segy/traceHeaderFieldCount", tags=["SEGY"])
async def get_trace_header_field_count(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        count = segy.get_trace_header_fields()
    except:
        raise internal_server_error

    return count

@router.get(settings.API_PATH + "segy/textualHeader", tags=["SEGY"])
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

@router.get(settings.API_PATH + "segy/extendedTextualHeaders", tags=["SEGY"])
async def get_extended_textual_headers(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        get_extended_ascii_headers_as_json = segy.get_extended_ascii_headers_as_json()
        json_header = json.loads(get_extended_ascii_headers_as_json)
    except:
        raise internal_server_error

    return {"header": f"{json_header}"}

@router.get(settings.API_PATH + "segy/binaryHeader", tags=["SEGY"])
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

@router.get(settings.API_PATH + "segy/rawTraceHeaders", tags=["SEGY"])
async def get_raw_trace_headers(
        sdpath: str,
        start_trace: int,
        traces_to_dump: int,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_raw_trace_headers_as_json(start_trace, traces_to_dump)
    except:
        raise internal_server_error

    return {"header": f"{header}"}

@router.get(settings.API_PATH + "segy/scaledTraceHeaders", tags=["SEGY"])
async def get_scaled_trace_headers(
        sdpath: str,
        start_trace: int,
        traces_to_dump: int,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_scaled_trace_headers_as_json(start_trace, traces_to_dump)
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
