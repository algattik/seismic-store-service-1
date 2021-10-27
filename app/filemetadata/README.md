# Introduction 
This project will provide restful APIs to access SEGY file headers.

# Getting Started
1.	Installation process
    - Install Python virtual environment if not
      `pip install virtualenv`
  
    - Create a virtual environment
      `virtualenv venv --python=python3.9`

    - Activate virtual environment
      `.\venv\scripts\activate.bat`

    - `pip install keyring artifacts-keyring` - required for login and to access Azure artifacts

    - - create `pip.ini` (Windows) or `pip.conf` (Mac/Linux) with Azure package source under your virtualenv 
        ```
        [global]
        extra-index-url=https://pkgs.dev.azure.com/slb1-swt/_packaging/SegyLibraryFeed%40Local/pypi/simple/
        ```

    - Install dependencies
      `pip install -r requirements.txt`
    
    - Deactivate virtual environment
      `(venv)> deactivate`

    - Install javascript dependencies. In folder app/ run this command
       `npm install`
    
2.	Software dependencies
    - fastapi
    - uvicorn
    - segysdk-python==<latest version>
    Note: you can find the latest version of segysdk-python on the following link:
    https://dev.azure.com/slb1-swt/Petrel/_packaging?_a=feed&feed=SegyLibraryFeed%40Local

3.	Latest releases

4.	API references

# Build 
1. set environment variable `SDMS_SERVICE_HOST` to the url of seismic store service

2. `python main.py`

3. Open `http://localhost:8000/seismic-file-metadata/api/v1/swagger-ui.html` in web browser
    - Enter bearer token and appkey for authorization
    - Enter sdpath i.e. `sd://slb/sandbox/l10f1.sgy`

# Docker image
1. Build the docker image. `docker build -t segyimage . `
2. Run the docker image. `docker run -d -it --rm --name segycontainer -p 8080:8000 segyimage`
3. Launch the web site. `http://localhost:8000/seismic-file-metadata/api/v1/swagger-ui.html`
4. Note: the personal access token in pip.conf only lasts for 90 days. It started on 7/26/2021.


# Test
1. Set the following environment variables
`TOKEN_SVC_URL`
`SAUTH_SVC_ACC_SECRET`
`TOKEN_SVC_APPKEY`
`SAUTH_SVC_ACC_ID`
`SAUTH_SVC_PROJECT_ID`

2. Run `pytest tests/` 

[comment]: <> (5. TODO move token to secrets)