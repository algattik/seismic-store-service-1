import json

import requests
from behave import *

from core.config import Settings


@when('bingrid endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/openzgy/bingrid?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('bingrid response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert context.response.json() == data
