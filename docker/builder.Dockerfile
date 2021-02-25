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

# [seistore builder image]

# use ubuntu as base image
FROM ubuntu:bionic

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
RUN apt-get update && apt-get install -y nodejs
RUN npm install -g typescript
