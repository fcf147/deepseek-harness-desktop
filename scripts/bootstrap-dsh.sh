#!/usr/bin/env bash
# ============================================================================
# bootstrap-dsh.sh — 在 WSL 发行版内安装 DeepSeek Harness（dsh）
# ----------------------------------------------------------------------------
# 由 WebUI Shell 通过 `wsl -d <distro> -e bash -c "curl -fsSL <script> | bash"`
# 执行。脚本输出实时流式传输到桌面壳日志面板。
#
# 设计取舍（规避 README 已知坑）：
#   - Node.js 锁 20.x（LTS，dsh 兼容性稳定）
#   - dsh 锁版本（默认 0.1.0，避免上游 CLI 变更破坏壳），可改下方 DSH_VERSION
#   - 区分 Ubuntu/Debian 与 Fedora；其他发行版显式报错而非静默失败
# ============================================================================
set -eu
# pipefail 仅 bash 支持；在 sh/dash 下跳过，避免 "set: pipefail: invalid option name"
if [ -n "${BASH_VERSION:-}" ]; then set -o pipefail; fi

DSH_VERSION="${DSH_VERSION:-0.1.0}"

echo "==> 检测 Linux 发行版..."
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO="${ID:-unknown}"
else
  DISTRO="unknown"
fi
echo "    发行版: ${DISTRO}"

echo "==> 安装 Node.js 20.x..."
case "$DISTRO" in
  ubuntu|debian)
    if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get update && apt-get install -y nodejs
    else
      echo "    Node 已满足要求，跳过安装"
    fi
    ;;
  fedora)
    dnf install -y nodejs npm
    ;;
  *)
    echo "不支持的发行版: $DISTRO，请手动安装 Node.js 20+" >&2
    exit 1
    ;;
esac

echo "==> 验证 Node.js: $(node -v) / npm $(npm -v)"

echo "==> 安装 DeepSeek Harness@${DSH_VERSION}..."
npm install -g "@deepseek-ai/dsh@${DSH_VERSION}"

echo "==> 验证安装..."
dsh --version

echo "==> DeepSeek Harness 安装完成"
