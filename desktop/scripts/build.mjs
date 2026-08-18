// 一键构建：prepare-runtime -> electron-builder（win nsis / linux rpm）。
// 用法: node scripts/build.mjs --platform win|linux [--arch x64|arm64]
//
// Windows（拆分发布）额外步骤：
//   1) 把 7zip-bin 的 7za.exe 复制到 tools/（随包分发给安装器解压归档用）；
//   2) electron-builder 打包 exe（只内嵌 Electron + 模板 + tools，< 100MB）；
//   3) 用 7za 把 runtime/node + runtime/dsh 压缩成 dist/dsh-runtime.7z
//      （~57MB），与安装包同目录发布。

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')

const args = { platform: null, arch: process.arch }
for (let i = 0; i < process.argv.length; i++) {
  const flag = process.argv[i]
  const value = () => process.argv[++i]
  if (flag === '--platform') args.platform = value()
  else if (flag === '--arch') args.arch = value()
}
if (!args.platform) {
  console.error('用法: node scripts/build.mjs --platform win|linux [--arch x64|arm64]')
  process.exit(1)
}

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`)
  // 仅 .cmd/.bat 需要 shell；shell 会把含空格的可执行路径/参数拆开，需加引号。
  // node.exe 等真实可执行文件直接 spawn，避免路径拆分问题。
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)
  const result = needsShell
    ? spawnSync(`"${cmd}"`, cmdArgs.map(a => (a.includes(' ') ? `"${a}"` : a)), {
        stdio: 'inherit',
        shell: true,
        ...opts,
      })
    : spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    console.error(`命令失败 (exit=${result.status}): ${cmd} ${cmdArgs.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

// 1) 组装 runtime（内置 Node + dsh 安装根 + profile 模板）
const runtimePlatform = args.platform === 'win' ? 'win32' : args.platform === 'linux' ? 'linux' : args.platform
// 构建机自带的免安装 Node（.tools/node-*）：有则直接复制进 runtime，避免
// 在构建/打包机上重复下载（nodejs.org 直连在部分网络不可用且 Node 会崩溃）。
const toolsRoot = path.resolve(DESKTOP_ROOT, '..', '.tools')
let bundledNodeDir = null
if (existsSync(toolsRoot)) {
  for (const entry of readdirSync(toolsRoot)) {
    const candidate = path.join(toolsRoot, entry)
    const probe = process.platform === 'win32'
      ? path.join(candidate, 'node.exe')
      : path.join(candidate, 'bin', 'node')
    if (statSync(candidate).isDirectory() && existsSync(probe)) {
      bundledNodeDir = candidate
      break
    }
  }
}
const prepareArgs = [
  path.join(__dirname, 'prepare-runtime.mjs'),
  '--platform', runtimePlatform,
  '--arch', args.arch,
]
if (bundledNodeDir) prepareArgs.push('--node', bundledNodeDir)
run(process.execPath, prepareArgs)

// 1.5) Windows 拆分发布：确保 tools/7za.exe 随包分发（安装器用它解压归档）
let sevenZip = null
if (args.platform === 'win') {
  const candidates = [
    path.join(DESKTOP_ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(DESKTOP_ROOT, 'node_modules', '7zip-bin', 'win', 'ia32', '7za.exe'),
  ]
  sevenZip = candidates.find(existsSync)
  if (!sevenZip) {
    console.error('未找到 7zip-bin 的 7za.exe（desktop/node_modules/7zip-bin）')
    process.exit(1)
  }
  mkdirSync(path.join(DESKTOP_ROOT, 'tools'), { recursive: true })
  copyFileSync(sevenZip, path.join(DESKTOP_ROOT, 'tools', '7za.exe'))
  console.log(`7za 就位: tools/7za.exe (${sevenZip})`)
}

// 归档压缩选可执行 7za：tools/7za.exe 是 win 版（随包分发给安装器解压归档），
// 在 Linux 构建机上不能直接执行（除非经 wine/binfmt）。压缩步骤改按宿主平台
// 选 7zip-bin 的原生 7za（linux 版与 win 版同版本、产物格式一致），
// win 构建机仍用 sevenZip（即 win 版）。
const archiver7z = (args.platform === 'win' && process.platform !== 'win32')
  ? [path.join(DESKTOP_ROOT, 'node_modules', '7zip-bin', 'linux', 'x64', '7za'),
     path.join(DESKTOP_ROOT, 'node_modules', '7zip-bin', 'linux', 'ia32', '7za')].find(existsSync) || sevenZip
  : sevenZip

// 2) electron-builder（直接经 node 调其 CLI，绕开 npx.cmd 在含空格路径下的
//    %~dp0 解析问题）
const ebCli = path.join(DESKTOP_ROOT, 'node_modules', 'electron-builder', 'cli.js')
if (!existsSync(ebCli)) {
  console.error(`未找到 electron-builder: ${ebCli}`)
  process.exit(1)
}
const target = args.platform === 'win' ? '--win' : '--linux'
const archFlag = `--${args.arch === 'arm64' ? 'arm64' : 'x64'}`
run(process.execPath, [ebCli, target, archFlag], { cwd: DESKTOP_ROOT })

// 3) Windows 拆分发布：压缩 node + dsh 为 dsh-runtime.7z（与安装包同目录）
if (args.platform === 'win') {
  const runtimeRoot = path.join(DESKTOP_ROOT, 'runtime')
  const archive = path.join(DESKTOP_ROOT, 'dist', 'dsh-runtime.7z')
  // 归档内保持 node/、dsh/ 顶层结构，解压到 resources\runtime 后与 main.js
  // 的路径约定一致。
  run(archiver7z, ['a', '-t7z', '-mx=9', '-mmt=on', '-bso0', '-bsp0', archive, 'node', 'dsh'], {
    cwd: runtimeRoot,
  })
  const stat = statSync(archive)
  console.log(`dsh-runtime.7z 生成: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
}

console.log('\n构建完成。安装包与 dsh-runtime.7z 位于 dist/ 目录。')
