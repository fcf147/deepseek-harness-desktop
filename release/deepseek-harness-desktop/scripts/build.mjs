// 一键构建：prepare-runtime -> electron-builder（win nsis / linux rpm）。
// 用法: node scripts/build.mjs --platform win|linux [--arch x64|arm64]
//
// 单文件发布：
//   - Windows：NSIS 安装包自包含 Electron 壳 + 内置 Node（extraResources）+
//     dsh 安装根（extraResources），无 dsh-runtime.7z 拆分，一个 exe 交付；
//   - Linux rpm：不内置 Node，随包分发 dsh + profile 模板（运行时检测系统 Node）。
//
// prepare-runtime 职责：Windows 动态解析最新合规 Node（engines
// ^22.19.0 || >=24.0.0）下载免安装包到 runtime/node/win32-x64，并 pnpm deploy
// dsh 安装根 + 还原 vendored 包 + 补齐 win32 平台原生模块；linux 只 deploy dsh。

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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

// 1) 组装 runtime（内置 Node + dsh 安装根 + profile 模板）。
//    Windows 目标的 Node 版本由 prepare-runtime 动态解析"最新满足 engines 的
//    LTS"（可用 DSH_DESKTOP_NODE_VERSION 固定）；linux 目标不内置 Node。
const runtimePlatform = args.platform === 'win' ? 'win32' : args.platform === 'linux' ? 'linux' : args.platform
const prepareArgs = [
  path.join(__dirname, 'prepare-runtime.mjs'),
  '--platform', runtimePlatform,
  '--arch', args.arch,
]
run(process.execPath, prepareArgs)

// 2) electron-builder（直接经 node 调其 CLI，绕开 npx.cmd 在含空格路径下的
//    %~dp0 解析问题）。Windows：Node + dsh 已全部在 extraResources 里，
//    打进安装包，单文件交付；Linux：rpm 内置 dsh + 模板（不含 Node）。
const ebCli = path.join(DESKTOP_ROOT, 'node_modules', 'electron-builder', 'cli.js')
if (!existsSync(ebCli)) {
  console.error(`未找到 electron-builder: ${ebCli}`)
  process.exit(1)
}
const target = args.platform === 'win' ? '--win' : '--linux'
const archFlag = `--${args.arch === 'arm64' ? 'arm64' : 'x64'}`
run(process.execPath, [ebCli, target, archFlag], { cwd: DESKTOP_ROOT })

console.log('\n构建完成。单文件安装包位于 dist/ 目录。')
