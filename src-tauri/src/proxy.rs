//! 通用 HTTP 反向代理（Rust 后端）
//! ----------------------------------------------------------------------------
//! 用于 api_proxy 模式服务（如 Ollama）：壳内通过 reqwest 转发请求，
//! 绕过浏览器同源策略（CORS）。第一步仅 deepseek_harness 使用 webview_embed，
//! 但代理模块已就绪，供后续 api_proxy 服务复用（README 核心功能 5）。

use std::time::Duration;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    pub body: Option<String>,
}

/// 执行一次代理请求，返回响应文本。
/// 失败返回 Err（由 command 层序列化为字符串）。
pub async fn proxy(req: ProxyRequest) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let method = req.method.clone().unwrap_or_else(|| "GET".into());
    let mut builder = match method.to_uppercase().as_str() {
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        "DELETE" => client.delete(&req.url),
        "PATCH" => client.patch(&req.url),
        _ => client.get(&req.url),
    };

    if let Some(b) = &req.body {
        builder = builder
            .header("Content-Type", "application/json")
            .body(b.clone());
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}
