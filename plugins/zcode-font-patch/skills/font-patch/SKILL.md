---
name: font-patch
description: 给 ZCode 桌面版更换/回滚全局自定义字体(asar 补丁,Windows)。当用户想改 ZCode 界面字体、换霞鹜文楷等字体、或字体补丁出问题要回滚时使用。
---

# ZCode 全局字体补丁

本技能包装 `zcode-font.mjs`(位于本技能基目录向上三级,即插件根目录:`<基目录>/../../../zcode-font.mjs`)。零依赖,需 Node ≥ 20,仅 Windows。

## 操作流程

**换字体/首次打补丁:**
1. 若用户想换的字体不在 `插件根/font.json` 里,先编辑该文件(`fontSans` 界面字体、`fontMono` 代码与终端等宽字体、`uiFontSize` 界面字号),字体名必须与系统中已安装的字体族名一致(可用 PowerShell `New-Object System.Drawing.Text.InstalledFontCollection` 查准确族名);用户没指定字体时默认使用霞鹜文楷。
2. 运行 `node "<插件根>/zcode-font.mjs apply"`。
3. 成功后必须告知用户:**完全退出 ZCode(含托盘图标)再正常打开**即生效;若 ZCode 当时在运行,补丁已布防哨兵,退出瞬间自动换包。
4. 提醒:ZCode 升级后字体消失是正常的,重跑 apply 即恢复;出问题可回滚(见下)。

**回滚:**
- 运行 `node "<插件根>/zcode-font.mjs restore"`,等待用户退出 ZCode 后自动还原原包。

**查状态:**
- 运行 `node "<插件根>/zcode-font.mjs status"`。

## 约束

- 仅 Windows;不要在 macOS/Linux 上运行。
- apply 期间不需要用户关闭 ZCode(哨兵会等),但换包完成前字体不会生效。
- 若用户报告打补丁后 ZCode 无法启动,立即指导恢复:`resources\app.asar.orig-backup` 改名回 `app.asar`,并请用户反馈 ZCode 版本号到仓库 issue。
