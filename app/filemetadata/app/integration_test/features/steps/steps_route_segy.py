import json

import requests
from behave import *

from core.config import Settings


@when('revision endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/revision?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('revision response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('is3D endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/is3D?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('is3D response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('traceHeaderFieldCount endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/traceHeaderFieldCount?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('traceHeaderFieldCount response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('textualHeader endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/textualHeader?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('textualHeader response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert str(context.response.json()) == str(data)


@when('extendedTextualHeaders endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/extendedTextualHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('extendedTextualHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert str(context.response.json()) == str(data)


@when('binaryHeader endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/binaryHeader?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('binaryHeader response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert str(context.response.json()).replace(context.subproject_name, "") == str(data)


@when('rawTraceHeaders endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/rawTraceHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}&traces_to_dump=100&start_trace=1',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('rawTraceHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert str(context.response.json()).replace(context.subproject_name, "") == str(data)


@when('scaledTraceHeaders endpoint is called')
def step_impl(context):
    response = requests.get(
        f'{Settings.BASE_URL}/segy/scaledTraceHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}&traces_to_dump=100&start_trace=1',
        headers={"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'})
    context.response = response
    assert response.status_code == 200


@then('scaledTraceHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        data = json.load(fp)
    assert str(context.response.json()).replace(context.subproject_name, "") == str(data)
