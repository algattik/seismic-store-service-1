import logging
import os

from core.config import Settings


def apply_test_settings():
    Settings.TOKEN = "Bearer " + os.getenv('svctoken')
    Settings.LEGAL_TAG = os.getenv('LEGAL_TAG')
    Settings.SVC_API_KEY = os.getenv('SVC_API_KEY')
    Settings.PARTITION = os.getenv('TENANT_NAME')
    dnsVariableExists = os.getenv('DNS')  # if this variable is missing we test locally with qa ext services
    baseUrl = f"{os.getenv('DNS')}" if dnsVariableExists else "http://172.17.0.1:8000"
    externalServicesUrl = f"{os.getenv('DNS')}" if dnsVariableExists else "https://evt.api.enterprisedata.cloud.slb-ds.com"
    Settings.BASE_URL = f"{baseUrl}/seismic-file-metadata/api/v1"
    Settings.SEISTORE_SVC_URL = f"{externalServicesUrl}/seistore-svc/api/v3"
    Settings.STORAGE_SVC_URL = f"{externalServicesUrl}/api/storage/v2"
    logging.info("---ENV VARIABLES---")
    logging.info(f"ENV-SVC TOKEN: Bearer {Settings.TOKEN}")
    logging.info(f"ENV-SVC API KEY: {Settings.SVC_API_KEY}")
    logging.info(f"ENV-LEGAL_TAG: {Settings.LEGAL_TAG}")
    logging.info(f"ENV-TENANT_NAME: {Settings.PARTITION}")
    logging.info("---TEST VARIABLES---")
    logging.info(f"BASE URL: {Settings.BASE_URL}")
    logging.info(f"SEISTORE SVC URL: {Settings.SEISTORE_SVC_URL}")
    logging.info(f"STORAGE SVC URL: {Settings.STORAGE_SVC_URL}")
