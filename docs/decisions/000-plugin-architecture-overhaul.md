# 000 — 插件系统架构重构

**日期**: 2026-07-19

**状态**: 已通过

## 背景

HeartbeatCat 当前的插件系统仅支持桌面组件（Widget），推流插件（Streaming）页面为空白占位。插件类型通过 `type` 枚举值（`widget | extension | theme`）区分，后两者从未实现。插件的窗口参数硬编码在前端代码中，缺少配置体系，也没有标准的安装流程。

由于插件系统尚未正式发布，不存在兼容负担，决定彻底推翻重写。

## 决定

采用统一的插件模型，一个插件通过 `hbcat-manifest.json` 自描述所有能力。桌面组件（Widget）和推流插件（Streaming）作为对等的可选能力声明，不再使用 `type` 枚举。

核心设计原则：
1. 目录存在即能力声明（`widget/`、`streaming/` 目录的存在与否决定能力）
2. 构建工具全自动生成 manifest（`@hrcat/vite-plugin` 从 `hrcat.config.ts` + `package.json` 生成）
3. JSON Schema 驱动所有可配置项（前端根据 schema 动态渲染设置表单）
4. SSE 统一桌面组件与推流插件的数据通道

## 原因

- **能力声明对等**：一个插件可同时支持桌面组件和推流插件，无需拆成多个；
- **配置驱动 UI**：JSON Schema 让前端无需为每个插件硬编码设置表单，插件自带配置定义；
- **零历史包袱**：不受旧格式限制，可选用最合理的结构和命名；
- **开发体验**：`hrcat-widget-example` 开发者只需关心 `hrcat.config.ts`，manifest 由构建工具保证一致性。

## 影响

### 正面
- 插件系统终于完整：桌面组件和推流插件可按统一流程管理
- 插件开发者体验提升：`hrcat.config.ts` 替代手写 manifest
- 推流插件有了数据通道（SSE），OBS 浏览器源可接收实时数据
- 有了标准安装/卸载流程

### 代价
- 需重写 `stores/plugin.ts`、`widgets.vue`、`streaming-plugins.vue`
- 需重写 `hrcat-widget-example` 的 Vite 插件
- Rust 端需新增多个 Tauri commands 和 SSE 广播器

### 后续
- 按七阶段实施路线图执行
- 改造 `hrcat-widget-example` 为参考模板

## 备选方案

- **渐进式改造**：保留现有 manifest 格式，在 `type` 字段中新增 `hybrid` 类型。
  被拒绝原因：旧格式本身设计不合理，修补不如重写。且未正式发布，不需兼容。
