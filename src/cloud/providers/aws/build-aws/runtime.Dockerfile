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
ARG docker_builder_image

# build the service (require builder image)
FROM ${docker_builder_image} as runtime-builder

RUN apt-get install -yqq --no-install-recommends openssl

ADD ./ /service
WORKDIR /service
RUN npm run clean && rm -rf node_modules && rm -rf artifact && mkdir artifact
RUN npm ci
RUN npm run build
RUN cp -r package.json npm-shrinkwrap.json dist artifact

# Create the runtime image (require base image)
FROM node:${docker_node_image_version} as release

#Default to using self signed generated TLS cert
ENV USE_SELF_SIGNED_SSL_CERT true
ENV SSL_CERT_PATH "/src/cloud/providers/aws/certs/cert.crt" 
ENV SSL_KEY_PATH "/src/cloud/providers/aws/certs/cert.key"
ENV SSL_ENABLED "true"

COPY --from=runtime-builder /service/artifact /seistore-service
WORKDIR /seistore-service
COPY src/cloud/providers/aws/build-aws/ssl.sh /seistore-service/ssl.sh
COPY src/cloud/providers/aws/build-aws/entrypoint.sh /seistore-service/entrypoint.sh
RUN npm ci --production
ENTRYPOINT ["/bin/sh", "-c", "/seistore-service/entrypoint.sh"]