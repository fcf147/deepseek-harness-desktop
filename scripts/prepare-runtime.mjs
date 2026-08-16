#!/usr/bin/env node
/**
 * 组装桌面版 runtime 目录：
 *
 *   runtime/
 *     node/<platform>-<arch>/           内置免安装 Node.js 运行时
 *       win32-x64/node.exe
 *       linux-x64/bin/node (+lib, share)
 *       linux-arm64/bin/node ...
 *     dsh/                              dsh 安装根（含 node_modules 闭包）
 *       node_modules/@deepseek-ai/dsh/lib/bin.js
 *     templates/profiles/web/          web profile 骨架（复制到用户数据目录）
 *
 * dsh 安装根用 pnpm deploy 从官方仓库组装：它会把 @deepseek-ai/dsh 及其
 * 生产依赖（包括我们默认启用的 dsh-remote 与 ssh2）扁平化为一个可独立运行
 * 的 node_modules，无需用户安装全局 Node.js。
 *
 * 前置条件（仅构建机需要）：
 *   - 官方仓库已 `pnpm install && pnpm run build`（构建机需要 Node 22+ 与 pnpm）
 *   - 构建机可联网（下载免安装 Node 运行时）
 *
 * 用法：
 *   node scripts/prepare-runtime.mjs [--repo <path>] [--platform win32|linux]
 *                                    [--arch x64|arm64] [--node <dir>]
 *   --node <dir>  指定已解压的免安装 Node 目录，跳过下载（离线构建用）
 */

import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  createWriteStream,
  readdirSync,
  statSync,
} from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const RUNTIME_ROOT = path.join(DESKTOP_ROOT, 'runtime')

// ── 参数 ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { repo: null, platform: process.platform, arch: process.arch, nodeDir: null }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => argv[++i]
    if (flag === '--repo') args.repo = value()
    else if (flag === '--platform') args.platform = value()
    else if (flag === '--arch') args.arch = value()
    else if (flag === '--node') args.nodeDir = value()
    else throw new Error(`未知参数: ${flag}`)
  }
  if (!args.repo) args.repo = path.resolve(DESKTOP_ROOT, '..', 'repo', 'deepseek-harness-master')
  return args
}

// ── 日志 ────────────────────────────────────────────────────────────────────

const log = (msg) => console.log(`[prepare-runtime] ${msg}`)
const fail = (msg) => { console.error(`[prepare-runtime] 错误: ${msg}`); process.exit(1) }

// ── Node 运行时下载/复制 ────────────────────────────────────────────────────

/** Node.js 官方发布版本映射：平台/架构 -> 文件名中的后缀。 */
function nodeArchiveSuffix(platform, arch) {
  const archName = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : arch
  if (platform === 'win32') return `win-${archName}`
  if (platform === 'linux') return `linux-${archName}`
  return null // 不支持 macOS 等
}

function nodeRuntimeDir(platform, arch) {
  return path.join(RUNTIME_ROOT, 'node', `${platform}-${arch}`)
}

/**
 * 解析 Node 版本并构造下载 URL。默认取 latest 的 v22 LTS 线（满足 dsh 的
 * engines: ^22.19.0 || >=24.0.0），可用环境变量 NODE_MIRROR 覆盖镜像。
 */
function nodeDownloadInfo(platform, arch) {
  const version = process.env.DSH_DESKTOP_NODE_VERSION || 'v22.19.0'
  const suffix = nodeArchiveSuffix(platform, arch)
  if (!suffix) fail(`不支持的平台/架构: ${platform}-${arch}`)
  const base = process.env.NODE_MIRROR || 'https://nodejs.org/dist'
  const ext = platform === 'win32' ? 'zip' : 'tar.xz'
  const file = `node-${version}-${suffix}.${ext}`
  return { version, url: `${base}/${version}/${file}`, file }
}

async function download(url, dest) {
  log(`下载 ${url}`)
  const response = await fetch(url)
  if (!response.ok) fail(`下载失败: HTTP ${response.status} ${response.statusText} (${url})`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
}

async function extractArchive(archive, destDir, platform) {
  if (platform === 'win32') {
    // 免安装 zip 内含 node-vX-win-x64/ 目录；展开后取顶层。
    const { default: extract } = await import('extract-zip')
    await extract(archive, { dir: destDir })
    const inner = readSingleChildDir(destDir)
    if (inner) {
      const target = path.join(destDir, 'node-runtime')
      cpSync(inner, target, { recursive: true })
      rmSync(inner, { recursive: true, force: true })
    }
  } else {
    // tar.xz 免安装包。
    const { default: tar } = await import('tar')
    await tar.x({ file: archive, cwd: destDir, strip: 1 })
  }
}

function readSingleChildDir(dir) {
  const entries = readdirSync(dir)
  if (entries.length === 1) {
    const candidate = path.join(dir, entries[0])
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
  }
  return null
}

async function provisionNode(args) {
  const destDir = nodeRuntimeDir(args.platform, args.arch)
  if (existsSync(path.join(destDir, args.platform === 'win32' ? 'node.exe' : 'bin', args.platform === 'win32' ? 'node.exe' : 'node'))) {
    log(`Node 运行时已存在: ${destDir}`)
    return
  }
  mkdirSync(path.dirname(destDir), { recursive: true })

  if (args.nodeDir) {
    log(`复制免安装 Node 运行时: ${args.nodeDir} -> ${destDir}`)
    if (!existsSync(args.nodeDir)) fail(`--node 目录不存在: ${args.nodeDir}`)
    cpSync(args.nodeDir, destDir, { recursive: true })
    return
  }

  const info = nodeDownloadInfo(args.platform, args.arch)
  const tmp = path.join(os.tmpdir(), `dsh-node-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    const archive = path.join(tmp, info.file)
    await download(info.url, archive)
    await extractArchive(archive, tmp, args.platform)
    // 展开后可能产生 node-runtime 或单层目录；取实际 node 可执行文件所在层。
    const unpacked = readSingleChildDir(tmp)
    const src = unpacked || tmp
    // 清空可能残留的旧内容再复制
    rmSync(destDir, { recursive: true, force: true })
    mkdirSync(destDir, { recursive: true })
    cpSync(src, destDir, { recursive: true })
    // 确认 node 可执行文件就位（不同 Node 包布局：win 根目录 node.exe；linux bin/node）
    const exeName = args.platform === 'win32' ? 'node.exe' : 'node'
    const probe = args.platform === 'win32'
      ? path.join(destDir, 'node.exe')
      : path.join(destDir, 'bin', 'node')
    if (!existsSync(probe)) fail(`Node 运行时缺少可执行文件: ${probe}`)
    log(`Node 运行时就绪: ${destDir}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ── dsh 安装根（pnpm deploy）────────────────────────────────────────────────

function findPnpm(repoDir) {
  // 优先 pnpm 的 JS 入口（可用当前 node 直接执行，避免 cmd 壳对含空格
  // 路径的拆分问题）；其次仓库内 corepack/pnpm，最后全局命令。
  const workspaceRoot = path.resolve(DESKTOP_ROOT, '..')
  const candidates = [
    path.join(workspaceRoot, '.tools', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(workspaceRoot, '.tools', 'pnpm', 'dist', 'pnpm.cjs'),
    path.join(repoDir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return { type: 'js', path: c }
  }
  const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return { type: 'cmd', path: cmd }
}

async function deployDsh(args) {
  const dest = path.join(RUNTIME_ROOT, 'dsh')
  if (isDshReady(dest)) {
    log(`dsh 安装根已存在: ${dest}`)
    return
  }
  const repoDir = args.repo
  const cliDir = path.join(repoDir, 'apps', 'cli')
  const builtBin = path.join(cliDir, 'lib', 'bin.js')
  if (!existsSync(builtBin)) {
    fail(`仓库尚未构建: ${builtBin}\n请在仓库根目录先运行: pnpm install && pnpm run build`)
  }
  if (!existsSync(path.join(repoDir, 'pnpm-lock.yaml'))) {
    fail(`仓库缺少 pnpm-lock.yaml: ${repoDir}`)
  }

  const pnpm = findPnpm(repoDir)
  mkdirSync(path.dirname(dest), { recursive: true })
  rmSync(dest, { recursive: true, force: true })
  log(`pnpm deploy @deepseek-ai/dsh -> ${dest}`)
  // pnpm v10+ 默认只允许注入式 workspace 执行 deploy；本仓库未开
  // inject-workspace-packages，用 --legacy 走传统实现（仅安装生产依赖）。
  // 官方单文件构建（scripts/build-exe-for-python-sdk.ts）用 hoisted 布局，使
  // 每个包扁平落位在顶层 node_modules：profile 的模块回退目录（healProfiles
  // ModuleFallback）按字面路径解析闭包依赖，isolated 布局下嵌套依赖不可见。
  const deployArgs = [
    '--filter', '@deepseek-ai/dsh', 'deploy', '--legacy', '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    dest,
  ]
  // 子 postinstall（cpu-features、dsh-subprocess-local 的 ensure-spawn-helper）
  // 会直接调用 `node`，需把它所在目录放进 PATH。
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
  }
  const result = pnpm.type === 'js'
    ? spawnSync(process.execPath, [pnpm.path, ...deployArgs], { cwd: repoDir, stdio: 'inherit', env })
    : spawnSync(pnpm.path, deployArgs, {
        cwd: repoDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env,
      })
  if (result.status !== 0) fail(`pnpm deploy 失败 (exit=${result.status})`)
  if (!isDshReady(dest)) {
    // deploy 输出布局因 pnpm 版本而异：node_modules/@deepseek-ai/dsh 或目标根。
    const layout = readdirSync(dest).join(', ')
    fail(`pnpm deploy 完成后未找到 dsh CLI。目标目录内容: ${layout || '(空)'}`)
  }
  log(`dsh 安装根就绪: ${dest}`)
}

/**
 * 还原仓库 `link:` override 的 vendored 包（vendor/ 下的 rescope 源码）。
 * pnpm --legacy deploy 不会把 link override 指向的目录落入目标 node_modules，
 * 但 cordis 等包运行时直接 import 它们（@deepseek-ai/cosmokit、schemastery）。
 * 幂等：目标已存在则跳过。
 */
function restoreVendoredOverrides(dest, repoDir) {
  const overrides = {
    '@deepseek-ai/cosmokit': path.join(repoDir, 'vendor', 'cosmokit'),
    '@deepseek-ai/schemastery': path.join(repoDir, 'vendor', 'schemastery'),
  }
  for (const [name, source] of Object.entries(overrides)) {
    if (!existsSync(path.join(source, 'package.json'))) {
      fail(`vendored override 缺失: ${source}（仓库结构异常）`)
    }
    const target = path.join(dest, 'node_modules', ...name.split('/'))
    if (existsSync(target)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
    log(`还原 vendored 包: ${name} <- ${source}`)
  }
}

/** dsh CLI 是否已就绪：两种常见 deploy 布局都接受。 */
function isDshReady(dest) {
  return (
    existsSync(path.join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')) ||
    existsSync(path.join(dest, 'lib', 'bin.js'))
  )
}

/** 返回 deploy 目录中 dsh CLI 的实际路径（供打包校验/文档）。 */
function dshCliPath(dest) {
  const nested = path.join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const root = path.join(dest, 'lib', 'bin.js')
  return existsSync(nested) ? nested : root
}

// ── profile 模板 ────────────────────────────────────────────────────────────

function writeProfileTemplate() {
  const dir = path.join(RUNTIME_ROOT, 'templates', 'profiles', 'web')
  mkdirSync(dir, { recursive: true })
  // 与官方 PROFILE_TEMPLATES.web 一致：base + web-app（web-app bundle 已默认
  // 启用 dsh-remote，SSH 远程开发开箱即用）。
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2) + '\n')
  writeFileSync(path.join(dir, 'cordis.patch.yml'),
    '# 此 profile 的用户 patch 层：随包模板为空，dsh-remote 已由 web-app bundle 默认启用。\n[]\n')
  log(`profile 模板就绪: ${dir}`)
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  log(`repo: ${args.repo}`)
  log(`platform: ${args.platform}-${args.arch}`)
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  await provisionNode(args)
  await deployDsh(args)
  restoreVendoredOverrides(path.join(RUNTIME_ROOT, 'dsh'), args.repo)
  writeProfileTemplate()
  log('runtime 组装完成。')
}

main().catch((error) => {
  console.error('[prepare-runtime] 未捕获错误:', error)
  process.exit(1)
})
