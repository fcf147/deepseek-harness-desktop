// dsh-desktop Electron 主进程。
//
// 职责：定位随包附带的 runtime（内置 Node.js + dsh 完整安装），以
// `--profile web --port 0` 拉起 dsh web 服务，解析其打印的 URL 行，再把 BrowserWindow
// 指向该 URL。退出时向子进程发 SIGTERM 并等待其退出，避免孤儿 node 进程
// 占用端口/会话锁。
//
// 路径约定（打包后）：
//   resources/runtime/node/<platform>-<arch>/node(.exe)   内置 Node 运行时
//   resources/runtime/dsh/                                 dsh 安装根（node_modules/@deepseek-ai/dsh/lib/bin.js）
//   resources/runtime/templates/                           profile 骨架（复制到用户数据目录）
//
// 用户数据（DSH_HOME）：独立于 CLI 的 ~/.dsh，默认在
//   %APPDATA%/dsh-desktop/home（Windows） / ~/.config/dsh-desktop/home（Linux），
// 保证桌面版不与用户已有的 dsh 安装互相干扰；settings、sessions 等全部在此。
//
// 开发模式：DESKTOP_DEV=1 时 runtime 解析到 ./runtime 同级目录，便于本地
// `npm run start` 调试。

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const IS_DEV = process.env.DESKTOP_DEV === '1'
const RUNTIME_ROOT = IS_DEV
  ? path.join(__dirname, 'runtime')
  : path.join(process.resourcesPath, 'runtime')

function platformKey() {
  return `${process.platform}-${process.arch}` // e.g. win32-x64, linux-x64, linux-arm64
}

function nodeBin() {
  const dir = path.join(RUNTIME_ROOT, 'node', platformKey())
  const exe = process.platform === 'win32' ? 'node.exe' : 'bin/node'
  const candidate = path.join(dir, exe)
  if (!fs.existsSync(candidate)) {
    throw new Error(`内置 Node 运行时缺失: ${candidate}（请先运行 npm run build:runtime）`)
  }
  return candidate
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
  const node = nodeBin()
  const bin = dshBin()
  const args = [bin, '--profile', 'web', '--port', '0']
  // 内置 Node 的 bin 目录加入 PATH：prepare-runtime 已把 pnpm 预置在那里
  // （win32: node.exe 同目录 pnpm.cmd；linux: bin/pnpm）。dsh 的 pnpm
  // 探测（probePnpm）与 `dsh plugin` 命令（spawnSync('pnpm')）都从 PATH 解析，
  // 不补上则插件命令报 "pnpm not found"（corepack/npm 也不在 PATH，运行期
  // 安装会失败；构建期预置 + 此处 PATH 即可，全程零运行期写入）。
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
