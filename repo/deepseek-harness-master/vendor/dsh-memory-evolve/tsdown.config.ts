import { defineConfig } from 'tsdown'

/**
 * dsh-memory-evolve 是纯 client 插件：其 Node 侧入口（lib/index.js）与
 * client bundle（lib/client.js）由包内 scripts/build.mjs（esbuild）产出，
 * 不走 monorepo 的 tsc+tsdown 通道，也没有 lib/types/* host 构建目标。
 * root tsdown.config.ts 的 workspace glob（vendor/*）会包含本包，但 host
 * entry（lib/types/{index,invariant,startup}.js）在该源码快照上无法匹配，
 * 因此在此显式跳过 workspace 构建（entry: '' 即移除该包）。
 * client bundle 的注册走 packages/bundle/web-app 的 cordis.patch.yml 引用，
 * 部署时经 pnpm deploy 从安装的 git 依赖（含构建产物）带入运行时。
 */
export default defineConfig(() => ({ entry: '' }))
