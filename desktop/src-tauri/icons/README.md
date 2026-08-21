# 图标目录（待补）

Tauri 打包需要以下图标文件，本骨架暂未包含二进制图标。
请在 Windows 开发机上用一张 1024x1024 的 PNG 源图生成：

```bash
cd desktop
npm run tauri icon path/to/source.png
```

需生成的文件（与 `tauri.conf.json` 的 bundle.icon 对应）：
- 32x32.png
- 128x128.png
- 128x128@2x.png
- icon.icns
- icon.ico

生成后删除本 README.md 即可。
