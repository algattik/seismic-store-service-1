FROM ubuntu:latest

RUN apt-get update \
    && apt-get install -y python3-pip python3-dev curl \
    && cd /usr/local/bin \
    && ln -s /usr/bin/python3 python \
    && pip3 install --upgrade pip

ADD pip.conf /etc

COPY ./app /app

WORKDIR /app

RUN pip install -r requirements.txt

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