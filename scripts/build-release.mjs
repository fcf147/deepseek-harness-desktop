#!/usr/bin/env node
/**
 * 一键发布构建脚本（当前环境：Linux x64 WSL，交叉构建 Windows 安装包）。
 *
 * 用法：
 *   node scripts/build-release.mjs [options]
 *
 * 自动完成：
 *   1. 环境检查（node / pnpm / git）
 *   2. 版本号处理：--version 指定时同步更新 desktop/package.json、
 *      desktop/package-lock.json、release 副本 package.json 的 version 字段
 *      （electron-builder 用 package.json 的 version 生成产物文件名与内嵌版本，
 *      不能只重命名 exe）
 *   3. repo 构建：pnpm install + pnpm run build（产出 apps/cli/lib/bin.js 与
 *      web dist，pnpm deploy 的前置；--skip-repo 可跳过）
 *   4. desktop 依赖检查（node_modules 缺 electron/electron-builder 时 npm install）
 *   5. 执行 npm run build:<platform>（win 或 linux）
 *   6. 生成 dist/ 产物 sha256 校验文件（sha256sums.txt，发布时随 Release 附带）
 *
 * 参数：
 *   --version <v>        构建版本号（默认沿用 desktop/package.json 现有版本；
 *                        指定时先更新版本字段再构建）
 *   --platform win|linux 目标平台（默认 win；linux 需在 Linux 构建机执行）
 *   --arch x64|arm64     架构（默认 x64）
 *   --node <version>     内置 Node 版本（默认 v22.19.0，透传 DSH_DESKTOP_NODE_VERSION）
 *   --mirror             设置国内镜像（NODE_MIRROR / ELECTRON_MIRROR /
 *                        ELECTRON_BUILDER_BINARIES_MIRROR 指向 npmmirror）
 *   --skip-repo          跳过 repo 构建（已构建过且未改源码时加速）
 *   --no-sha256          不生成 sha256sums.txt
 *   --help               显示帮助
 *
 * 示例：
 *   node scripts/build-release.mjs --version 0.1.2 --mirror
 *   node scripts/build-release.mjs --platform linux --skip-repo
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO = path.join(ROOT, 'repo', 'deepseek-harness-master')
const DESKTOP = path.join(ROOT, 'desktop')
const RELEASE_PKG = path.join(ROOT, 'release', 'deepseek-harness-desktop', 'package.json')

const MIRRORS = {
  NODE_MIRROR: 'https://npmmirror.com/mirrors/node',
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  // 注意：electron-builder-binaries 的 npmmirror 前缀必须是 registry.npmmirror.com/-/binary/
  //（https://npmmirror.com/mirrors/electron-builder-binaries/ 已失效 404）
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/',
}

// ── 参数 ────────────────────────────────────────────────────────────────────

const args = {
  version: null,
  platform: 'win',
  arch: 'x64',
  node: 'v22.19.0',
  mirror: false,
  skipRepo: false,
  sha256: true,
  keepDist: false,
}
const raw = process.argv.slice(2)
for (let i = 0; i < raw.length; i++) {
  const flag = raw[i]
  const value = () => raw[++i]
  if (flag === '--version') args.version = value()
  else if (flag === '--platform') args.platform = value()
  else if (flag === '--arch') args.arch = value()
  else if (flag === '--node') args.node = value()
  else if (flag === '--mirror') args.mirror = true
  else if (flag === '--skip-repo') args.skipRepo = true
  else if (flag === '--keep-dist') args.keepDist = true
  else if (flag === '--no-sha256') args.sha256 = false
  else if (flag === '--help') { usage(); process.exit(0) }
  else throw new Error(`未知参数: ${flag}（--help 查看用法）`)
}
if (!['win', 'linux'].includes(args.platform)) {
  throw new Error(`--platform 仅支持 win|linux，收到 ${args.platform}`)
}
if (!['x64', 'arm64'].includes(args.arch)) {
  throw new Error(`--arch 仅支持 x64|arm64，收到 ${args.arch}`)
}

function usage() {
  console.log(`用法: node scripts/build-release.mjs [options]

  --version <v>        构建版本号（默认沿用 desktop/package.json；指定时先更新版本字段）
  --platform win|linux 目标平台（默认 win）
  --arch x64|arm64     架构（默认 x64）
  --node <version>     内置 Node 版本（默认 v22.19.0）
  --mirror             设置 npmmirror 国内镜像环境变量
  --skip-repo          跳过 repo 构建
  --keep-dist          保留 dist/ 已有产物（默认构建前清空）
  --no-sha256          不生成 sha256sums.txt
  --help               显示本帮助`)
}

// ── 工具 ────────────────────────────────────────────────────────────────────

const log = (msg) => console.log(`[build-release] ${msg}`)
const fail = (msg) => { console.error(`[build-release] 错误: ${msg}`); process.exit(1) }

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`)
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    fail(`命令失败 (exit=${result.status}): ${cmd} ${cmdArgs.join(' ')}`)
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function bumpVersion(file, version) {
  const s = readFileSync(file, 'utf8')
  // 已是目标版本则幂等跳过（替换结果不变会被误判为字段缺失）
  if (readJson(file).version === version) return
  const replaced = s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
  if (replaced === s) fail(`未能在 ${path.relative(ROOT, file)} 中找到 version 字段`)
  writeFileSync(file, replaced)
}

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function distArtifacts() {
  const dist = path.join(DESKTOP, 'dist')
  if (!existsSync(dist)) return []
  return readdirSync(dist)
    .filter((f) => /\.(exe|7z|rpm|blockmap)$/i.test(f) && statSync(path.join(dist, f)).isFile())
    .map((f) => path.join(dist, f))
}

// ── 1) 环境检查 ─────────────────────────────────────────────────────────────

log('环境检查…')
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 22) fail(`Node ≥ 22 必需（当前 ${process.versions.node}）`)
for (const [bin, hint] of [['pnpm', 'npm i -g pnpm'], ['git', 'git']]) {
  const r = spawnSync(bin, ['--version'], { stdio: 'ignore' })
  if (r.status !== 0) fail(`缺少 ${bin}（${hint}）`)
}
log(`node ${process.versions.node} / pnpm OK / git OK，宿主平台 ${process.platform}-${process.arch}`)

// ── 2) 版本号处理 ───────────────────────────────────────────────────────────

const desktopPkg = path.join(DESKTOP, 'package.json')
const lockPkg = path.join(DESKTOP, 'package-lock.json')
let version = args.version
if (!version) {
  version = readJson(desktopPkg).version
  log(`未指定 --version，沿用现有版本 ${version}`)
} else {
  log(`版本号 -> ${version}`)
  bumpVersion(desktopPkg, version)
  if (existsSync(lockPkg)) bumpVersion(lockPkg, version)
  if (existsSync(RELEASE_PKG)) bumpVersion(RELEASE_PKG, version)
  log('已同步 desktop/package.json、desktop/package-lock.json、release 副本 package.json')
}

// ── 3) repo 构建 ────────────────────────────────────────────────────────────

if (args.skipRepo) {
  log('--skip-repo：跳过 repo 构建')
} else {
  const binJs = path.join(REPO, 'apps', 'cli', 'lib', 'bin.js')
  if (!existsSync(binJs)) log(`检测到 repo 未构建（缺 ${path.relative(ROOT, binJs)}），开始构建…`)
  else log('repo 已构建，幂等重建…')
  run('pnpm', ['install'], { cwd: REPO })
  run('pnpm', ['run', 'build'], { cwd: REPO })
  if (!existsSync(binJs)) fail(`repo 构建后仍缺 ${path.relative(ROOT, binJs)}`)
  log('repo 构建完成')
}

// ── 4) desktop 依赖 ─────────────────────────────────────────────────────────

const ebCli = path.join(DESKTOP, 'node_modules', 'electron-builder', 'cli.js')
if (existsSync(ebCli)) {
  log('desktop 依赖已就绪')
} else {
  log('desktop node_modules 缺少 electron-builder，npm install…')
  run('npm', ['install'], { cwd: DESKTOP })
}

// ── 4.5) 清空 dist ─────────────────────────────────────────────────────────

const distDir = path.join(DESKTOP, 'dist')
if (existsSync(distDir)) {
  if (args.keepDist) {
    log('--keep-dist：保留 dist/ 已有产物')
  } else {
    log('清空 dist/…')
    rmSync(distDir, { recursive: true, force: true })
  }
}

// ── 5) 执行构建 ─────────────────────────────────────────────────────────────

const env = { ...process.env, DSH_DESKTOP_NODE_VERSION: args.node }
if (args.mirror) {
  log('启用 npmmirror 镜像环境变量')
  Object.assign(env, MIRRORS)
}
log(`构建 ${args.platform}-${args.arch}（内置 Node ${args.node}）…`)
// 直接调 build.mjs（绕开 npm run 的参数透传；build.mjs 内部会依次执行
// prepare-runtime -> electron-builder -> 归档）
const buildScript = path.join(DESKTOP, 'scripts', 'build.mjs')
run(process.execPath, [buildScript, '--platform', args.platform, '--arch', args.arch], { cwd: DESKTOP, env })

// ── 6) sha256 校验文件 ──────────────────────────────────────────────────────

const artifacts = distArtifacts()
if (artifacts.length === 0) fail('dist/ 下未找到产物（exe/7z/rpm/blockmap）')
if (args.sha256) {
  const sums = artifacts.map((f) => `${sha256Of(f)}  ${path.basename(f)}`).join('\n') + '\n'
  writeFileSync(path.join(DESKTOP, 'dist', 'sha256sums.txt'), sums)
  log(`已生成 dist/sha256sums.txt（${artifacts.length} 个文件）`)
}

// ── 汇总 ────────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════')
console.log(`  构建完成：${args.platform}-${args.arch} / v${version}`)
console.log('════════════════════════════════════════════════')
for (const f of artifacts) {
  const size = (statSync(f).size / 1024 / 1024).toFixed(1)
  console.log(`  ${path.basename(f)}  (${size} MB)`)
  if (args.sha256) console.log(`    sha256  ${sha256Of(f)}`)
}
console.log(`\n产物目录：${path.join(DESKTOP, 'dist')}`)
console.log('发布提示：exe 与 dsh-runtime.7z 必须放在同一目录安装；发布时随附 sha256sums.txt。')
