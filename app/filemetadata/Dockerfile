FROM ubuntu:20.04

RUN apt-get update \
    && apt-get install -y python3-pip python3-dev curl \
    && cd /usr/local/bin \
    && ln -s /usr/bin/python3 python \
    && pip3 install --upgrade pip

ADD pip.conf /etc

COPY ./app /app

WORKDIR /app

RUN pip install -r requirements.txt

# OpenZgy Bundle packages available on https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/open-zgy/-/packages
# Current version 2158481 OpenZGY.focal.sdms-bundle-azure-curl.aws.ibm.0.2.901.tar.gz
ARG OPENZGY_BUNDLE_URL="https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/open-zgy/-/package_files/2158481/download"

#Get openzgy bundle
RUN mkdir -p /tmp/openzgy-bundle
WORKDIR /app/openzgy-bundle
RUN curl ${OPENZGY_BUNDLE_URL} -o /app/openzgy-bundle/openzgy.bundle.tar.gz
RUN tar zxvf openzgy.bundle.tar.gz
WORKDIR /app/openzgy-bundle/wrapper
RUN pip install -r requirements.txt
WORKDIR /app/openzgy-bundle/wrapper/focal-gcc94
RUN pip install *.whl

# Install node js
ENV NODE_VERSION 14.17.4

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN npm install --unsafe-perm

EXPOSE 8000
CMD [ "python", "./main.py"]
