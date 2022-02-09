# Introduction 
This project will provide the restful APIs to access SEGY file headers.

There are 3 ways to build and test this service: local, docker and GitLab.
# Local
## Getting Started
1.	Installation process
    - Install Python virtual environment if not
      `pip install virtualenv`
  
    - Create a virtual environment
      `virtualenv venv --python=python3.9`

    - Activate virtual environment
      `.\venv\scripts\activate.bat`

    - `pip install keyring artifacts-keyring` - required for login and to access Azure artifacts

    - Create `pip.ini` (Windows) or `pip.conf` (Mac/Linux) with Azure package source under your virtualenv directory.
        ```
        [global]
      extra-index-url=https://SegyLibraryFeed%40Local:<your-PAT-key>@pkgs.dev.azure.com/slb1-swt/_packaging/SegyLibraryFeed%40Local/pypi/simple/
        ```
      Note: the personal access token (PAT) in pip.conf only lasts for one year. It started on 10/27/2021.
      For more details, please visit [Get started with Python packages in Azure Artifacts](https://docs.microsoft.com/en-us/azure/devops/artifacts/quickstarts/python-packages?view=azure-devops)

  
    - Install dependencies
      `pip install -r requirements.txt`
    
    - Deactivate virtual environment
      `(venv)> deactivate`

    - Install javascript dependencies. In folder app/ run this command
       `npm install`
    
2.	Software dependencies
    - fastapi
    - uvicorn
    - segysdk-python==`<latest version>`
    The latestion version of segysdk-python is `0.0.4028456`
    Note: you can find the latest version of segysdk-python on the following [link](
    https://dev.azure.com/slb1-swt/Petrel/_packaging?_a=feed&feed=SegyLibraryFeed%40Local).

3.	Latest releases
    
4.	API references

## Build and Test
1. set environment variable `SDMS_SERVICE_HOST` to the url of [seismic store service](https://slb-swt.visualstudio.com/carbon/_wiki/wikis/carbon.wiki/12539/SDMS-Core-Services).
For QA: `https://evt-mvp.managed-osdu.cloud.slb-ds.com/seistore-svc/api/v3` 

2. `python main.py`

3. Open `http://localhost:8000/seismic-file-metadata/api/v1/swagger-ui.html` in web browser
    - Enter bearer token (you can get it from Delfi Portal) and appkey for authorization 
    - Enter sdpath i.e. `sd://opendes/dchentest/test.sgy`

# Docker
## Getting Started
1. Build the docker image. `docker build -t segyimage . `

## Build and Test
1. Run the docker image. `docker run --env SDMS_SERVICE_HOST=<SDMS_SERVICE_HOST> -d -it --rm --name segycontainer -p 8080:8000 segyimage`
Replace environment variable `<SDMS_SERVICE_HOST>` with the url of [seismic store service](https://slb-swt.visualstudio.com/carbon/_wiki/wikis/carbon.wiki/12539/SDMS-Core-Services).
For QA(P4D):
`docker run --env SDMS_SERVICE_HOST=https://evt-mvp.managed-osdu.cloud.slb-ds.com/seistore-svc/api/v3 -d -it --rm --name segycontainer -p 8080:8000 segyimage`
2. Open `http://localhost:8080/seismic-file-metadata/api/v1/swagger-ui.html` in web browser
    - Enter bearer token (you can get it from Delfi Portal) and appkey for authorization 
    - Enter sdpath i.e. `sd://opendes/dchentest/test.sgy`

# GitLab
## Build and Test
1. [CI/CD Pipeline](https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/-/pipelines)

2. `SDMS_SERVICE_HOST` is defined in `devops\azure\chart\templates\configmap.yaml`
3. [Test web url](https://osdu-glab.msft-osdu-test.org/seismic-file-metadata/api/v1/swagger-ui.html)

# Run Unit Tests
1. Set the following environment variables
`TOKEN_SVC_URL`
`SAUTH_SVC_ACC_SECRET`
`TOKEN_SVC_APPKEY`
`SAUTH_SVC_ACC_ID`
`SAUTH_SVC_PROJECT_ID`

2. Run `pytest tests/` 

[comment]: <> (5. TODO move token to secrets)