# zcode-font-patch

> [!WARNING]
> 仅支持 **Windows** 桌面版 ZCode;需要 **Node.js ≥ 20**(用到内置 fetch/原生 WebSocket)。
> 补丁直接修改 `app.asar`,若你的 ZCode 构建启用了 asar 完整性校验会导致无法启动——工具会自动备份原包,一条命令回滚。

给 [ZCode 桌面版](https://zcode.z.ai) 换全局自定义字体(霞鹜文楷、Maple Mono……任意字体)。

**一次配置,重启生效,任何方式启动都有效**——原快捷方式、开机自启、命令行,统统带上你的字体。无常驻进程、无调试端口、无需记任何启动姿势。

## 原理

ZCode(Electron 41)设置界面只有「终端字体」和「UI 字号」,界面字体族硬编码在 CSS 变量 `--font-sans` / `--font-mono` 里(Tailwind v4 主题,无法从设置修改)。

本工具解开 `app.asar`,在主进程入口前置一个 8 行的 `web-contents-created` 钩子:每个窗口加载完成时 `insertCSS` 覆盖这两个变量。Tailwind v4 的工具类全部经 `var()` 引用它们,覆盖 `:root` 即全局生效。

与 [CDP 注入方案(社区文章)](https://blog.csdn.net/m0_46330462/article/details/166332684) 的对比:

| | **asar 补丁(本工具)** | CDP 注入 |
|---|---|---|
| 启动方式 | **任意启动** | 必须经专用入口(带调试端口) |
| 常驻进程 | 无 | 注入器常驻 |
| ZCode 升级后 | 重跑一次 `apply` | 无需维护 |
| 改动面 | `app.asar`(自动备份可回滚) | 零文件改动 |

## 快速开始

```bat
git clone https://github.com/yangx378/zcode-font-patch.git
cd zcode-font-patch

:: 1. 编辑 font.json,换成你喜欢的字体(见下)
:: 2. 打补丁:
node zcode-font.mjs

:: 3. 完全退出 ZCode(含托盘图标)→ 正常重新打开 → 全局新字体
```

`font.json` 示例:

```json
{
  "fontSans": "\"霞鹜文楷\", \"LXGW WenKai\", \"Microsoft YaHei UI\", system-ui, sans-serif",
  "fontMono": "\"霞鹜文楷等宽\", \"LXGW WenKai Mono\", Consolas, monospace",
  "uiFontSize": 14
}
```

`fontMono` 会同时作用于代码块与内置终端(终端字体设置留空时);想要界面对齐工整,建议中文界面字体选带等宽变体的字体。字体请先安装在系统中(用户级安装即可,推荐 [霞鹜文楷](https://github.com/lxgw/LxgwWenKai/releases))。

`app.asar` 自动探测顺序:`ZCODE_ASAR` 环境变量 → `%LOCALAPPDATA%\Programs\zcode` → `D:\Tools\ZCode` → `C:\Program Files\ZCode`;探测不到就 `node zcode-font.mjs --asar "完整路径"`。

## 命令

| 命令 | 作用 |
|---|---|
| `node zcode-font.mjs` / `apply` | 打补丁;ZCode 在运行则布防哨兵(退出即换包),未运行则直接换包 |
| `node zcode-font.mjs restore` | 回滚到打补丁前的原包 |
| `node zcode-font.mjs status` | 查看补丁/备份/待换包状态 |

原包始终备份为 `resources\app.asar.orig-backup`,恢复就是把它改回来(或跑 `restore`)。

## 作为 ZCode 插件安装(可选)

不想敲命令行?本仓库同时是一个 ZCode 插件市场,装上后在聊天里说「给 ZCode 换字体」即可由 agent 代跑:

```
/plugin marketplace add yangx378/zcode-font-patch
/plugin install zcode-font-patch@zcode-font
```

> 需要客户端支持第三方市场;插件只是把 `zcode-font.mjs` 包装成技能,补丁逻辑与命令行版完全一致。

## FAQ

**升级 ZCode 后字体没了?** 正常,升级会整体替换 `app.asar`。重跑一次 `node zcode-font.mjs` 即恢复。

**启动白屏/闪退?** 你的构建可能启用了 asar 完整性校验。把 `resources\app.asar.orig-backup` 改名回 `app.asar` 即可恢复,欢迎开 issue 反馈版本号。

**会动我的系统字体吗?** 不会。只改 ZCode 自己的 `app.asar`,系统全局字体零影响。

**macOS / Linux?** 原理相同(asar 结构一致),但打包/换包/进程检测的路径是 Windows 专用的,欢迎 PR 适配。

## 实测记录

| 日期 | ZCode 版本 | 结果 |
|---|---|---|
| 2026-11-02 | 3.17.1 (Windows) | 打包校验通过:主入口钩子就位、16 个原生件外置与原包一致;换包实测见 release notes |

## 致谢

- 方案思路来自社区文章 [ZCode 字体背景定制实战(CDP 双效注入)](https://blog.csdn.net/m0_46330462/article/details/166332684),本仓库是其 v1(asar 补丁)路线的工程化与插件化。
- [霞鹜文楷 LXGW WenKai](https://github.com/lxgw/LxgwWenKai) —— 本项目默认示例字体。

## License

[MIT](LICENSE)
