		
#  Copyright © Microsoft Corporation
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

cat << 'EOF' > ~/.bashrc
# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples
# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac
# don't put duplicate lines or lines starting with space in the history.
# See bash(1) for more options
HISTCONTROL=ignoreboth
# append to the history file, don't overwrite it
shopt -s histappend
# for setting history length see HISTSIZE and HISTFILESIZE in bash(1)
HISTSIZE=10000
HISTFILESIZE=20000
# check the window size after each command and, if necessary,
# update the values of LINES and COLUMNS.
shopt -s checkwinsize
# If set, the pattern "**" used in a pathname expansion context will
# match all files and zero or more directories and subdirectories.
#shopt -s globstar
# set variable identifying the chroot you work in (used in the prompt below)
if [ -z "${debian_chroot:-}" ] && [ -r /etc/debian_chroot ]; then
    debian_chroot=$(cat /etc/debian_chroot)
fi
# set a fancy prompt (non-color, unless we know we "want" color)
case "$TERM" in
    xterm-color|*-256color) color_prompt=yes;;
esac
# uncomment for a colored prompt, if the terminal has the capability; turned
# off by default to not distract the user: the focus in a terminal window
# should be on the output of commands, not on the prompt
#force_color_prompt=yes
if [ -n "$force_color_prompt" ]; then
    if [ -x /usr/bin/tput ] && tput setaf 1 >&/dev/null; then
        # We have color support; assume it's compliant with Ecma-48
        # (ISO/IEC-6429). (Lack of such support is extremely rare, and such
        # a case would tend to support setf rather than setaf.)
        color_prompt=yes
    else
        color_prompt=
    fi
fi
if [ "$color_prompt" = yes ]; then
    PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
else
    PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '
fi
unset color_prompt force_color_prompt
# If this is an xterm set the title to user@host:dir
case "$TERM" in
xterm*|rxvt*)
    PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
    ;;
*)
    ;;
esac
# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    #alias dir='dir --color=auto'
    #alias vdir='vdir --color=auto'
    alias grep='grep --color=auto'
    alias fgrep='fgrep --color=auto'
    alias egrep='egrep --color=auto'
fi
# colored GCC warnings and errors
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'
# some more ls aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
# Add an "alert" alias for long running commands.  Use like so:
#   sleep 10; alert
alias alert='notify-send --urgency=low -i "$([ $? = 0 ] && echo terminal || echo error)" "$(history|tail -n1|sed -e '\''s/^\s*[0-9]\+\s*//;s/[;&|]\s*alert$//'\'')"'
# Alias definitions.
# You may want to put all your additions into a separate file like
# ~/.bash_aliases, instead of adding them here directly.
# See /usr/share/doc/bash-doc/examples in the bash-doc package.
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi
# enable programmable completion features (you don't need to enable
# this, if it's already enabled in /etc/bash.bashrc and /etc/profile
# sources /etc/bash.bashrc).
if ! shopt -oq posix; then
  if [ -f /usr/share/bash-completion/bash_completion ]; then
    . /usr/share/bash-completion/bash_completion
  elif [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
  fi
fi
export GOROOT=/usr/local/go
export GOPATH=${HOME}/go
export PATH="${PATH}:${GOROOT}/bin"
EOF
cat << 'EOF' > ~/.profile
# ~/.profile: executed by Bourne-compatible login shells.
if [ "$BASH" ]; then
  if [ -f ~/.bashrc ]; then
    . ~/.bashrc
  fi
fi
eval "$(direnv hook bash)"
mesg n || true
EOF
cat << 'EOF' > ~/.gitconfig
[filter "lfs"]
  clean = git-lfs clean -- %f
  smudge = git-lfs smudge -- %f
  process = git-lfs filter-process
  required = true
[core]
  quotepath = false
  whitespace=fix,-indent-with-non-tab,trailing-space,cr-at-eol
  editor = code
[alias]
  st = status
  co = checkout
  br = branch
  up = rebase
  ci = commit
  lol = log --pretty=oneline --abbrev-commit --graph --decorate --all
[hub]
  protocol = https
[color]
  ui = true
[color "branch"]
  current = yellow black
  local = yellow
  remote = magenta
[color "diff"]
  meta = yellow bold
  frag = magenta bold
  old = red reverse
  new = green reverse
  whitespace = white reverse
[color "status"]
  added = yellow
  changed = green
  untracked = cyan reverse
  branch = magenta
[push]
  default = matching
EOF
# install direnv
apt update
apt install -y figlet lolcat fonts-powerline direnv watch tree vim
figlet $(date)
eval "$(direnv hook bash)"
direnv allow .
direnv allow ..
#pushd /tmp
#rm setup_*.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_docker.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_azure_cli.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_go.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_kubernetes_tools.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_system.sh
#wget https://raw.githubusercontent.com/jmspring/bedrock-dev-env/master/scripts/setup_terraform.sh
#chmod +x setup_*.sh
#figlet setup_system
#./setup_system.sh
#figlet setup_go
#./setup_go.sh
#figlet setup_terraform
#./setup_terraform.sh
#figlet setup_docker_WIATING_FOR_USER_INPUT
#./setup_docker.sh
#figlet setup_azure_cli
#./setup_azure_cli.sh
#figlet setup_kubernetes_tools
#./setup_kubernetes_tools.sh
#popd

figlet $(date)
figlet done
