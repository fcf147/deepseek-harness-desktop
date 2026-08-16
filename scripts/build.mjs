// 一键构建：prepare-runtime -> electron-builder（win nsis / linux rpm）。
// 用法: node scripts/build.mjs --platform win|linux [--arch x64|arm64]

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
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

console.log('\n构建完成。安装包位于 dist/ 目录。')
