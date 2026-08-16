#!/usr/bin/env node
/**
 * 一键开发准备脚本。
 *
 * 用法：clone 本仓库后执行
 *   node scripts/setup.mjs
 *
 * 自动完成：
 *   1. 环境检查（node / pnpm / git）
 *   2. 官方仓库（repo/deepseek-harness-master）：pnpm install + pnpm run build
 *      （仓库已应用桌面版补丁，clone 即含；lib/ 产物已随仓库提供，
 *       若需要重新构建或源码改动后重建，本步骤会幂等执行）
 *   3. 桌面壳（desktop/）：npm install + prepare-runtime（组装内置 Node + dsh 安装根 + profile 模板）
 *
 * 完成后即可：
 *   cd desktop && npm run build:win     # Windows 安装包 + dsh-runtime.7z
 *   cd desktop && npm run build:linux   # Linux rpm
 *
 * 环境变量（可选）：
 *   NODE_MIRROR / ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR  国内镜像
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO = path.join(ROOT, 'repo', 'deepseek-harness-master')
const DESKTOP = path.join(ROOT, 'desktop')
const TOOLS = path.join(ROOT, '.tools')
const GIT_MIRROR_ROOT = path.join(TOOLS, 'git-mirror')

function fail(msg) {
  console.error(`\n[setup] 失败: ${msg}`)
  process.exit(1)
}

function log(msg) {
  console.log(`\n[setup] ${msg}`)
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    fail(`${cmd} 退出码 ${result.status}`)
  }
}

// ── 1. 环境检查 ────────────────────────────────────────────

log('环境检查')
const node = process.execPath
const nodeOk = spawnSync(node, ['--version'], { encoding: 'utf8' })
if (nodeOk.status !== 0) fail('Node.js 不可用（需要 ≥ 22）')
const nodeVer = nodeOk.stdout.trim()
log(`Node.js: ${nodeVer}`)

// pnpm：优先仓库内 / 桌面壳 node_modules 中的 pnpm，其次 PATH
let pnpm = null
const pnpmCandidates = [
  path.join(REPO, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  path.join(DESKTOP, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
]
for (const c of pnpmCandidates) {
  if (existsSync(c)) { pnpm = { js: c }; break }
}
if (!pnpm) {
  const probe = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], { encoding: 'utf8' })
  if (probe.status !== 0) fail('未找到 pnpm（npm install -g pnpm 或 corepack enable）')
  pnpm = { cmd: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm' }
  log(`pnpm: ${probe.stdout.trim()}`)
} else {
  const probe = spawnSync(node, [pnpm.js, '--version'], { encoding: 'utf8' })
  log(`pnpm: ${probe.stdout ? probe.stdout.trim() : '(来自仓库 node_modules)'}`)
}

// ── 1.5 GitHub 可达性检测 + 本地 git 镜像（离线构建方案）────

/**
 * dsh-memory-evolve 仅发布在 GitHub（git 依赖，指向 #main 分支）。
 * 当 github.com 不可达时，pnpm install/deploy 会失败。本模块：
 *   1. 探测 github.com 连通性（node fetch，curl/PowerShell 可能被网络策略限制）
 *   2. 不可达时，用仓库内预置的源码快照（repo/vendor/dsh-memory-evolve，
 *      若存在）创建本地 git 裸仓库，并配置 git `url.<local>.insteadOf`
 *      把 https://github.com/dsh-external/dsh-memory-evolve.git 重定向到本地，
 *      使 pnpm 的 git 依赖解析完全离线。
 *
 * 预置快照缺失时给出明确提示（可自行从可联网机器获取该仓库源码放入
 * repo/vendor/dsh-memory-evolve/ 后重跑）。
 */
async function ensureGitHubAccess() {
  const probe = async () => {
    try {
      const res = await fetch('https://api.github.com', { signal: AbortSignal.timeout(10000) })
      return res.ok || res.status === 404 // 404 也说明 TLS/网络可达
    } catch {
      return false
    }
  }
  const reachable = await probe()
  if (reachable) {
    log('GitHub 可达，git 依赖走官方源')
    return
  }
  log('GitHub 不可达，启用本地 git 镜像（离线构建方案）')

  const mirrorDir = path.join(GIT_MIRROR_ROOT, 'dsh-memory-evolve.git')
  const snapshot = path.join(REPO, 'vendor', 'dsh-memory-evolve')
  if (!existsSync(path.join(snapshot, 'package.json'))) {
    fail(`离线方案需要仓库预置源码快照: ${snapshot}\n请从可联网机器 clone https://github.com/dsh-external/dsh-memory-evolve.git 后复制到该目录，再重跑本脚本。`)
  }

  if (!existsSync(path.join(mirrorDir, 'HEAD'))) {
    mkdirSync(GIT_MIRROR_ROOT, { recursive: true })
    const work = path.join(GIT_MIRROR_ROOT, '.work-memory-evolve')
    rmSync(work, { recursive: true, force: true })
    cpSync(snapshot, work, { recursive: true })
    rmSync(path.join(work, '.git'), { recursive: true, force: true })
    const git = process.platform === 'win32' ? 'git.exe' : 'git'
    const steps = [
      [git, ['init', '-b', 'main'], { cwd: work }],
      [git, ['add', '-A'], { cwd: work }],
      [git, ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', 'commit', '-m', 'dsh-memory-evolve snapshot'], { cwd: work }],
      [git, ['clone', '--bare', work, mirrorDir], { cwd: GIT_MIRROR_ROOT }],
    ]
    for (const [cmd, args, opts] of steps) {
      const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
      if (r.status !== 0) fail(`本地镜像创建失败: ${cmd} ${args.join(' ')}`)
    }
    rmSync(work, { recursive: true, force: true })
    log(`本地镜像已创建: ${mirrorDir}`)
  } else {
    log(`本地镜像已存在: ${mirrorDir}`)
  }

  // 配置 insteadOf 重定向（幂等）
  const git = process.platform === 'win32' ? 'git.exe' : 'git'
  for (const from of [
    'https://github.com/dsh-external/dsh-memory-evolve.git',
    'git+https://github.com/dsh-external/dsh-memory-evolve.git',
    'https://github.com/dsh-external/dsh-memory-evolve',
  ]) {
    spawnSync(git, ['config', '--global', `url.file://${mirrorDir}.insteadOf`, from])
  }
  log('已配置 git insteadOf 重定向到本地镜像')
}

// ── 2. 官方仓库：依赖 + 构建 ───────────────────────────────

if (!existsSync(path.join(REPO, 'package.json'))) {
  fail(`未找到官方仓库 ${REPO}`)
}
log(`官方仓库: ${REPO}`)

await ensureGitHubAccess()

const repoEnv = { ...process.env }
// 子 postinstall（cpu-features 等）直接调用 node，需把 node 所在目录放进 PATH
const nodeDir = path.dirname(node)
repoEnv.PATH = `${nodeDir}${path.delimiter}${repoEnv.PATH || ''}`
// 默认走 npmmirror registry（npmjs.org 直连在部分网络被限）；可设 npm_config_registry 覆盖
repoEnv.npm_config_registry = repoEnv.npm_config_registry || 'https://registry.npmmirror.com'

if (pnpm.js) {
  run(node, [pnpm.js, 'install'], { cwd: REPO, env: repoEnv })
  run(node, [pnpm.js, 'run', 'build'], { cwd: REPO, env: repoEnv })
} else {
  run(pnpm.cmd, ['install'], { cwd: REPO, env: repoEnv })
  run(pnpm.cmd, ['run', 'build'], { cwd: REPO, env: repoEnv })
}

// ── 3. 桌面壳：依赖 + runtime 组装 ─────────────────────────

if (!existsSync(path.join(DESKTOP, 'package.json'))) {
  fail(`未找到桌面壳工程 ${DESKTOP}`)
}
log(`桌面壳: ${DESKTOP}`)

// npm install（npm 随 node 分发，用 node 调 npm-cli 更稳）
const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
if (existsSync(npmCli)) {
  run(node, [npmCli, 'install', '--no-audit', '--no-fund'], { cwd: DESKTOP })
} else {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: DESKTOP })
}

// 组装 runtime（幂等：已存在则跳过）
const prepare = path.join(DESKTOP, 'scripts', 'prepare-runtime.mjs')
run(node, [prepare, '--repo', REPO, '--platform', process.platform], { cwd: DESKTOP, env: repoEnv })

log('开发环境准备完成！')
console.log(`
下一步：
  cd desktop
  npm run build:win      # Windows 安装包 + dsh-runtime.7z（<100MB 拆分发布）
  npm run build:linux    # Linux rpm
  # 开发调试：npm run start（需先组装过 runtime）
`)
