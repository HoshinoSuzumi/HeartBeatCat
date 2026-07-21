# 001 — 插件存储与运行环境策略

**日期**: 2026-07-19

**状态**: 已通过

## 背景

在设计新的插件系统时，需要确定以下关键问题：

1. 插件的物理存储位置和安装方式
2. 开发环境和生产环境如何一致地识别和运行插件
3. 内置插件如何随应用打包分发

## 决定

### 1. 三级存储目录

采用三级优先级存储：

| 优先级 | 目录 | 用途 |
|--------|------|------|
| 1 | `{项目根}/dev-plugins/{id}/` | 开发中的插件（仅 debug 构建） |
| 2 | `$APPDATA/plugins/{id}/` | 用户安装的插件 |
| 3 | `$RESOURCE/plugins/{id}/` | 内置插件（随应用打包） |

warp 服务和前端 Store 在对插件进行查找时都遵循此优先级顺序。

### 2. 环境一致性

- warp 路由 `/p/{id}/*` 在 dev 和 prod 下逻辑完全一致
- dev-plugins 目录仅在 `#[cfg(debug_assertions)]` 时生效
- 开发者通过 `HRCAT_TARGET` 环境变量指向主项目，Vite 插件自动同步产物到 dev-plugins

### 3. 内置插件打包

利用 Tauri 现有 `bundle.resources` 机制：
- 内置插件放在 `src-tauri/plugins/{id}/`
- `tauri.conf.json` 中 `bundle.resources` 包含 `"plugins"`
- 打包时自动复制到安装包 `resources/` 目录
- 运行时 `BaseDirectory.Resource` + `"plugins"` 即可访问
- `builtin` 标记由前端加载时根据来源路径自动判定，不写入 manifest

## 原因

- **三级优先级**：dev 插件最高优先级，支持开发调试时覆盖内置或已安装版本
- **利用 Tauri 原生机制**：`$APPDATA`、`$RESOURCE`、`bundle.resources` 都是 Tauri 标准能力，无需额外实现
- **环境一致**：warp 路由逻辑不区分 dev/prod，降低维护成本
- **开发体验**：`HRCAT_TARGET` + 自动同步让插件开发者无需手动复制文件

## 影响

### 正面
- 无需额外实现文件分发机制
- 开发调试流程顺畅
- 用户数据与内置插件分离清晰

### 代价
- 需要开发者正确设置 `HRCAT_TARGET` 环境变量

### 后续
- 需在 `@hrcat/vite-plugin` 中实现 `HRCAT_TARGET` 检测和自动同步逻辑

## 备选方案

- **开发模式用本地文件服务器替代 warp**：在 dev 模式下让 Vite dev server 直接提供插件文件。
  被拒绝原因：widget 运行在独立 WebviewWindow 中，无法访问 Vite dev server。且推流插件需要一致的路由规则。
