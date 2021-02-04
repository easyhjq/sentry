#!/bin/bash
# This script correctly sets up pyenv
#
# Assumptions:
# - This script assumes you're calling from the top directory of the repository
set -eu

# Check if a command is available
require() {
    command -v "$1" >/dev/null 2>&1
}

query_big_sur() {
    if require sw_vers && sw_vers -productVersion | grep -E "11\." > /dev/null; then
        return 0
    fi
    return 1
}

# Determine if our shell is zsh or bash
get_shell_name() {
  case "$SHELL" in
    /bin/bash)
      echo "bash"
      ;;
    /bin/zsh)
      echo "zsh"
      ;;
  esac
}

get_shell_startup_script() {
  local _shell
  _shell=$(get_shell_name)

  if [ -n "$_shell" ]; then
    echo "$HOME/.${_shell}rc"
  fi
}

# Setup pyenv of path
setup_pyenv() {
  if command -v pyenv &>/dev/null; then
    echo "Installing Python (if missing) via pyenv"
    if query_big_sur; then
        # NOTE: pyenv 1.2.22 or greater does not require using LDFLAGS
        # https://github.com/pyenv/pyenv/pull/1711
        LDFLAGS="-L$(xcrun --show-sdk-path)/usr/lib ${LDFLAGS}" \
          pyenv install --patch 3.6.10 < \
          <(curl -sSL https://github.com/python/cpython/commit/8ea6353.patch)
    else
        pyenv install --skip-existing < .python-version | xargs -n1
    fi
  else
    echo "!!! pyenv not found, try running bootstrap script again or run \`brew bundle\` in the sentry repo"
    exit 1
  fi

  _startup_script=$(get_shell_startup_script)
  echo "Adding pyenv init (if missing) to ${_startup_script}..."

  if [ -n "$_startup_script" ]; then
    # shellcheck disable=SC2016
    if ! grep -qF 'eval "$(pyenv init -)"' "${_startup_script}"; then
      # pyenv init - is needed to include the pyenv shims in your PATH
      echo 'eval "$(pyenv init -)"' >> "${_startup_script}"
    fi
  fi

  eval "$(pyenv init -)"
}

setup_pyenv
