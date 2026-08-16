/**
 * DeepSeek Harness 鸿蒙客户端壳主页面。
 *
 * 鸿蒙 NEXT 无法直接运行 Node.js/dsh 服务，因此本壳是纯 WebView 客户端：
 * 加载运行在 Windows/Linux 主机（或远程服务器）上的 dsh Web UI。
 *
 * 首次启动进入设置页填写 dsh 服务地址（默认 http://127.0.0.1:3080）；
 * 保存后进入 Web 视图，可通过右上角按钮回到设置页切换服务器。
 */

import { webview } from '@kit.ArkWeb';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'DSH-WEB';
const DEFAULT_URL = 'http://127.0.0.1:3080';
const PREF_NAME = 'dsh_client';
const PREF_URL_KEY = 'server_url';

@Entry
@Component
struct Index {
  @State serverUrl: string = DEFAULT_URL;
  @State showSettings: boolean = true;
  controller: webview.WebviewController = new webview.WebviewController();
  private prefStore: preferences.Preferences | null = null;

  aboutToAppear(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    try {
      const store = preferences.getPreferencesSync(ctx, { name: PREF_NAME });
      const saved = store.getSync(PREF_URL_KEY, DEFAULT_URL) as string;
      if (saved && saved.length > 0) {
        this.serverUrl = saved;
      }
      // 记住当前偏好引用，供保存时复用
      this.prefStore = store;
    } catch (e) {
      hilog.warn(DOMAIN, TAG, 'preferences init failed: %{public}s', JSON.stringify(e));
    }
  }

  private saveAndOpen(): void {
    if (this.prefStore) {
      try {
        this.prefStore.putSync(PREF_URL_KEY, this.serverUrl);
        this.prefStore.flush();
      } catch (e) {
        hilog.warn(DOMAIN, TAG, 'save failed: %{public}s', JSON.stringify(e));
      }
    }
    this.showSettings = false;
    this.controller.loadUrl(this.serverUrl);
  }

  private backToSettings(): void {
    this.showSettings = true;
  }

  build() {
    Column() {
      if (this.showSettings) {
        // ── 设置页：填写 dsh 服务地址 ────────────────────────────────
        Column({ space: 16 }) {
          Text('DeepSeek Harness')
            .fontSize(28)
            .fontWeight(FontWeight.Bold)
            .margin({ top: 48 })

          Text('连接 dsh 服务（运行于 Windows / Linux 主机或远程服务器）')
            .fontSize(14)
            .fontColor('#666666')

          TextInput({ text: this.serverUrl, placeholder: 'http://主机IP:端口' })
            .width('80%')
            .height(48)
            .onChange((value: string) => { this.serverUrl = value.trim(); })

          Button('连接')
            .width('80%')
            .height(48)
            .onClick(() => this.saveAndOpen())

          Text('示例：本机运行 dsh web 后填 http://127.0.0.1:3080；\n远程服务器填 http://服务器IP:3080')
            .fontSize(12)
            .fontColor('#999999')
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Start)
      } else {
        // ── Web 视图：加载 dsh Web UI ────────────────────────────────
        Column() {
          Row() {
            Blank()
            Button('设置')
              .fontSize(14)
              .height(36)
              .margin({ right: 12, top: 8 })
              .onClick(() => this.backToSettings())
          }
          .width('100%')

          Web({ src: this.serverUrl, controller: this.controller })
            .width('100%')
            .height('92%')
            .javaScriptAccess(true)
            .domStorageAccess(true)
            .onlineImageAccess(true)
        }
        .width('100%')
        .height('100%')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }
}
