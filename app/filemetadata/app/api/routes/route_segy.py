import json
import re
import segysdk

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security.api_key import APIKey
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from api.dependencies.authentication import get_bearer, get_api_key, configure_remote_access
from core.config import settings

router = APIRouter()

def internal_server_error(e: Exception): 
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

def segy_error(se: segysdk.SegyException):
    message = str(se)
    matched = re.search('HTTP [0-9][0-9][0-9]', message)
    if(matched):
        http_error = int(matched.group().split()[1])
        return HTTPException(status_code=http_error, detail=message)
    
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=message)

@router.get(settings.API_PATH + "segy/revision",  tags=["SEGY"])
async def get_revision(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        revision = segy.get_revision()
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

    return revision

@router.get(settings.API_PATH + "segy/is3D", tags=["SEGY"])
async def get_is_3d(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        is_3d = segy.is_3d()
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

    return is_3d == 1

@router.get(settings.API_PATH + "segy/traceHeaderFieldCount", tags=["SEGY"])
async def get_trace_header_field_count(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        count = segy.get_trace_header_field_count()
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

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
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

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
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

    return {"header": f"{json_header}"}

@router.get(settings.API_PATH + "segy/binaryHeader", tags=["SEGY"])
async def get_binary_header(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_binary_header_as_json()
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

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
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

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
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)

    return {"header": f"{header}"}

def __create_segy_session(bearer, api_key, sdpath):
    try:
        configure_remote_access(bearer, api_key)
        return segysdk.create_session(sdpath, '{}')    
    except segysdk.SegyException as se:
        raise segy_error(se)
    except Exception as e:
        raise internal_server_error(e)
