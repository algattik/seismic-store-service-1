from fastapi import APIRouter

from api.routes import route_status, route_segy

api_router = APIRouter()

api_router.include_router(route_status.router)
api_router.include_router(route_segy.router)
