# ============================================================================
# Copyright 2017-2021, Schlumberger
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

# [seistore builder image]

ARG docker_node_image_version=14-alpine

FROM node:${docker_node_image_version} as runtime-builder

RUN apk --no-cache add --virtual native-deps g++ gcc libgcc libstdc++ linux-headers make python \
    && npm install --quiet node-gyp -g \
    && apk del native-deps