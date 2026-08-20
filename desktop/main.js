// dsh-desktop Electron 主进程。
//
// 职责：定位随包附带的 runtime（内置 Node.js + dsh 完整安装），以
// `--profile web --port 0` 拉起 dsh web 服务，解析其打印的 URL 行，再把 BrowserWindow
// 指向该 URL。退出时向子进程发 SIGTERM 并等待其退出，避免孤儿 node 进程
// 占用端口/会话锁。
//
// 路径约定（打包后）：
//   resources/runtime/node/<platform>-<arch>/node(.exe)   内置 Node 运行时（Windows 等内置；
//                                                         Linux rpm 不内置）
//   resources/runtime/node/.use-system-node               Windows 安装器标记：检测到合规系统 Node
//   resources/runtime/dsh/                                 dsh 安装根（node_modules/@deepseek-ai/dsh/lib/bin.js）
//   resources/runtime/templates/                           profile 骨架（复制到用户数据目录）
//
// Node.js 来源优先级：
//   - Windows：安装器检测到合规系统 Node 时写 .use-system-node 标记 → 优先复用系统 Node
//     （严格 semver 校验，不满足自动回退内置）；否则使用内置 Node（安装包随包自带）。
//   - Linux：无内置 Node，必须使用系统 Node；缺失/版本不足时按发行版
//     （/etc/os-release）弹窗提示对应的包管理器安装命令，重试直到可用。
//   - 内置 Node 存在但无标记时（旧版安装、开发模式）仍直接使用内置 Node。
//
// 用户数据（DSH_HOME）：独立于 CLI 的 ~/.dsh，默认在
//   %APPDATA%/dsh-desktop/home（Windows） / ~/.config/dsh-desktop/home（Linux），
// 保证桌面版不与用户已有的 dsh 安装互相干扰；settings、sessions 等全部在此。
//
// 开发模式：DESKTOP_DEV=1 时 runtime 解析到 ./runtime 同级目录，便于本地
// `npm run start` 调试。

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const IS_DEV = process.env.DESKTOP_DEV === '1'
const RUNTIME_ROOT = IS_DEV
  ? path.join(__dirname, 'runtime')
  : path.join(process.resourcesPath, 'runtime')

function platformKey() {
  return `${process.platform}-${process.arch}` // e.g. win32-x64, linux-x64, linux-arm64
}

// dsh 对 Node 的 engines 要求（repo/package.json 原样）：^22.19.0 || >=24.0.0。
const NODE_ENGINES_RANGE = '^22.19.0 || >=24.0.0'

/** 版本是否满足 engines（^22.19.0 即 22.x 且 minor>=19；>=24.0.0 即 major>=24）。 */
function satisfiesNode(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim())
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  return (major === 22 && minor >= 19) || major >= 24
}

/** 解析系统 PATH 中的 node 可执行文件路径（不存在返回 null）。 */
function whichNode() {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(cmd, ['node'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return null
  const line = String(r.stdout).split(/\r?\n/).find((l) => l.trim())
  return line ? line.trim() : null
}

/** 探测系统 Node：版本 + 路径 + 是否满足 engines（PATH 中无 node 时返回 null）。 */
function systemNodeInfo() {
  const r = spawnSync('node', ['--version'], { encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0 || !r.stdout) return null
  const version = String(r.stdout).trim()
  return { version, path: whichNode(), ok: satisfiesNode(version) }
}

/**
 * 解析本次启动要用的 Node：
 *   - 内置 Node 存在 + .use-system-node 标记（Windows 安装器写入）→ 系统 Node
 *     严格校验通过则复用，否则回退内置；
 *   - 内置 Node 存在（无标记，旧版安装/开发模式）→ 用内置；
 *   - 无内置 Node（Linux rpm）→ 用系统 Node（缺失时返回 node=null 由调用方提示）。
 * @returns {{ node: string|null, bundled: boolean, sys: object|null }}
 */
function resolveNode() {
  const dir = path.join(RUNTIME_ROOT, 'node', platformKey())
  const exe = process.platform === 'win32' ? 'node.exe' : 'bin/node'
  const bundled = path.join(dir, exe)
  const bundledExists = fs.existsSync(bundled)

  if (bundledExists) {
    const marker = path.join(dir, '..', '.use-system-node')
    if (fs.existsSync(marker)) {
      const sys = systemNodeInfo()
      if (sys && sys.ok && sys.path) {
        console.log(`[dsh-desktop] 复用系统 Node ${sys.version} (${sys.path})`)
        return { node: sys.path, bundled: false, sys }
      }
      console.log('[dsh-desktop] 系统 Node 缺失或不满足要求，回退使用内置 Node')
    }
    return { node: bundled, bundled: true, sys: null }
  }

  const sys = systemNodeInfo()
  return { node: sys && sys.ok ? sys.path : null, bundled: false, sys }
}

/**
 * Linux：按发行版给出 Node.js 补全提示（/etc/os-release 判定包管理器）。
 * Windows 场景理论上不会走到（内置 Node 兜底）。
 */
function linuxNodeHint() {
  let osRelease = ''
  try {
    osRelease = fs.readFileSync('/etc/os-release', 'utf8')
  } catch { /* 忽略 */ }
  const idLine = (osRelease.match(/^ID=(.+)$/m) || [])[1] || ''
  const idLikeLine = (osRelease.match(/^ID_LIKE=(.+)$/m) || [])[1] || ''
  const lower = `${osRelease} ${idLine} ${idLikeLine}`.toLowerCase()

  let installCmd = ''
  let note = ''
  if (/debian|ubuntu/.test(lower)) {
    installCmd = 'sudo apt-get update && sudo apt-get install -y nodejs'
    note = '部分发行版仓库中的 nodejs 版本较旧（可能 <22.19），若安装后仍提示版本不足，请改用 NodeSource 官方源或直接下载 LTS 二进制：https://nodejs.org/zh-cn/download'
  } else if (/fedora|rhel|centos|rocky|alma|amzn|ol|oracle/.test(lower)) {
    installCmd = 'sudo dnf install -y nodejs'
    note = '若仓库版本不足（<22.19），建议改用 NodeSource 源：https://github.com/nodesource/distributions'
  } else if (/arch|manjaro/.test(lower)) {
    installCmd = 'sudo pacman -S nodejs'
  } else if (/suse|opensuse/.test(lower)) {
    installCmd = 'sudo zypper install -y nodejs'
  } else {
    installCmd = '参考官方安装文档安装 Node.js LTS：https://nodejs.org/zh-cn/download'
  }
  const extra = note ? `\n\n${note}` : ''
  return `当前系统需要 Node.js（${NODE_ENGINES_RANGE}）才能运行桌面版 harness。\n\n请在终端执行：\n  ${installCmd}\n${extra}\n\n安装完成后点击"重试"。`
}

/**
 * 确保有可用的 Node：直接返回 resolveNode 结果；无可用 Node（Linux 无内置且
 * 系统缺失/版本不足）时弹窗提示按发行版补全，重试直到可用或用户退出。
 */
async function ensureNode() {
  const resolved = resolveNode()
  if (resolved.node) return resolved
  while (true) {
    const hint = linuxNodeHint()
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: '缺少 Node.js 运行环境',
      message: '未检测到满足要求的 Node.js（需要 ' + NODE_ENGINES_RANGE + '）',
      detail: hint,
      buttons: ['重试', '退出'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (response !== 0) {
      throw new Error('缺少满足要求的 Node.js，用户选择退出')
    }
    const again = resolveNode()
    if (again.node) return again
  }
}

function dshBin() {
  // pnpm deploy 输出布局因 pnpm 版本而异：嵌套（node_modules/@deepseek-ai/dsh）或目标根。
  const candidates = [
    path.join(RUNTIME_ROOT, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(RUNTIME_ROOT, 'dsh', 'lib', 'bin.js'),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error(`dsh CLI 缺失（请先运行 npm run build:runtime）。已尝试: ${candidates.join(', ')}`)
  }
  return found
}

/** 用户数据主目录（DSH_HOME）。首启动时从随包模板初始化 web profile。 */
function dshHome() {
  return path.join(app.getPath('userData'), 'home')
}

/** 解析 dsh web 打印的 URL 行: `dsh web: http://127.0.0.1:3080` */
function parseWebUrl(line) {
  const match = /dsh web:\s*(https?:\/\/\S+)/.exec(line)
  return match ? match[1] : null
}

/** 等待子进程打印 web URL，带超时；超时/退出时报错并给出尾部日志。 */
function waitForWebUrl(child, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let tail = ''
    const done = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      done(reject, new Error(`dsh web 启动超时（${timeoutMs}ms）。尾部输出:\n${tail || '(无输出)'}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      tail = (tail + text).slice(-8000)
      for (const line of text.split('\n')) {
        const url = parseWebUrl(line)
        if (url) done(resolve, url)
      }
    })
    child.stderr.on('data', (chunk) => {
      tail = (tail + chunk.toString()).slice(-8000)
    })
    child.on('exit', (code, signal) => {
      done(reject, new Error(`dsh web 提前退出 code=${code} signal=${signal}。尾部输出:\n${tail || '(无输出)'}`))
    })
    child.on('error', (err) => done(reject, err))
  })
}

let mainWindow = null
let serverChild = null
let tray = null
let quitting = false
let webUrl = null

/** 显示主窗口：已存在则聚焦；窗口被关闭（mainWindow=null）则按保存的 URL 重建。 */
function showMainWindow() {
  if (!webUrl) return
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow(webUrl)
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d1b40',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadURL(url)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 外部链接（非本机 dsh 服务）交给系统浏览器，避免在应用内导航离开。
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith('http://127.0.0.1') && !target.startsWith('http://localhost')) {
      shell.openExternal(target)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith('http://127.0.0.1') && !target.startsWith('http://localhost')) {
      event.preventDefault()
      shell.openExternal(target)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DeepSeek Harness', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit() } },
  ]))
  tray.on('click', () => showMainWindow())
}

/** 首启动：把随包 profile 模板复制到用户数据目录（web profile 骨架）。 */
function ensureProfile() {
  const home = dshHome()
  const profiles = path.join(home, 'profiles', 'web')
  if (fs.existsSync(profiles)) return
  const template = path.join(RUNTIME_ROOT, 'templates', 'profiles', 'web')
  if (!fs.existsSync(template)) {
    // 无模板时 dsh 会按 PROFILE_TEMPLATES 自动初始化 web profile，无需干预。
    return
  }
  fs.mkdirSync(path.dirname(profiles), { recursive: true })
  fs.cpSync(template, profiles, { recursive: true })
}

// ── Agent preset 两档选择（Standard / Minimal）────────────────

// 桌面版首启让用户选择 agent preset（会话层组合档位），默认 Standard（官方默认档）。
// 选择写入 $DSH_HOME/settings.yaml 的 agent-presets.default 命名空间
// （dsh-agent-presets 插件的用户默认档位；本仓库已移除自定义 summer-craft 预设
// 及全部第三方/自定义插件，仅保留官方 harness + 桌面壳）。
const PRESET_CHOICES = [
  {
    id: 'standard',
    label: 'Standard（推荐）',
    description: '官方标准档：完整编码 agent，官方默认组合，无额外增强。',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: '极简档：固定提示词 + bash + 文件编辑，无 plan-mode/记忆/评审。',
  },
]

/** 用户数据目录下的 preset 选择记录（无则未选过）。 */
function presetChoicePath() {
  return path.join(dshHome(), '.desktop-preset-choice')
}

/**
 * 首启（或用户未选过 preset）时弹出档位选择框，把结果写入
 * $DSH_HOME/settings.yaml（agent-presets.default）。用户取消则用默认档
 * Standard，不阻塞启动。
 */
async function ensurePresetChoice() {
  const home = dshHome()
  fs.mkdirSync(home, { recursive: true })
  const marker = presetChoicePath()
  if (fs.existsSync(marker)) {
    return // 已选过
  }
  let chosen = 'standard' // 默认档
  let remember = true // 默认记住；对话框异常时按记住处理
  try {
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: 'question',
      title: '选择 Agent 预设',
      message: '选择会话级 Agent 预设（可在设置中随时更改）',
      detail: PRESET_CHOICES.map((p, i) => `${i + 1}. ${p.label} — ${p.description}`).join('\n\n'),
      buttons: PRESET_CHOICES.map((p) => p.label),
      defaultId: 0, // Standard
      cancelId: -1,
      checkboxLabel: '记住选择，下次不再询问',
      checkboxChecked: true,
      noLink: true,
    })
    if (response >= 0 && response < PRESET_CHOICES.length) {
      chosen = PRESET_CHOICES[response].id
    }
    // 是否写入"记住"标记：勾选则下次不再询问；未勾选则下次启动再问，
    // 但本次选择仍然生效（写入 settings.yaml）。
    remember = checkboxChecked !== false
    if (!remember) {
      console.log(`[dsh-desktop] 用户未勾选记住，本次使用 ${chosen}，下次启动将重新询问`)
    }
  } catch (error) {
    console.warn('[dsh-desktop] preset 选择框异常，使用默认档 Standard:', String(error))
  }
  // 写入 settings.yaml（YAML 格式，agent-presets.default 命名空间）
  const settingsPath = path.join(home, 'settings.yaml')
  let yaml = ''
  if (fs.existsSync(settingsPath)) {
    yaml = fs.readFileSync(settingsPath, 'utf8')
  }
  const block = `agent-presets:\n  default: ${chosen}\n`
  if (/^agent-presets:/m.test(yaml)) {
    yaml = yaml.replace(/^agent-presets:[\s\S]*?(?=^[a-zA-Z][a-zA-Z0-9_-]*:|$)/m, block)
  } else {
    yaml = (yaml.trimEnd() ? yaml.trimEnd() + '\n\n' : '') + block
  }
  fs.writeFileSync(settingsPath, yaml, 'utf8')
  if (remember) {
    fs.writeFileSync(marker, chosen, 'utf8')
  }
  console.log(`[dsh-desktop] Agent preset 已选择: ${chosen} -> ${settingsPath}`)
}

async function startServer() {
  ensureProfile()
  await ensurePresetChoice()
  const resolved = await ensureNode()
  const node = resolved.node
  const bin = dshBin()
  const args = [bin, '--profile', 'web', '--port', '0']
  // Node 所在目录加入 PATH：内置 Node 时 prepare-runtime 已把 pnpm 预置在那里
  // （win32: node.exe 同目录 pnpm.cmd），dsh 的 pnpm 探测（probePnpm）与
  // `dsh plugin` 命令（spawnSync('pnpm')）都从 PATH 解析；复用系统 Node 时
  // 该目录即系统 node 安装位置（dsh 会经 corepack/PATH 自行解析 pnpm）。
  const nodeBinDir = path.dirname(node)
  const env = {
    ...process.env,
    // 桌面版独立的用户数据目录，避免与 CLI 的 ~/.dsh 互相干扰。
    DSH_HOME: dshHome(),
    PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ''}`,
  }
  serverChild = spawn(node, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  return waitForWebUrl(serverChild).then((url) => {
    console.log(`[dsh-desktop] dsh web 已就绪: ${url}`)
    return url
  })
}

async function shutdown() {
  if (quitting) return
  quitting = true
  if (serverChild && !serverChild.killed) {
    serverChild.kill('SIGTERM')
    // 给 dsh 一点时间做持久化落盘；随后强制结束以防残留。
    try {
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (serverChild) serverChild.kill('SIGKILL')
          resolve()
        }, 8000)
        serverChild.once('exit', () => { clearTimeout(timer); resolve() })
      })
    } catch { /* 忽略 */ }
  }
}

app.whenReady().then(async () => {
  try {
    const url = await startServer()
    webUrl = url
    createWindow(url)
    createTray()
  } catch (error) {
    dialog.showErrorBox('DeepSeek Harness 启动失败', String((error && error.message) || error))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  // 桌面应用：关窗后驻留托盘，不退出。托盘菜单"退出"才结束服务。
})

app.on('before-quit', (event) => {
  if (!quitting) {
    event.preventDefault()
    shutdown().finally(() => app.exit(0))
  }
})
