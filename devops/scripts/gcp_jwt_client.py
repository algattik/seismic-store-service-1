import json
import os

from google.auth.transport.requests import Request
from google.oauth2 import service_account


def get_id_token():
    sa_info = json.loads(os.environ.get("OSDU_GCP_SA_FILE"))
    audience = os.environ.get("OSDU_GCP_AUDIENCE")
    credentials = service_account.IDTokenCredentials.from_service_account_info(
        sa_info, target_audience=audience)
    credentials.refresh(Request())
    if not credentials.token:
        raise Exception("Can't generte ID Token")
    print(credentials.token)
    return credentials.token


def get_invalid_token():
    """
    It's a fake JWT token
    {
        "aud": "wrong.com",
        "azp": "wrong@wrong.com",
        "email": "wrong@wrong.com",
        "email_verified": false,
        "exp": 9999999999,
        "iat": 9999999999,
        "iss": "https://wrong.com",
        "sub": "107316492921566999999"
    }
    """
    fake_id_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ3cm9uZy5jb20iLCJhenAiOiJ3cm9uZ0B3cm9uZy5jb20iLCJlbWFpbCI6Indyb25nQHdyb25nLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjk5OTk5OTk5OTksImlzcyI6Imh0dHBzOi8vd3JvbmcuY29tIiwic3ViIjoiMTA3MzE2NDkyOTIxNTY2OTk5OTk5In0.5C0Ppxv3ECsFaQkiyoH2jalICdaSKhbClyINonloPyo"
    print(fake_id_token)
    return fake_id_token


if __name__ == '__main__':
    get_id_token()
