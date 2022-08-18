import openzgycpp as zgy
import os

import enum
import math
import json
import vector

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

class P6Bin(enum.Enum):
    P6BinGridOriginI = 1
    P6BinGridOriginJ = 2
    P6BinGridOriginEasting = 3
    P6BinGridOriginNorthing = 4
    P6BinNodeIncrementOnIaxis = 5
    P6BinNodeIncrementOnJaxis = 6
    P6BinWidthOnIaxis = 7
    P6BinWidthOnJaxis = 8
    P6TransformationMethod = 10
    P6MapGridBearingOfBinGridJaxis = 11
    BinGridLocalCoordinates = 12


class Line:
    def __init__(self, start, increment, count):
        self.start = start
        self.increment = increment
        self.count = count

    def __repr__(self):
        return f"start: {self.start} increment: {self.increment} count: {self.count}"

    def __str__(self):
        return f"start: {self.start} increment: {self.increment} count: {self.count}"


class Point:
    def __init__(self, i, j, inline, xline, easting, northing):
        self.i = i
        self.j = j
        self.inline = inline
        self.xline = xline
        self.easting = easting
        self.northing = northing
        self.vector = vector.obj(x=self.easting, y=self.northing)

    def __repr__(self):
        return f"i: {self.i} j: {self.j} inline: {self.inline} xline: {self.xline} easting: {self.easting} northing: {self.northing}"

    def __str__(self):
        return f"i: {self.i} j: {self.j} inline: {self.inline} xline: {self.xline} easting: {self.easting} northing: {self.northing}"


class ZGYToBinGrid:
    def __init__(self, point1, point2, point3, point4, inline, xline):
        self.point1 = point1
        self.point2 = point2
        self.point3 = point3
        self.point4 = point4
        self.inline = inline
        self.xline = xline

    def getValue(self, attribute):
        if attribute == P6Bin.P6BinGridOriginI:
            return self.point1.inline

        elif attribute == P6Bin.P6BinGridOriginJ:
            return self.point1.xline

        elif attribute == P6Bin.P6BinGridOriginEasting:
            return self.point1.easting

        elif attribute == P6Bin.P6BinGridOriginNorthing:
            return self.point1.northing

        elif attribute == P6Bin.P6BinNodeIncrementOnIaxis:
            return self.inline.increment

        elif attribute == P6Bin.P6BinNodeIncrementOnJaxis:
            return self.xline.increment

        elif attribute == P6Bin.P6BinWidthOnIaxis:
            return math.ceil(abs(self.point2.vector - self.point1.vector) / (self.inline.count - 1))

        elif attribute == P6Bin.P6BinWidthOnJaxis:
            return math.ceil(abs(self.point3.vector - self.point1.vector) / (self.xline.count - 1))

        elif attribute == P6Bin.P6TransformationMethod:
            a1 = self.point2.vector - self.point1.vector
            b1 = self.point3.vector - self.point1.vector
            a2 = self.point4.vector - self.point3.vector
            b2 = self.point4.vector - self.point2.vector
            if a1.dot(b2) - a2.dot(b1) > 0:
                return 9666
            else:
                return 1049

        elif attribute == P6Bin.P6MapGridBearingOfBinGridJaxis:
            b = self.point3.vector - self.point1.vector
            b1 = b.x
            b2 = b.y
            angle = math.acos(b2 / abs(b))
            if b1 >= 0:
                return round((angle * 180) / math.pi, 2)
            else:
                return round(360 - (angle * 180) / math.pi)

        elif attribute == P6Bin.BinGridLocalCoordinates:
            points = [self.point1, self.point3, self.point2, self.point4]
            lst = []
            for point in points:
                m = {}
                m["X"] = point.inline
                m["Y"] = point.xline
                lst.append(m)
            return lst

    def getValusAsJson(self):
        m = {}
        for attr in P6Bin:
            m[attr.name] = self.getValue(attr)

        return json.dumps(m, indent=2)

@router.get(settings.API_PATH + "openzgy/bingrid", tags=["OPENZGY"])
async def get_bingrid(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    reader = zgy.ZgyReader(sdpath,
                           {"sdurl": os.environ.get("SDMS_SERVICE_HOST"), "sdapikey": api_key, "sdtoken": bearer})
    point1 = Point(reader.indexcorners[0][0], reader.indexcorners[0][1],
                   reader.annotcorners[0][0], reader.annotcorners[0][1],
                   reader.corners[0][0], reader.corners[0][1])
    point2 = Point(reader.indexcorners[1][0], reader.indexcorners[1][1],
                   reader.annotcorners[1][0], reader.annotcorners[1][1],
                   reader.corners[1][0], reader.corners[1][1])
    point3 = Point(reader.indexcorners[2][0], reader.indexcorners[2][1],
                   reader.annotcorners[2][0], reader.annotcorners[2][1],
                   reader.corners[2][0], reader.corners[2][1])
    point4 = Point(reader.indexcorners[3][0], reader.indexcorners[3][1],
                   reader.annotcorners[3][0], reader.annotcorners[3][1],
                   reader.corners[3][0], reader.corners[3][1])
    inline = Line(reader.annotstart[0], reader.annotinc[0], reader.annotcorners[3][0])
    xline = Line(reader.annotstart[1], reader.annotinc[1], reader.annotcorners[3][1])
    try:

        zgyToBinGrid = ZGYToBinGrid(point1, point2, point3, point4, inline, xline)
        bingrid = zgyToBinGrid.getValusAsJson()
    except:
        raise internal_server_error
    finally:
        reader.close()

    return bingrid
