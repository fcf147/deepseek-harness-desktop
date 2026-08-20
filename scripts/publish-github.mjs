#!/usr/bin/env node
// 发布脚本：把 desktop/dist 产物上传到 GitHub Release（替代 Gitee release 附件，
// 因为单文件安装包 ~169MB 超出 Gitee 免费仓库 50MB / release 附件 100MB 限制）。
//
// 用法：
//   GITHUB_TOKEN=<PAT> node scripts/publish-github.mjs \
//     [--repo owner/name] [--tag v0.1.2] [--visibility private|public] \
//     [--ext exe] [--title ...] [--notes ...]
//
// 前置：GitHub Personal Access Token（classic，勾选 repo 权限），
//   https://github.com/settings/tokens 生成。
// 流程：仓库不存在则创建 → 建/更新 release（tag 不存在会自动打 tag）→
//   上传 desktop/dist 下匹配 --ext（默认 exe）的资产（GitHub 单文件上限 2GB）。
// 环境变量：GITHUB_TOKEN（必填）。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'desktop', 'dist')

// ── 参数 ────────────────────────────────────────────────────────────
const args = {
  repo: 'summerwindow741/deepseek-harness-desktop',
  tag: null,
  visibility: 'private',
  ext: 'exe',
  title: null,
  notes: null,
}
for (let i = 0; i < process.argv.length; i++) {
  const flag = process.argv[i]
  const value = () => process.argv[++i]
  if (flag === '--repo') args.repo = value()
  else if (flag === '--tag') args.tag = value()
  else if (flag === '--visibility') args.visibility = value()
  else if (flag === '--ext') args.ext = value()
  else if (flag === '--title') args.title = value()
  else if (flag === '--notes') args.notes = value()
}

const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN 环境变量（https://github.com/settings/tokens 生成，勾选 repo 权限）')
  process.exit(1)
}
if (!/^[^/]+\/[^/]+$/.test(args.repo)) {
  console.error(`--repo 格式应为 owner/name，收到: ${args.repo}`)
  process.exit(1)
}

// ── GitHub API 小助手 ────────────────────────────────────────────────
const API = 'https://api.github.com'
async function gh(pathname, { method = 'GET', body } = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${pathname}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON */ }
  if (!res.ok && !(method === 'GET' && res.status === 404)) {
    throw new Error(`GitHub API ${method} ${pathname} -> ${res.status}: ${(json && json.message) || text.slice(0, 300)}`)
  }
  return { status: res.status, json }
}

// ── 主流程 ───────────────────────────────────────────────────────────
const log = (msg) => console.log(`[publish] ${msg}`)

// 1) 仓库：不存在则创建
let repo
{
  const r = await gh(`/repos/${args.repo}`)
  if (r.status === 404) {
    log(`仓库不存在，创建（${args.visibility}）: ${args.repo}`)
    const c = await gh('/user/repos', {
      method: 'POST',
      body: { name: args.repo.split('/')[1], private: args.visibility !== 'public', auto_init: false },
    })
    repo = c.json
    log(`仓库已创建: ${repo.html_url}`)
  } else {
    repo = r.json
    log(`仓库已存在: ${repo.html_url}`)
  }
}

// 2) 版本号：默认取 desktop/package.json 的 version
if (!args.tag) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'))
  args.tag = `v${pkg.version}`
}
args.title = args.title || `DeepSeek Harness Desktop ${args.tag}`
args.notes = args.notes || `单文件安装包（自包含 Electron + 内置 Node.js + dsh 完整运行时）。

构建基线：官方 deepseek-harness 0.1.0-rc.8，纯官方插件，无第三方/自定义插件。
Node.js：内置最新合规 LTS（安装时检测系统 Node，合规则静默复用，否则使用内置）。`

// 3) Release：tag 已存在则复用，否则创建（自动打 tag）
let release
{
  const r = await gh(`/repos/${args.repo}/releases/tags/${args.tag}`)
  if (r.status === 200) {
    release = r.json
    log(`Release ${args.tag} 已存在（id=${release.id}），复用并追加资产`)
  } else {
    const c = await gh(`/repos/${args.repo}/releases`, {
      method: 'POST',
      body: { tag_name: args.tag, name: args.title, body: args.notes, draft: false, prerelease: false },
    })
    release = c.json
    log(`Release ${args.tag} 已创建: ${release.html_url}`)
  }
}

// 4) 上传资产：desktop/dist 下匹配扩展名（--ext 支持逗号分隔，如 "exe,rpm"）
//    的文件（裸二进制 body，单文件上限 2GB）
const exts = args.ext.split(',').map((e) => e.trim().replace(/^\./, '')).filter(Boolean)
const files = readdirSync(DIST)
  .filter((name) => exts.some((e) => name.endsWith(`.${e}`)))
  .map((name) => path.join(DIST, name))
  .filter((f) => statSync(f).isFile())

if (files.length === 0) {
  console.error(`desktop/dist 下没有匹配 .${args.ext} 的产物`)
  process.exit(1)
}
for (const file of files) {
  const name = path.basename(file)
  const size = (statSync(file).size / 1024 / 1024).toFixed(1)
  log(`上传 ${name} (${size} MB) ...`)
  const buf = readFileSync(file)
  const res = await fetch(
    `${API}/repos/${args.repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length),
      },
      body: buf,
    }
  )
  const text = await res.text()
  if (!res.ok) {
    console.error(`上传 ${name} 失败: ${res.status} ${text.slice(0, 300)}`)
    process.exit(1)
  }
  log(`上传完成: ${name}`)
}

console.log(`\n发布完成！${args.repo} release ${args.tag}: ${release.html_url}`)
