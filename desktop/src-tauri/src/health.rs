//! 端口健康检查（Rust 后端）
//! ----------------------------------------------------------------------------
//! 定时轮询服务 health 端点，更新状态。带重试与超时，规避 WSL2 端口转发
//! 在休眠/唤醒后短暂不可用的已知坑（README 已知限制）。

use std::time::Duration;

/// 单次健康检查：GET url，返回是否成功（2xx）。
pub async fn check_once(client: &reqwest::Client, url: &str) -> bool {
    match client.get(url).timeout(Duration::from_secs(5)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// 带重试的健康检查：在 timeout 内每 interval 轮询一次。
/// 返回最终是否健康。
pub async fn check_with_retry(url: &str, attempts: u32, interval_ms: u64) -> bool {
    let client = reqwest::Client::new();
    for _ in 0..attempts.max(1) {
        if check_once(&client, url).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }
    false
}
