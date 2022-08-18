import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Settings:
    SVC_TOKEN: str = os.getenv('SVC_TOKEN')
    SERVICE_URL: str = os.getenv('DNS') + '/seismic-file-metadata/api/v1/'


@pytest.fixture
def settings():
    return Settings()
