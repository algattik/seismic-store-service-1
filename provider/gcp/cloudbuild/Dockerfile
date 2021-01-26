# ============================================================================
# Copyright 2017-2019, Schlumberger
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ============================================================================

# [seistore runtime image]

ARG docker_node_image_version=12.18.2

# build the service (require builder image)
FROM ubuntu:bionic as runtime-builder

# nodejs version
ARG nodesecure_version=10

# update package list and install required packages
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y gnupg
RUN apt-get install -y git

# setup node from secure package
RUN curl -sL https://deb.nodesource.com/setup_${nodesecure_version}.x -o tmp/nodesource_setup.sh
RUN bash tmp/nodesource_setup.sh
RUN rm -f tmp/nodesource_setup.sh

# install nodejs and typescript globally
RUN apt-get install -y nodejs
RUN npm install -g typescript

ADD ./ /service
WORKDIR /service
RUN npm run clean && rm -rf node_modules && rm -rf artifact && mkdir artifact
RUN npm install
RUN npm run build
RUN cp -r package.json npm-shrinkwrap.json dist artifact

# Create the runtime image (require base image)
FROM node:${docker_node_image_version} as release

COPY --from=runtime-builder /service/artifact /seistore-service
WORKDIR /seistore-service
RUN npm install --production
ENTRYPOINT ["node", "./dist/server/server-start.js"]