#!/usr/bin/env node
/**
 * 组装桌面版 runtime 目录：
 *
 *   runtime/
 *     node/<platform>-<arch>/           内置免安装 Node.js 运行时（仅 Windows 等目标内置；
 *       win32-x64/node.exe              linux 目标不下载/不内置，运行时由 main.js
 *       linux-x64/bin/node (+lib, share)  检测系统 Node 并按发行版提示补全）
 *     dsh/                              dsh 安装根（含 node_modules 闭包）
 *       node_modules/@deepseek-ai/dsh/lib/bin.js
 *     templates/profiles/web/          web profile 骨架（复制到用户数据目录）
 *
 * dsh 安装根用 pnpm deploy 从官方仓库组装：它会把 @deepseek-ai/dsh 及其
 * 生产依赖扁平化为一个可独立运行的 node_modules，无需用户安装全局 Node.js。
 *
 * Node 版本策略：Windows 目标构建时从 nodejs.org index.json 动态解析"最新满足
 * dsh engines（^22.19.0 || >=24.0.0）的 LTS 版本"下载免安装包；可用环境变量
 * DSH_DESKTOP_NODE_VERSION 固定版本（跳过网络解析），NODE_MIRROR 覆盖镜像。
 * Linux 目标不内置 Node。
 *
 * 前置条件（仅构建机需要）：
 *   - 官方仓库已 `pnpm install && pnpm run build`（构建机需要 Node 22+ 与 pnpm）
 *   - 构建机可联网（Windows 目标下载免安装 Node 运行时；linux 目标无需）
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
  readlinkSync,
  readFileSync,
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

/** dsh 对 Node 的 engines 要求（repo/package.json 原样）。 */
const NODE_ENGINES_RANGE = '^22.19.0 || >=24.0.0'

/** 版本是否满足 engines（^22.19.0 即 22.x 且 minor>=19；>=24.0.0 即 major>=24）。 */
function satisfiesNodeEngines(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version || '')
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  return (major === 22 && minor >= 19) || major >= 24
}

/** 带重试退避的 fetch（WSL/弱网下偶发 ETIMEDOUT，重试可扛过抖动）。 */
async function fetchWithRetry(url, { attempts = 3, timeoutMs = 20000 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        const delay = attempt * 2000
        log(`网络请求失败（${error.message}），${delay / 1000}s 后第 ${attempt + 1}/${attempts} 次重试…`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

/**
 * 解析"最新符合要求的 Node 版本"：抓取 index.json，过滤满足 engines 的版本，
 * 优先取最新 LTS（桌面内置优先稳定性），无 LTS 时取满足范围内的最新版。
 * 可用环境变量 DSH_DESKTOP_NODE_VERSION 固定版本（跳过网络解析）。
 */
async function resolveNodeVersion(base) {
  const pinned = process.env.DSH_DESKTOP_NODE_VERSION
  if (pinned) {
    log(`Node 版本由 DSH_DESKTOP_NODE_VERSION 固定: ${pinned}`)
    return pinned.startsWith('v') ? pinned : `v${pinned}`
  }
  const indexUrl = `${String(base).replace(/\/+$/, '')}/index.json`
  log(`解析最新合规 Node 版本: ${indexUrl}`)
  let releases = null
  try {
    const response = await fetchWithRetry(indexUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    releases = await response.json()
  } catch (error) {
    log(`警告: 获取 Node 版本列表失败（${error.message}），回退默认 v22.19.0`)
    return 'v22.19.0'
  }
  const compliant = releases.filter((r) => satisfiesNodeEngines(r.version))
  if (compliant.length === 0) {
    log(`警告: 没有满足 ${NODE_ENGINES_RANGE} 的 Node 版本，回退默认 v22.19.0`)
    return 'v22.19.0'
  }
  const lts = compliant.find((r) => r.lts)
  const chosen = lts || compliant[0]
  log(`选择 Node ${chosen.version}${chosen.lts ? `（LTS ${chosen.lts}）` : '（最新非 LTS）'}`)
  return chosen.version
}

/**
 * 解析 Node 版本并构造下载 URL。版本由 resolveNodeVersion 动态解析（最新合规
 * LTS），可用环境变量 NODE_MIRROR 覆盖镜像（index.json 与发行包同根）。
 */
async function nodeDownloadInfo(platform, arch) {
  const base = process.env.NODE_MIRROR || 'https://nodejs.org/dist'
  const version = await resolveNodeVersion(base)
  const suffix = nodeArchiveSuffix(platform, arch)
  if (!suffix) fail(`不支持的平台/架构: ${platform}-${arch}`)
  const ext = platform === 'win32' ? 'zip' : 'tar.xz'
  const file = `node-${version}-${suffix}.${ext}`
  return { version, url: `${base}/${version}/${file}`, file }
}

async function download(url, dest) {
  log(`下载 ${url}`)
  // 大文件下载也走重试（WSL/弱网偶发 ETIMEDOUT；已落盘的零碎文件先删掉）
  const response = await fetchWithRetry(url, { attempts: 3, timeoutMs: 120000 })
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
    // tar.xz 免安装包。tar v7 的 ESM 无 default 导出，需用 named export。
    const { x: tarExtract } = await import('tar')
    await tarExtract({ file: archive, cwd: destDir, strip: 1 })
  }
}

function readSingleChildDir(dir) {
  const entries = readdirSync(dir).filter((entry) => {
    const candidate = path.join(dir, entry)
    return existsSync(candidate) && statSync(candidate).isDirectory()
  })
  if (entries.length === 1) return path.join(dir, entries[0])
  return null
}

async function provisionNode(args) {
  const destDir = nodeRuntimeDir(args.platform, args.arch)
  // 就绪探针：win 布局 node.exe 在根目录；linux 布局 bin/node。
  const nodeProbe = args.platform === 'win32'
    ? path.join(destDir, 'node.exe')
    : path.join(destDir, 'bin', 'node')
  if (existsSync(nodeProbe)) {
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

  const info = await nodeDownloadInfo(args.platform, args.arch)
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

// ── pnpm 预置（供插件市场使用）───────────────────────────────────────────────

/**
 * 把 pnpm 安装进内置 Node 目录并生成平台 shim：
 *   win32-x64/pnpm.cmd   （Windows：node.exe 同目录）
 *   linux-x64/bin/pnpm   （Linux：bin/ 下与 node 同目录）
 *
 * 桌面版 `dsh plugin` 命令都从 PATH 解析 pnpm；Electron
 * 壳启动 dsh 时会把该目录加入 PATH（见 desktop/main.js startServer）。用内置
 * node 自带的 npm 安装，避免依赖构建机全局 npm/pnpm，也无需额外下载平台二进制；
 * 运行时零写入（runtime 目录位于安装位置下，对普通用户可能不可写——运行期
 * `corepack enable` / `npm install -g` 都会因权限失败，构建期预置则无此问题）。
 */
async function provisionPnpm(args) {
  const nodeDir = nodeRuntimeDir(args.platform, args.arch)
  const probe = args.platform === 'win32'
    ? path.join(nodeDir, 'pnpm.cmd')
    : path.join(nodeDir, 'bin', 'pnpm')
  if (existsSync(probe)) {
    log(`pnpm 已预置: ${probe}`)
    return
  }
  const nodeExe = args.platform === 'win32'
    ? path.join(nodeDir, 'node.exe')
    : path.join(nodeDir, 'bin', 'node')
  const npmCli = args.platform === 'win32'
    ? path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(nodeExe)) fail(`内置 Node 缺失: ${nodeExe}`)
  if (!existsSync(npmCli)) fail(`内置 npm 缺失: ${npmCli}（免安装 Node 发行版应自带 npm）`)
  const version = process.env.DSH_DESKTOP_PNPM_VERSION || '10'

  // 交叉构建（如 Linux 上构建 win32）：目标平台的 node.exe 无法在宿主执行。
  // 改为用宿主 npm 把 pnpm 包装入目标 node 的 node_modules，再按 Windows 全局
  // 安装布局生成 pnpm.cmd / pnpm.ps1 shim（npm -g 在 Windows 上的等价产物）。
  if (args.platform !== process.platform) {
    log(`交叉构建 ${args.platform}，用宿主 npm 安装 pnpm@${version} 并生成 shim`)
    const stage = path.join(os.tmpdir(), `dsh-pnpm-${Date.now()}`)
    mkdirSync(stage, { recursive: true })
    try {
      const result = spawnSync(process.execPath, [npmCli, 'install', '--prefix', stage, `pnpm@${version}`, '--no-save', '--no-audit', '--no-fund'], {
        stdio: 'inherit',
      })
      if (result.status !== 0) {
        fail(`pnpm 安装失败 (exit=${result.status})。如网络受限，请先配置 npm registry 镜像（npm config set registry https://registry.npmmirror.com）后重试`)
      }
      const pkgSource = path.join(stage, 'node_modules', 'pnpm')
      if (!existsSync(path.join(pkgSource, 'bin', 'pnpm.cjs'))) {
        fail(`宿主 npm 未产出 pnpm 包: ${pkgSource}`)
      }
      mkdirSync(path.join(nodeDir, 'node_modules'), { recursive: true })
      cpSync(pkgSource, path.join(nodeDir, 'node_modules', 'pnpm'), { recursive: true })
      writeFileSync(path.join(nodeDir, 'pnpm.cmd'),
        '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\pnpm\\bin\\pnpm.cjs" %*\r\n')
      writeFileSync(path.join(nodeDir, 'pnpm.ps1'),
        '#!/usr/bin/env pwsh\r\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\r\n\r\n$exe=""\r\nif ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {\r\n  $exe=".exe"\r\n}\r\n$ret=0\r\nif (Test-Path "$basedir/node$exe") {\r\n  if ($MyInvocation.ExpectingInput) {\r\n    $input | & "$basedir/node$exe"  "$basedir/node_modules/pnpm/bin/pnpm.cjs" $args\r\n  } else {\r\n    & "$basedir/node$exe"  "$basedir/node_modules/pnpm/bin/pnpm.cjs" $args\r\n  }\r\n  $ret=$LASTEXITCODE\r\n} else {\r\n  if ($MyInvocation.ExpectingInput) {\r\n    $input | & "node$exe"  "$basedir/node_modules/pnpm/bin/pnpm.cjs" $args\r\n  } else {\r\n    & "node$exe"  "$basedir/node_modules/pnpm/bin/pnpm.cjs" $args\r\n  }\r\n  $ret=$LASTEXITCODE\r\n}\r\nexit $ret\r\n')
      log(`pnpm 就绪: ${probe}`)
      return
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }

  log(`安装 pnpm@${version} 到内置 Node 目录: ${nodeDir}`)
  const result = spawnSync(nodeExe, [npmCli, 'install', '-g', `pnpm@${version}`, '--prefix', nodeDir], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    fail(`pnpm 安装失败 (exit=${result.status})。如网络受限，请先配置 npm registry 镜像（npm config set registry https://registry.npmmirror.com）后重试`)
  }
  if (!existsSync(probe)) {
    fail(`pnpm 安装完成后未生成 shim: ${probe}（npm 的 --prefix 布局与预期不符）`)
  }
  log(`pnpm 就绪: ${probe}`)
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
    // 放行子依赖中的 exotic（git/非 registry）依赖，避免 deploy 拒绝非常规来源的子依赖。
    '--config.blockExoticSubdeps=false',
  ]
  // 交叉构建（如 Linux 宿主构建 win32 目标）：平台分包的 optionalDependencies
  // （koffi 3.x 的 @koromix/koffi-<platform>、sharp 的 @img/sharp-<platform>、
  // node-addon-require-builtin-<platform> 等）按宿主平台解析。注意：官方 rc.8
  // 基线未在 repo/pnpm-workspace.yaml 配置 supportedArchitectures，因此 Linux
  // 宿主上 deploy 只装 Linux 版原生模块，产物不适用于 Windows；若需在 Linux 上
  // 交叉构建 win32，须先在 repo/pnpm-workspace.yaml 追加 supportedArchitectures
  // （os: [current, win32]）并重新 pnpm install，使 store 含有 win32-x64 平台包。
  // 正式 Windows 安装包应在 Windows 构建机执行（pnpm 原生解析 win32 平台包）。
  // 注：node-gyp 现场编译的包（cpu-features、ssh2 的 sshcrypto）仍会
  // 编出宿主版本，但它们是可选加速，缺失时运行库自动降级（ssh2 走纯 JS），
  // 可接受。
  if (args.platform !== process.platform) {
    log(`交叉构建 ${args.platform}：注意 rc.8 官方基线未配置 supportedArchitectures，产物可能缺少目标平台原生模块`)
  }
  deployArgs.push(dest)
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
 * 但 cordis 等包运行时直接 import 它们（@deepseek-ai/cosmokit、schemastery、
 * cordis-plugin-group）。幂等：目标已存在则跳过。
 * 注：cordis-plugin-group 是 dsh-app-boot 的 peerDependency（workspace:^ →
 * vendor/group），deploy 参数 auto-install-peers=false 不会自动落盘，须随
 * cosmokit/schemastery 一并还原，否则 dsh 启动时报 ERR_MODULE_NOT_FOUND。
 */
function restoreVendoredOverrides(dest, repoDir) {
  const overrides = {
    '@deepseek-ai/cosmokit': path.join(repoDir, 'vendor', 'cosmokit'),
    '@deepseek-ai/schemastery': path.join(repoDir, 'vendor', 'schemastery'),
    '@deepseek-ai/cordis-plugin-group': path.join(repoDir, 'vendor', 'group'),
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

/**
 * 还原仓库中「仅以 peerDependencies / devDependencies 声明的纯 workspace 包」。
 *
 * 背景：`pnpm deploy --legacy --prod --config.auto-install-peers=false` 不会把
 * peer 依赖落入闭包（pnpm 认为应由宿主提供）。但 DeepSeek Harness 的众多核心
 * 包（dsh-llm、dsh-agent、dsh-client-connection 等）都把内部工具包
 * `@deepseek-ai/dsh-timeout`、`@deepseek-ai/dsh-scope` 等声明为 peer，官方仓库
 * 靠 `linkWorkspacePackages: true` 的 workspace 软链解析。deploy 到独立闭包时这些
 * 包不会落盘，运行期即 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-timeout'`
 * （Windows 启动崩溃的根因）。
 *
 * 修复：扫描仓库中**所有** `@deepseek-ai/dsh-*` workspace 包（packages/*/*），
 * 凡是 runtime 闭包 node_modules 里缺失、且已构建出 lib/ 的，就从仓库源码复制进
 * 闭包。这与官方 workspace 软链语义一致，且不改动官方任何代码。幂等：已存在则跳过。
 *
 * 安全边界：只还原「缺失」的包；若某包已在闭包中（由 deploy 正常解析），不动它，
 * 以免覆盖 pnpm 已做好的版本解析。
 */
function restoreWorkspacePackages(dest, repoDir) {
  const pkgsRoot = path.join(repoDir, 'packages')
  if (!existsSync(pkgsRoot)) {
    log(`警告: 未找到仓库 packages 目录: ${pkgsRoot}，跳过 workspace 包还原`)
    return
  }
  const nodeModules = path.join(dest, 'node_modules')
  const seen = new Set()
  let count = 0
  for (const scopeDir of readdirSync(pkgsRoot)) {
    const scopePath = path.join(pkgsRoot, scopeDir)
    if (!statSync(scopePath).isDirectory()) continue
    for (const pkgDir of readdirSync(scopePath)) {
      const pkgPath = path.join(scopePath, pkgDir)
      if (!statSync(pkgPath).isDirectory()) continue
      const pkgJson = path.join(pkgPath, 'package.json')
      if (!existsSync(pkgJson)) continue
      let name
      try {
        name = JSON.parse(readFileSync(pkgJson, 'utf8')).name
      } catch {
        continue
      }
      if (!name || !name.startsWith('@deepseek-ai/dsh-')) continue
      if (seen.has(name)) continue
      seen.add(name)
      const target = path.join(nodeModules, ...name.split('/'))
      if (existsSync(target)) continue // 已由 deploy 解析，跳过
      // 包需已构建（含 lib/），否则复制源码无法运行；缺失 lib 时跳过并按警告记录。
      if (!existsSync(path.join(pkgPath, 'lib'))) {
        log(`警告: workspace 包 ${name} 尚未构建（缺 lib/），未还原；请在仓库先 pnpm run build`)
        continue
      }
      mkdirSync(path.dirname(target), { recursive: true })
      cpSync(pkgPath, target, { recursive: true })
      count++
      log(`还原 workspace 包: ${name} <- ${pkgPath}`)
    }
  }
  if (count > 0) log(`补齐 ${count} 个缺失的 workspace 包到闭包`)
}

/**
 * 展开目录树中的所有符号链接为真实内容副本（幂等）。
 * 背景：pnpm 在 Linux 上生成的 node_modules/.bin/* 是符号链接；Windows 版
 * 7za 解压包含符号链接条目的 7z 归档会失败（installer.nsh 报「运行时解压
 * 失败」），且链接目标在 Windows 上通常无效。构建期展开后归档内只有普通
 * 文件，Windows 解压即可用。
 */
function dereferenceLinks(dir) {
  if (!existsSync(dir)) return 0
  let count = 0
  const walk = (cur) => {
    let entries
    try { entries = readdirSync(cur, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const p = path.join(cur, entry.name)
      if (entry.isSymbolicLink()) {
        const target = path.resolve(cur, readlinkSync(p))
        if (!existsSync(target)) {
          log(`警告: 悬空符号链接，跳过: ${p} -> ${target}`)
          continue
        }
        rmSync(p, { recursive: true, force: true })
        if (statSync(target).isDirectory()) cpSync(target, p, { recursive: true })
        else cpSync(target, p)
        count++
      } else if (entry.isDirectory()) {
        walk(p)
      }
    }
  }
  walk(dir)
  if (count > 0) log(`已展开符号链接 ${count} 个（Windows 解压兼容）`)
  return count
}

/**
 * 从 repo 的 pnpm 虚拟 store（node_modules/.pnpm）把目标平台的平台分包
 * （@koromix/koffi-win32-x64、@img/sharp-<platform>、@img/sharp-libvips-<platform>、
 * node-addon-require-builtin-<platform> 等）复制进 deploy 产物 node_modules。
 * 背景：pnpm deploy --legacy 对 optionalDependencies 的平台包选择不完整
 * （sharp 的全平台 optionalDeps 一个都没装，koffi 只装宿主版），而 repo 的
 * pnpm install 在 supportedArchitectures（repo/pnpm-workspace.yaml）下已下载
 * 目标平台二进制（.pnpm 虚拟 store 中）。直接复制保证 dsh-runtime 在目标
 * 平台（Windows 安装包 / Linux rpm）可加载原生模块，Windows 上尤甚
 * （session-persistence-jsonl / fs-local 无条件 import koffi）。
 */
// 排除的超大「外部 CLI」平台包：memory-evolve 的 COI 调度（claude/codex 等
// 外部 AI）在运行时从用户 PATH 解析，不需要随包内置；claude.exe 单文件 254MB，
// 打入归档会让 dsh-runtime.7z 暴涨且压缩/解压极慢。
const EXCLUDE_PLATFORM_PKGS = [
  '@anthropic-ai/claude-agent-sdk-win32-x64',
  '@openai/codex-win32-x64',
]

/** 平台分包后缀（用于从平台包名推导主包名）。 */
const PLATFORM_SUFFIX_RE = /-(win32|linux|darwin|freebsd|openbsd|musl)[a-z0-9_-]*$/

function readPkgVersion(pkgJsonPath) {
  try {
    return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version
  } catch {
    return null
  }
}

/** 在 runtime node_modules 中查找平台包对应的主包（如 @koromix/koffi-win32-x64 -> koffi）。 */
function findMainPackage(nodeModules, pkgName) {
  const parts = pkgName.split('/')
  const base = parts.pop().replace(PLATFORM_SUFFIX_RE, '')
  const scope = parts.length ? parts[0] : null
  const candidates = scope ? [`${scope}/${base}`, base] : [base]
  for (const c of candidates) {
    if (existsSync(path.join(nodeModules, ...c.split('/'), 'package.json'))) return c
  }
  return candidates[0]
}

/**
 * 从 npm registry 下载平台包 tarball 并解压到 targetDir（不含平台后缀的裸名目录）。
 * 平台包版本必须与主包版本一致（koffi 等在加载时校验 native 模块版本，
 * 不一致抛 "Mismatched native Koffi modules"）。
 */
async function downloadPlatformPkg(pkgName, version, target) {
  // 解压到临时目录（tgz 顶层为 package/，strip 1 后内容落在临时目录），
  // 再整体移动到 target（node_modules/<scope>/<name> 完整包路径）。
  const bare = pkgName.split('/').pop()
  const encoded = pkgName.startsWith('@')
    ? `@${encodeURIComponent(pkgName.split('/')[0].slice(1))}/${encodeURIComponent(pkgName.split('/')[1])}`
    : encodeURIComponent(pkgName)
  const url = `${process.env.NPM_REGISTRY || 'https://registry.npmjs.org'}/${encoded}/-/${bare}-${version}.tgz`
  const tmp = path.join(os.tmpdir(), `dsh-pkg-${Date.now()}`)
  const tmpTgz = `${tmp}.tgz`
  mkdirSync(tmp, { recursive: true })
  try {
    log(`下载平台包 ${pkgName}@${version}: ${url}`)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    await pipeline(Readable.fromWeb(resp.body), createWriteStream(tmpTgz))
    const { x: tarExtract } = await import('tar')
    await tarExtract({ file: tmpTgz, cwd: tmp, strip: 1 })
    if (!existsSync(path.join(tmp, 'package.json'))) throw new Error('解压后缺少 package.json')
    rmSync(target, { recursive: true, force: true })
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(tmp, target, { recursive: true })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    rmSync(tmpTgz, { force: true })
  }
}

/**
 * 从 repo 的 pnpm 虚拟 store（node_modules/.pnpm）把目标平台的平台分包
 * （@koromix/koffi-win32-x64、@img/sharp-<platform>、node-addon-require-builtin-<platform>
 * 等）补齐到 deploy 产物 node_modules，并保证平台包版本与 runtime 中主包版本
 * 一致（koffi/sharp 等在加载时校验 native 版本，不一致会抛
 * "Mismatched native Koffi modules" 导致 dsh 无法启动）。
 *
 * 背景：pnpm deploy --legacy 对 optionalDependencies 的平台包选择不完整
 * （sharp 的全平台 optionalDeps 一个都没装，koffi 只装宿主版），且 deploy 的
 * 版本解析可能比 repo lockfile 新（如 koffi 主包解析到 3.1.5 而 lock 钉 3.1.1），
 * 导致 repo store 里的平台包版本与 deploy 主包不一致。本函数：
 *   1) 按 runtime 主包版本优先从 store 复制匹配版本；
 *   2) 否则从 npm registry 下载对应版本。
 * 已匹配（版本一致）的跳过，幂等。
 */
async function copyPlatformPackages(dest, repoDir, platform) {
  const store = path.join(repoDir, 'node_modules', '.pnpm')
  const nodeModules = path.join(dest, 'node_modules')
  if (!existsSync(store)) return 0
  const marker = `-${platform}-`
  const want = new Set()
  for (const entry of readdirSync(store)) {
    if (!entry.includes(marker)) continue
    const nm = path.join(store, entry, 'node_modules')
    if (!existsSync(nm)) continue
    for (const top of readdirSync(nm)) {
      const topPath = path.join(nm, top)
      if (!statSync(topPath).isDirectory() || top === '.pnpm') continue
      if (top.startsWith('@')) {
        for (const name of readdirSync(topPath)) {
          if (name.includes(marker)) want.add(`${top}/${name}`)
        }
      } else if (top.includes(marker)) {
        want.add(top)
      }
    }
  }
  let count = 0
  for (const pkgName of want) {
    if (EXCLUDE_PLATFORM_PKGS.includes(pkgName)) {
      log(`跳过外部 CLI 平台包（体积过大）: ${pkgName}`)
      continue
    }
    const main = findMainPackage(nodeModules, pkgName)
    const mainPkg = path.join(nodeModules, ...main.split('/'), 'package.json')
    if (!existsSync(mainPkg)) continue // 主包不在 runtime（构建工具类平台包），无需对齐
    const mainVer = readPkgVersion(mainPkg)
    if (!mainVer) continue
    const target = path.join(nodeModules, ...pkgName.split('/'))
    const tver = existsSync(path.join(target, 'package.json'))
      ? readPkgVersion(path.join(target, 'package.json'))
      : null
    if (tver === mainVer) continue // 已匹配
    if (tver) log(`平台包版本不匹配 ${pkgName}@${tver} vs 主包 ${main}@${mainVer}，修正…`)
    rmSync(target, { recursive: true, force: true })
    const storeEntry = path.join(store, `${pkgName.replace('/', '+')}@${mainVer}`)
    const storeSrc = path.join(storeEntry, 'node_modules', ...pkgName.split('/'))
    if (existsSync(storeSrc)) {
      mkdirSync(path.dirname(target), { recursive: true })
      cpSync(storeSrc, target, { recursive: true })
      count++
      continue
    }
    try {
      await downloadPlatformPkg(pkgName, mainVer, target)
      count++
    } catch (e) {
      log(`警告: 无法获取 ${pkgName}@${mainVer}: ${e.message}`)
    }
  }
  if (count > 0) log(`对齐/补齐 ${platform} 平台包 ${count} 个`)
  return count
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
  // 与官方 PROFILE_TEMPLATES.web 一致：base + web-app（rc.8 基线 web-app
  // bundle 仅含官方 @deepseek-ai/* 插件，开箱即用）。
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2) + '\n')
  writeFileSync(path.join(dir, 'cordis.patch.yml'),
    '# 此 profile 的用户 patch 层：随包模板为空，5 个默认插件已由 web-app bundle 启用。\n[]\n')
  log(`profile 模板就绪: ${dir}`)
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  log(`repo: ${args.repo}`)
  log(`platform: ${args.platform}-${args.arch}`)
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  if (args.platform !== 'linux') {
    await provisionNode(args)
    await provisionPnpm(args)
  } else {
    log('linux 平台：不内置 Node 运行时（运行时由 main.js 检测系统 Node 并按发行版提示补全），跳过 Node 下载与 pnpm 预置')
  }
  await deployDsh(args)
  restoreVendoredOverrides(path.join(RUNTIME_ROOT, 'dsh'), args.repo)
  // deploy --legacy --prod 不会把以 peerDependencies 声明的纯 workspace 包
  // （@deepseek-ai/dsh-timeout、dsh-scope 等）落入闭包，运行期会
  // ERR_MODULE_NOT_FOUND；这里把它们从仓库已构建产物补齐到闭包。
  restoreWorkspacePackages(path.join(RUNTIME_ROOT, 'dsh'), args.repo)
  // deploy --legacy 对平台分包（sharp/koffi 的 optionalDeps）选择不完整，
  // 从 repo pnpm store 补齐目标平台原生模块。
  await copyPlatformPackages(path.join(RUNTIME_ROOT, 'dsh'), args.repo, args.platform)
  // deploy 产物中的符号链接（node_modules/.bin 等）必须展开为普通文件，
  // 否则 Windows 安装器解压 dsh-runtime.7z 会失败。
  dereferenceLinks(path.join(RUNTIME_ROOT, 'dsh'))
  writeProfileTemplate()
  log('runtime 组装完成。')
}

main().catch((error) => {
  console.error('[prepare-runtime] 未捕获错误:', error)
  process.exit(1)
})
