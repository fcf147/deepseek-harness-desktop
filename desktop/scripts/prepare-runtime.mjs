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
 * 生产依赖（包括我们默认启用的 5 个第三方插件：dsh-remote、dshmarket、
 * dsh-message-edit、@dsh-external/dsh-vision-toolkit、dsh-memory-evolve，
 * 以及 ssh2）扁平化为一个可独立运行的 node_modules，无需用户安装全局 Node.js。
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

// ── pnpm 预置（供插件市场使用）───────────────────────────────────────────────

/**
 * 把 pnpm 安装进内置 Node 目录并生成平台 shim：
 *   win32-x64/pnpm.cmd   （Windows：node.exe 同目录）
 *   linux-x64/bin/pnpm   （Linux：bin/ 下与 node 同目录）
 *
 * 桌面版插件市场（dshmarket）与 `dsh plugin` 命令都从 PATH 解析 pnpm；Electron
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
    // web-app bundle 默认启用 dsh-memory-evolve，它以 git 依赖钉在固定提交
    // （仅发布在 GitHub，未上 npm）。deploy 的默认 blockExoticSubdeps 会拒绝
    // 子依赖中的 git 包，此处显式放行。
    '--config.blockExoticSubdeps=false',
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
  // 启用 5 个第三方插件，开箱即用）。
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
  await provisionNode(args)
  await provisionPnpm(args)
  await deployDsh(args)
  restoreVendoredOverrides(path.join(RUNTIME_ROOT, 'dsh'), args.repo)
  writeProfileTemplate()
  log('runtime 组装完成。')
}

main().catch((error) => {
  console.error('[prepare-runtime] 未捕获错误:', error)
  process.exit(1)
})
