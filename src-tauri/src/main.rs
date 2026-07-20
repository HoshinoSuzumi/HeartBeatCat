// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use btleplug::api::bleuuid::uuid_from_u16;
use btleplug::api::CentralEvent::{DeviceDisconnected, DeviceDiscovered, DeviceUpdated};
use btleplug::api::{BDAddr, Central, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager as BtleManager, Peripheral};
use futures::StreamExt;
use std::collections::HashMap;
use std::convert::Infallible;
use std::error::Error;
use std::sync::Arc;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Listener, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tokio;
use tokio::sync::Mutex;
use tokio::sync::broadcast;
use warp::Filter;

/// 解析 AppData 目录下的子路径。
/// Windows 上优先使用 `%APPDATA%` 环境变量 + bundle identifier，
/// 以规避 Tauri NSIS 安装到 Program Files 时 BaseDirectory::AppData 解析异常的问题。
fn resolve_appdata(app_handle: &AppHandle, sub_path: &str) -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let identifier = &app_handle.config().identifier;
            return std::path::PathBuf::from(appdata).join(identifier).join(sub_path);
        }
    }
    // 非 Windows 或环境变量缺失时回退到 Tauri 内置解析
    app_handle.path().resolve(sub_path, BaseDirectory::AppData).unwrap()
}

#[derive(serde::Serialize, Clone, Debug)]
struct BleDevice {
    peripheral_id: String,
    name: String,
    address: BDAddr,
    rssi: i16,
}

struct BleConnection {
    _is_events_registered: Arc<Mutex<bool>>,
    central: Arc<Mutex<Option<Adapter>>>,
    peripheral: Arc<Mutex<Option<Peripheral>>>,
}

impl BleConnection {
    fn new(central: Adapter) -> Self {
        Self {
            _is_events_registered: Arc::new(Mutex::new(false)),
            central: Arc::new(Mutex::new(Some(central))),
            peripheral: Arc::new(Mutex::new(None)),
        }
    }

    async fn set_peripheral(&self, peripheral: Option<Peripheral>) {
        let mut p = self.peripheral.lock().await;
        *p = peripheral;
    }

    pub async fn start_scan(&self) -> Result<(), String> {
        let central = self.central.lock().await;
        if let Err(e) = central
            .as_ref()
            .unwrap()
            .start_scan(ScanFilter { services: vec![] })
            .await
        {
            return Err(e.to_string());
        } else {
            Ok(())
        }
    }

    pub async fn stop_scan(&self) -> Result<(), String> {
        let central = self.central.lock().await;
        if let Err(e) = central.as_ref().unwrap().stop_scan().await {
            return Err(e.to_string());
        } else {
            Ok(())
        }
    }

    pub async fn is_connected(&self) -> bool {
        let peripheral = self.peripheral.lock().await;
        peripheral.is_some()
    }

    pub async fn connect(
        &self,
        peripheral_id: String,
        app: &AppHandle,
    ) -> Result<(), Box<dyn Error>> {
        self.stop_scan().await.unwrap();
        let central = self.central.lock().await;
        let peripheral = central
            .as_ref()
            .unwrap()
            .peripherals()
            .await?
            .into_iter()
            .find(|p| p.id().to_string() == peripheral_id)
            .ok_or_else(|| "5010")?;
        peripheral.connect().await?;
        peripheral.discover_services().await?;
        // 如果 peripheral.services() 不包含 0x180D 服务，则返回错误
        if !peripheral
            .services()
            .iter()
            .any(|s| s.uuid == uuid_from_u16(0x180D))
        {
            return Err("5011".into());
        }

        self.set_peripheral(Some(peripheral)).await;

        let peripheral = self.peripheral.lock().await;
        let device = BleDevice {
            peripheral_id: peripheral.as_ref().unwrap().id().to_string(),
            name: peripheral
                .as_ref()
                .unwrap()
                .properties()
                .await?
                .unwrap()
                .local_name
                .unwrap_or("Unknown".to_string()),
            address: peripheral.as_ref().unwrap().address(),
            rssi: peripheral
                .as_ref()
                .unwrap()
                .properties()
                .await?
                .unwrap()
                .rssi
                .unwrap_or(0),
        };

        let service = peripheral
            .as_ref()
            .unwrap()
            .services()
            .into_iter()
            .find(|s| s.uuid == uuid_from_u16(0x180D))
            .unwrap();
        let characteristic = service
            .characteristics
            .into_iter()
            .find(|c| c.uuid == uuid_from_u16(0x2A37))
            .unwrap();

        let peripheral = peripheral.clone();
        peripheral
            .as_ref()
            .unwrap()
            .subscribe(&characteristic)
            .await?;
        let app_clone = app.clone();

        tokio::spawn(async move {
            let mut notification_stream =
                peripheral.as_ref().unwrap().notifications().await.unwrap();
            while let Some(notification) = notification_stream.next().await {
                if notification.uuid == uuid_from_u16(0x2A37) {
                    let value = notification.value;
                    println!("Received notification: {:?}", value);
                    if value.len() < 2 {
                        continue;
                    }
                    let heart_rate = value[1];
                    app_clone.emit("heart-rate", heart_rate).unwrap();
                }
            }
        });

        app.emit("device-connected", device).unwrap();
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), Box<dyn Error>> {
        let mut peripheral = self.peripheral.lock().await;
        peripheral.as_ref().unwrap().disconnect().await?;
        *peripheral = None;
        Ok(())
    }

    pub async fn register_central_events(&self, app: &AppHandle) {
        let central = self.central.lock().await;
        let central_clone = central.clone(); // Clone the central variable
        let app_handle = app.clone(); // Clone the AppHandle to move into the tokio::spawn closure
        let mut event_stream = central.as_ref().unwrap().events().await.unwrap();

        let self_clone = self.clone(); // Clone the BleConnection to move into the tokio::spawn closure

        tokio::spawn(async move {
            while let Some(event) = event_stream.next().await {
                match event {
                    DeviceDiscovered(peripheral_id) | DeviceUpdated(peripheral_id) => {
                        let p = central_clone
                            .as_ref()
                            .unwrap()
                            .peripheral(&peripheral_id)
                            .await
                            .unwrap();
                        if let Ok(Some(props)) = p.properties().await {
                            let name = props.local_name.unwrap_or("Unknown".to_string());
                            let rssi = props.rssi.unwrap_or(0);
                            let device = BleDevice {
                                peripheral_id: peripheral_id.to_string(),
                                name,
                                address: props.address,
                                rssi,
                            };
                            let _ = app_handle.emit("device-discovered", Some(device));
                        }
                    }
                    DeviceDisconnected(peripheral) => {
                        let mut p = self_clone.peripheral.lock().await;
                        if let Some(peri) = p.as_ref() {
                            if peri.id() == peripheral {
                                app_handle
                                    .emit("device-disconnected", peripheral.to_string())
                                    .unwrap();
                                *p = None;
                            }
                        }
                    }
                    _ => {}
                }
            }
        });
    }
    // implements a Clone
    pub fn clone(&self) -> Self {
        Self {
            _is_events_registered: self._is_events_registered.clone(),
            central: self.central.clone(),
            peripheral: self.peripheral.clone(),
        }
    }
}

#[tauri::command]
async fn register_central_events<'a>(
    app_handle: AppHandle,
    connection: State<'a, BleConnection>,
) -> Result<bool, String> {
    if *connection._is_events_registered.lock().await {
        return Ok(false);
    } else {
        connection.register_central_events(&app_handle).await;
        *connection._is_events_registered.lock().await = true;
        Ok(true)
    }
}

#[tauri::command]
async fn start_scan(connection: State<'_, BleConnection>) -> Result<bool, String> {
    let err = connection.start_scan().await;
    if let Err(e) = err {
        return Err(e.to_string());
    } else {
        Ok(true)
    }
}

#[tauri::command]
async fn stop_scan(connection: State<'_, BleConnection>) -> Result<bool, String> {
    let err = connection.stop_scan().await;
    if let Err(e) = err {
        return Err(e.to_string());
    } else {
        Ok(true)
    }
}

#[tauri::command]
async fn is_connected(connection: State<'_, BleConnection>) -> Result<bool, String> {
    let status = connection.is_connected().await;
    Ok(status)
}

#[tauri::command]
async fn get_connected_device(connection: State<'_, BleConnection>) -> Result<BleDevice, String> {
    let peripheral = connection.peripheral.lock().await;
    let device = BleDevice {
        peripheral_id: peripheral.as_ref().unwrap().id().to_string(),
        name: peripheral
            .as_ref()
            .unwrap()
            .properties()
            .await
            .unwrap()
            .unwrap()
            .local_name
            .unwrap_or("Unknown".to_string()),
        address: peripheral.as_ref().unwrap().address(),
        rssi: peripheral
            .as_ref()
            .unwrap()
            .properties()
            .await
            .unwrap()
            .unwrap()
            .rssi
            .unwrap_or(0),
    };
    Ok(device)
}

#[tauri::command]
async fn connect(
    peripheral_id: String,
    connection: State<'_, BleConnection>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    if let Err(e) = connection.connect(peripheral_id, &app_handle).await {
        Err(e.to_string())
    } else {
        Ok(true)
    }
}

#[tauri::command]
async fn disconnect(connection: State<'_, BleConnection>) -> Result<bool, String> {
    if let Err(e) = connection.disconnect().await {
        Err(e.to_string())
    } else {
        Ok(true)
    }
}

#[tauri::command]
fn get_widget_url() -> Result<serde_json::Value, String> {
    let widget_builtin_url = "http://127.0.0.1:9918/widget/builtin";
    let widget_user_url = "http://127.0.0.1:9918/widget/user";
    let widget_url = serde_json::json!({
        "builtin": widget_builtin_url,
        "user": widget_user_url
    });
    Ok(widget_url)
}

// ── SSE 事件广播器 ──
// 每个 pluginId 对应一个 broadcast channel，用于向 SSE 客户端推送事件
// streaming 必须通过 start_streaming 显式启动后才可用
#[derive(Clone)]
struct SseBroadcaster {
    channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    active: Arc<Mutex<std::collections::HashSet<String>>>,
}

impl SseBroadcaster {
    fn new() -> Self {
        Self {
            channels: Arc::new(Mutex::new(HashMap::new())),
            active: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }

    async fn is_active(&self, plugin_id: &str) -> bool {
        self.active.lock().await.contains(plugin_id)
    }

    async fn activate(&self, plugin_id: &str) {
        self.active.lock().await.insert(plugin_id.to_string());
        let mut channels = self.channels.lock().await;
        if !channels.contains_key(plugin_id) {
            let (tx, _rx) = broadcast::channel::<String>(64);
            channels.insert(plugin_id.to_string(), tx);
        }
    }

    async fn subscribe(&self, plugin_id: &str) -> Option<broadcast::Receiver<String>> {
        let channels = self.channels.lock().await;
        channels.get(plugin_id).map(|tx| tx.subscribe())
    }

    async fn deactivate(&self, plugin_id: &str) {
        self.active.lock().await.remove(plugin_id);
        self.channels.lock().await.remove(plugin_id);
    }

    #[allow(dead_code)]
    async fn broadcast_to(&self, plugin_id: &str, event: &str, data: &str) {
        let channels = self.channels.lock().await;
        if let Some(tx) = channels.get(plugin_id) {
            let msg = format!("event: {}\ndata: {}\n\n", event, data);
            let _ = tx.send(msg);
        }
    }

    async fn broadcast_all(&self, event: &str, data: &str) {
        let channels = self.channels.lock().await;
        for tx in channels.values() {
            let msg = format!("event: {}\ndata: {}\n\n", event, data);
            let _ = tx.send(msg);
        }
    }
}

// ── 新版 Tauri Commands ──

#[tauri::command]
async fn open_widget(
    plugin_id: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let label = format!("widget_{}", plugin_id);

    // 检查窗口是否已存在
    if let Some(window) = app_handle.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(true);
    }

    // 解析插件目录，找到 manifest
    let resource_plugins = app_handle.path().resolve("plugins", BaseDirectory::Resource).unwrap();
    let appdata_plugins = resolve_appdata(&app_handle, "plugins");

    let plugin_dir = if appdata_plugins.join(&plugin_id).exists() {
        appdata_plugins.join(&plugin_id)
    } else if resource_plugins.join(&plugin_id).exists() {
        resource_plugins.join(&plugin_id)
    } else {
        return Err(format!("插件 '{}' 未找到", plugin_id));
    };

    // 读取 manifest 获取 widget entry
    let manifest_path = plugin_dir.join("hbcat-manifest.json");
    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 manifest 失败: {}", e))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("解析 manifest 失败: {}", e))?;

    let widget = manifest["widget"].as_object()
        .ok_or("该插件不支持桌面组件")?;
    let entry = widget["entry"].as_str()
        .unwrap_or("widget/index.html");
    let window_cfg = &widget["window"];

    let width = window_cfg["width"].as_f64().unwrap_or(200.0);
    let height = window_cfg["height"].as_f64().unwrap_or(150.0);
    let always_on_top = window_cfg["alwaysOnTop"].as_bool().unwrap_or(true);
    let transparent = window_cfg["transparent"].as_bool().unwrap_or(true);

    // 构建 URL
    let url = format!("http://127.0.0.1:9918/p/{}/{}", plugin_id, entry);

    let window = WebviewWindowBuilder::new(&app_handle, &label, WebviewUrl::External(url.parse().unwrap()))
        .title(format!("HBCat 组件 - {}", manifest["plugin"]["name"].as_str().unwrap_or(&plugin_id)))
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .transparent(transparent)
        .always_on_top(always_on_top)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    let _ = window.show();
    let _ = window.set_size(tauri::LogicalSize::new(width, height));

    // 恢复保存的位置和运行时设置
    let config_dir = resolve_appdata(&app_handle, "plugin-config");
    let config_path = config_dir.join(format!("{}.json", plugin_id));
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(rt) = cfg["_runtime"].as_object() {
                    // 位置
                    let x = rt.get("x").and_then(|v| v.as_f64()).unwrap_or(-1.0);
                    let y = rt.get("y").and_then(|v| v.as_f64()).unwrap_or(-1.0);
                    if x >= 0.0 && y >= 0.0 {
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                    // 透明度
                    if let Some(opacity) = rt.get("opacity").and_then(|v| v.as_f64()) {
                        let js = format!("document.documentElement.style.opacity = '{}'", opacity);
                        let _ = window.eval(&js);
                    }
                    // 缩放
                    if let Some(scale) = rt.get("scale").and_then(|v| v.as_f64()) {
                        if scale != 1.0 {
                            let _ = window.set_size(tauri::LogicalSize::new(
                                width * scale,
                                height * scale,
                            ));
                        }
                    }
                    // 点击穿透
                    if let Some(ct) = rt.get("clickThrough").and_then(|v| v.as_bool()) {
                        let _ = window.set_ignore_cursor_events(ct);
                    }
                }
            }
        }
    }

    Ok(true)
}

#[tauri::command]
async fn close_widget(
    plugin_id: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let label = format!("widget_{}", plugin_id);
    if let Some(window) = app_handle.get_webview_window(&label) {
        // 保存窗口位置
        if let Ok(pos) = window.outer_position() {
            let config_dir = resolve_appdata(&app_handle, "plugin-config");
            let _ = std::fs::create_dir_all(&config_dir);
            let config_path = config_dir.join(format!("{}.json", plugin_id));
            let mut cfg = if config_path.exists() {
                std::fs::read_to_string(&config_path)
                    .ok()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };
            if cfg["_runtime"].is_null() {
                cfg["_runtime"] = serde_json::json!({});
            }
            cfg["_runtime"]["x"] = serde_json::json!(pos.x);
            cfg["_runtime"]["y"] = serde_json::json!(pos.y);
            let _ = std::fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap_or_default());
        }
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
async fn set_widget_opacity(
    plugin_id: String,
    opacity: f64,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let label = format!("widget_{}", plugin_id);
    if let Some(webview) = app_handle.get_webview_window(&label) {
        let js = format!("document.documentElement.style.opacity = '{}'", opacity);
        let _ = webview.eval(&js);
    }
    Ok(true)
}

#[tauri::command]
async fn set_widget_scale(
    plugin_id: String,
    base_width: f64,
    base_height: f64,
    scale: f64,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let label = format!("widget_{}", plugin_id);
    if let Some(window) = app_handle.get_webview_window(&label) {
        let _ = window.set_size(tauri::LogicalSize::new(
            base_width * scale,
            base_height * scale,
        ));
    }
    Ok(true)
}

#[tauri::command]
async fn set_widget_click_through(
    plugin_id: String,
    click_through: bool,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let label = format!("widget_{}", plugin_id);
    if let Some(window) = app_handle.get_webview_window(&label) {
        let _ = window.set_ignore_cursor_events(click_through);
    }
    Ok(true)
}

#[tauri::command]
async fn start_streaming(
    plugin_id: String,
    broadcaster: State<'_, SseBroadcaster>,
) -> Result<bool, String> {
    broadcaster.activate(&plugin_id).await;
    Ok(true)
}

#[tauri::command]
async fn stop_streaming(
    plugin_id: String,
    broadcaster: State<'_, SseBroadcaster>,
) -> Result<bool, String> {
    broadcaster.deactivate(&plugin_id).await;
    Ok(true)
}

#[tauri::command]
fn get_streaming_url(plugin_id: String) -> Result<String, String> {
    Ok(format!("http://127.0.0.1:9918/p/{}/streaming/index.html", plugin_id))
}

#[tauri::command]
async fn get_plugin_config(
    plugin_id: String,
    app_handle: AppHandle,
) -> Result<serde_json::Value, String> {
    let config_dir = resolve_appdata(&app_handle, "plugin-config");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join(format!("{}.json", plugin_id));
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

#[tauri::command]
async fn set_plugin_config(
    plugin_id: String,
    config: serde_json::Value,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let config_dir = resolve_appdata(&app_handle, "plugin-config");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join(format!("{}.json", plugin_id));

    // 读取并合并已有配置
    let mut merged = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // 深度合并：新值覆盖旧值。对 _runtime 做字段级合并
    if let Some(new_rt) = config.get("_runtime") {
        if merged["_runtime"].is_null() {
            merged["_runtime"] = serde_json::json!({});
        }
        if let (Some(dst), Some(src)) = (merged["_runtime"].as_object_mut(), new_rt.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
    }

    // 普通字段直接覆盖
    if let Some(obj) = config.as_object() {
        for (k, v) in obj {
            if k != "_runtime" {
                merged[k] = v.clone();
            }
        }
    }

    let content = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn install_plugin(
    file_path: String,
    force: Option<bool>,
    app_handle: AppHandle,
) -> Result<serde_json::Value, String> {
    let plugins_dir = resolve_appdata(&app_handle, "plugins");
    std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;

    // 读取 zip 文件，提取 manifest
    let file = std::fs::File::open(&file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取插件包: {}", e))?;

    let mut manifest: Option<serde_json::Value> = None;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name == "hbcat-manifest.json" || name.ends_with("/hbcat-manifest.json") {
            let content = std::io::read_to_string(entry).map_err(|e| e.to_string())?;
            manifest = Some(serde_json::from_str(&content).map_err(|e| format!("manifest 格式错误: {}", e))?);
            break;
        }
    }

    let manifest = manifest.ok_or("插件包中未找到 hbcat-manifest.json")?;
    let plugin_id = manifest["plugin"]["id"].as_str()
        .ok_or("manifest 缺少 plugin.id")?
        .to_string();
    let plugin_name = manifest["plugin"]["name"].as_str().unwrap_or(&plugin_id);
    let new_version = manifest["plugin"]["version"].as_str().unwrap_or("0.0.0");

    // ── 内置插件冲突检测：不允许安装与内置插件 ID 相同的插件 ──
    let resource_plugins = app_handle.path().resolve("plugins", BaseDirectory::Resource).unwrap();
    let builtin_manifest_path = resource_plugins.join(&plugin_id).join("hbcat-manifest.json");
    if builtin_manifest_path.exists() {
        return Err(format!("BUILTIN:{}", plugin_name));
    }

    // ── 版本冲突检测 ──
    let target_dir = plugins_dir.join(&plugin_id);
    let existing_manifest_path = target_dir.join("hbcat-manifest.json");

    if target_dir.exists() && existing_manifest_path.exists() {
        let existing = std::fs::read_to_string(&existing_manifest_path).unwrap_or_default();
        if let Ok(existing_json) = serde_json::from_str::<serde_json::Value>(&existing) {
            let old_version = existing_json["plugin"]["version"].as_str().unwrap_or("0.0.0");

            if old_version == new_version {
                return Err(format!("SAME_VERSION:{}", old_version));
            }

            if !force.unwrap_or(false) {
                // 需要用户确认升级/降级
                return Ok(serde_json::json!({
                    "action": "confirm",
                    "pluginId": plugin_id,
                    "pluginName": plugin_name,
                    "oldVersion": old_version,
                    "newVersion": new_version
                }));
            }
        }
    }

    // ── 执行安装 ──
    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir).map_err(|e| format!("无法覆盖已安装的插件: {}", e))?;
    }

    let file = std::fs::File::open(&file_path).map_err(|e| format!("无法重新打开文件: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取插件包: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let target_path = target_dir.join(&name);

        if entry.is_dir() {
            std::fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = std::fs::File::create(&target_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    // 初始化默认配置
    if let Some(settings) = manifest.get("settings") {
        let config_dir = resolve_appdata(&app_handle, "plugin-config");
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        let config_path = config_dir.join(format!("{}.json", plugin_id));
        if !config_path.exists() {
            let defaults = extract_defaults(settings);
            let content = serde_json::to_string_pretty(&defaults).map_err(|e| e.to_string())?;
            std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
        }
    }

    let old_version = if force.unwrap_or(false) { Some("") } else { None };
    Ok(serde_json::json!({
        "action": if old_version.is_some() { "upgraded" } else { "installed" },
        "pluginId": plugin_id,
        "pluginName": plugin_name,
        "version": new_version
    }))
}

fn extract_defaults(schema: &serde_json::Value) -> serde_json::Value {
    let mut defaults = serde_json::json!({});
    if let Some(props) = schema["properties"].as_object() {
        for (key, prop) in props {
            if let Some(default) = prop.get("default") {
                defaults[key] = default.clone();
            }
        }
    }
    defaults
}

#[tauri::command]
async fn close_all_widgets(app_handle: AppHandle) -> Result<bool, String> {
    let windows: Vec<String> = app_handle
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with("widget_"))
        .cloned()
        .collect();

    for label in &windows {
        if let Some(window) = app_handle.get_webview_window(label) {
            // 保存窗口位置
            if let Ok(pos) = window.outer_position() {
                let plugin_id = label.strip_prefix("widget_").unwrap_or(label);
                let config_dir = resolve_appdata(&app_handle, "plugin-config");
                let _ = std::fs::create_dir_all(&config_dir);
                let config_path = config_dir.join(format!("{}.json", plugin_id));
                let mut cfg = if config_path.exists() {
                    std::fs::read_to_string(&config_path)
                        .ok()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .unwrap_or(serde_json::json!({}))
                } else {
                    serde_json::json!({})
                };
                if cfg["_runtime"].is_null() {
                    cfg["_runtime"] = serde_json::json!({});
                }
                cfg["_runtime"]["x"] = serde_json::json!(pos.x);
                cfg["_runtime"]["y"] = serde_json::json!(pos.y);
                let _ = std::fs::write(
                    &config_path,
                    serde_json::to_string_pretty(&cfg).unwrap_or_default(),
                );
            }
            let _ = window.close();
        }
    }

    Ok(true)
}

#[tauri::command]
async fn uninstall_plugin(
    plugin_id: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let plugins_dir = resolve_appdata(&app_handle, "plugins");
    let plugin_dir = plugins_dir.join(&plugin_id);
    if plugin_dir.exists() {
        std::fs::remove_dir_all(&plugin_dir).map_err(|e| e.to_string())?;
    }
    // 同时删除配置
    let config_dir = resolve_appdata(&app_handle, "plugin-config");
    let config_path = config_dir.join(format!("{}.json", plugin_id));
    if config_path.exists() {
        std::fs::remove_file(&config_path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tokio::main]
async fn main() {
    let ble_manager = BtleManager::new().await.unwrap();
    let central = ble_manager
        .adapters()
        .await
        .unwrap()
        .into_iter()
        .nth(0)
        .unwrap();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_window("main") {
                if !window.is_visible().unwrap_or(true) {
                    let _ = window.show();
                }
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                }
                let _ = window.set_focus();
            }
        }));
    }

    let broadcaster = SseBroadcaster::new();
    let warp_broadcaster = broadcaster.clone();

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BleConnection::new(central))
        .manage(broadcaster)
        .invoke_handler(tauri::generate_handler![
            register_central_events,
            start_scan,
            stop_scan,
            is_connected,
            connect,
            disconnect,
            get_connected_device,
            get_widget_url,
            open_widget,
            close_widget,
            close_all_widgets,
            set_widget_click_through,
            set_widget_opacity,
            set_widget_scale,
            start_streaming,
            stop_streaming,
            get_streaming_url,
            get_plugin_config,
            set_plugin_config,
            install_plugin,
            uninstall_plugin
        ])
        .setup(move |app: &mut tauri::App| {
            let app_handle: tauri::AppHandle = app.handle().clone();

            // 监听心率事件并广播到 SSE
            let sse_bc = warp_broadcaster.clone();
            app_handle.listen("heart-rate", move |event| {
                let payload = event.payload();
                let bc = sse_bc.clone();
                let data = payload.to_string();
                tokio::spawn(async move {
                    bc.broadcast_all("heart-rate", &data).await;
                });
            });

            let resource_plugins = app_handle
                .path()
                .resolve("plugins", BaseDirectory::Resource)
                .unwrap();
            let appdata_plugins = resolve_appdata(&app_handle, "plugins");

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async move {
                    let rp = resource_plugins.clone();
                    let ap = appdata_plugins.clone();

                    // /p/{id}/{*path} — 统一插件静态文件路由（放在最后作为 fallback）
                    let plugin_files = warp::path("p")
                        .and(warp::path::param::<String>())
                        .and(warp::path::tail())
                        .and_then(move |plugin_id: String, tail: warp::path::Tail| {
                            let rp = rp.clone();
                            let ap = ap.clone();
                            async move {
                                let tail_str = tail.as_str();
                                // 排除 API 路径，让它们被前面的路由处理
                                if tail_str == "events" || tail_str == "config" {
                                    return Err(warp::reject::not_found());
                                }
                                let appdata_file = ap.join(&plugin_id).join(tail_str);
                                let _resource_file = rp.join(&plugin_id).join(tail_str);

                                let base = if appdata_file.exists() {
                                    ap.join(&plugin_id)
                                } else {
                                    rp.join(&plugin_id)
                                };

                                let full = base.join(tail_str);
                                match tokio::fs::read(&full).await {
                                    Ok(data) => {
                                        let mime = mime_guess::from_path(tail_str).first_or_octet_stream();
                                        Ok::<_, warp::Rejection>(warp::http::Response::builder()
                                            .header("Content-Type", mime.to_string())
                                            .header("Access-Control-Allow-Origin", "*")
                                            .body(data)
                                            .unwrap())
                                    }
                                    Err(_) => {
                                        Err(warp::reject::not_found())
                                    }
                                }
                            }
                        });

                    // /p/{id}/events — SSE 端点（需先启动 streaming）
                    let bc = warp_broadcaster.clone();
                    let sse_route = warp::path("p")
                        .and(warp::path::param::<String>())
                        .and(warp::path("events"))
                        .and(warp::path::end())
                        .and_then(move |plugin_id: String| {
                            let bc = bc.clone();
                            async move {
                                if !bc.is_active(&plugin_id).await {
                                    return Err(warp::reject::not_found());
                                }
                                let mut rx = match bc.subscribe(&plugin_id).await {
                                    Some(rx) => rx,
                                    None => return Err(warp::reject::not_found()),
                                };
                                let stream = async_stream::stream! {
                                    // 发送初始连接确认
                                    yield Ok::<_, Infallible>(warp::sse::Event::default()
                                        .event("connected")
                                        .data("{}"));
                                    loop {
                                        match rx.recv().await {
                                            Ok(msg) => {
                                                // msg 格式: "event: heart-rate\ndata: {...}\n\n"
                                                // 提取 event 和 data
                                                let parts: Vec<&str> = msg.splitn(2, "\ndata: ").collect();
                                                let event_name = parts[0].trim_start_matches("event: ");
                                                let data = parts.get(1)
                                                    .unwrap_or(&"")
                                                    .trim_end_matches("\n\n");
                                                yield Ok::<_, Infallible>(warp::sse::Event::default()
                                                    .event(event_name)
                                                    .data(data.to_string()));
                                            }
                                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                                            Err(broadcast::error::RecvError::Closed) => break,
                                        }
                                    }
                                };
                                Ok::<_, warp::Rejection>(warp::sse::reply(warp::sse::keep_alive().stream(stream)))
                            }
                        });

                    // /p/{id}/config — 插件配置查询
                    let config_route = warp::path("p")
                        .and(warp::path::param::<String>())
                        .and(warp::path("config"))
                        .and(warp::path::end())
                        .map(move |plugin_id: String| {
                            let config_dir = appdata_plugins.join("..").join("plugin-config");
                            let config_path = config_dir.join(format!("{}.json", plugin_id));
                            let body = if config_path.exists() {
                                std::fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string())
                            } else {
                                "{}".to_string()
                            };
                            warp::http::Response::builder()
                                .header("Content-Type", "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(body)
                                .unwrap()
                        });

                    // /api/status — 全局状态
                    let status_route = warp::path("api")
                        .and(warp::path("status"))
                        .and(warp::path::end())
                        .map(|| {
                            let status = serde_json::json!({
                                "heartRate": 0,
                                "deviceConnected": false,
                            });
                            warp::http::Response::builder()
                                .header("Content-Type", "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(status.to_string())
                                .unwrap()
                        });

                    let routes = sse_route.or(config_route).or(status_route).or(plugin_files);

                    warp::serve(routes).run(([127, 0, 0, 1], 9918)).await;
                });
            });

            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Heartbeat Cat")
                .inner_size(800.0, 500.0)
                .min_inner_size(800.0, 500.0)
                .user_agent("Heartbeat Cat Desktop");

            #[cfg(target_os = "macos")]
            use tauri::TitleBarStyle;

            #[cfg(target_os = "macos")]
            let win_builder = win_builder.title_bar_style(TitleBarStyle::Transparent);

            let _ = win_builder.build().unwrap();

            // #[cfg(target_os = "macos")]
            // {
            //     use cocoa::appkit::{NSColor, NSWindow};
            //     use cocoa::base::{id, nil};

            //     let ns_window = window.ns_window().unwrap() as id;
            //     unsafe {
            //         let bg_color = NSColor::colorWithRed_green_blue_alpha_(
            //             nil,
            //             50.0 / 255.0,
            //             158.0 / 255.0,
            //             163.5 / 255.0,
            //             1.0,
            //         );
            //         ns_window.setBackgroundColor_(bg_color);
            //     }
            // }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                // macOS Dock 图标点击时，如果主窗口隐藏则重新显示
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                RunEvent::Exit => {
                    // 安全网：退出前关闭所有小组件窗口
                    let windows: Vec<String> = app_handle
                        .webview_windows()
                        .keys()
                        .filter(|label| label.starts_with("widget_"))
                        .cloned()
                        .collect();
                    for label in &windows {
                        if let Some(window) = app_handle.get_webview_window(label) {
                            let _ = window.close();
                        }
                    }
                }
                _ => {}
            }
        });
}
