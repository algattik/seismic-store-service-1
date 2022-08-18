import requests

from integration_test.conftest import Settings


def test_service_status(settings: Settings):
    print(settings.SERVICE_URL + "service-status")
    response = requests.get(settings.SERVICE_URL + "service-status")
    assert response.status_code == 200


data = {
    "sdpath": "sd://opendes/sntc/1TB_SEGY_IL-1-to-750.segy"
}

# def test_get_textual_header(client):
#     response = client.get(settings.API_PATH + "segy/textualHeader/", params=data, headers=headers)
#     c1_exists = "C 1" in response.json()["header"]
#     c40_exists = "C40" in response.json()["header"]
#     assert response.status_code == 200
#     assert c1_exists == True
#     assert c40_exists == True
#
# def test_get_binary_header(client):
#     response = client.get(settings.API_PATH + "segy/binaryHeader/", params=data, headers=headers)
#     binaryheader_exist = "BinaryHeaders" in response.json()["header"]
#     assert response.status_code == 200
#     assert binaryheader_exist == True
