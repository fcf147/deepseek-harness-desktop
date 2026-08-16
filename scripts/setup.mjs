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
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO = path.join(ROOT, 'repo', 'deepseek-harness-master')
const DESKTOP = path.join(ROOT, 'desktop')

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

// ── 2. 官方仓库：依赖 + 构建 ───────────────────────────────

if (!existsSync(path.join(REPO, 'package.json'))) {
  fail(`未找到官方仓库 ${REPO}`)
}
log(`官方仓库: ${REPO}`)

const repoEnv = { ...process.env }
// 子 postinstall（cpu-features 等）直接调用 node，需把 node 所在目录放进 PATH
const nodeDir = path.dirname(node)
repoEnv.PATH = `${nodeDir}${path.delimiter}${repoEnv.PATH || ''}`

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
