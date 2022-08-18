from core.config import Settings

def apply_test_settings():
    Settings.API_PATH = "/seismic-file-metadata/api/v1/"
    Settings.BASE_URL = "http://unit-tests.com"
