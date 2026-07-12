use crate::models::ConversationMessage;

pub struct OllamaClient {
    pub base_url: String,
    pub default_model: String,
}

impl OllamaClient {
    pub fn new() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            default_model: "qwen2.5:7b".to_string(),
        }
    }

    pub fn is_available(&self) -> bool {
        std::net::TcpStream::connect_timeout(
            &"127.0.0.1:11434".parse().unwrap(),
            std::time::Duration::from_secs(2)
        ).is_ok()
    }

    pub async fn chat(&self, model: &str, messages: &[ConversationMessage]) -> Result<String, String> {
        let url = format!("{}/api/chat", self.base_url);
        let client = reqwest::Client::new();

        let req_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
            serde_json::json!({"role": m.role, "content": m.content})
        }).collect();

        let body = serde_json::json!({
            "model": if model.is_empty() { &self.default_model } else { model },
            "messages": req_messages,
            "stream": false,
        });

        let resp = client.post(&url).json(&body).send().await
            .map_err(|e| format!("Ollama 请求失败: {}", e))?;
        let result: serde_json::Value = resp.json().await
            .map_err(|e| format!("解析 Ollama 响应失败: {}", e))?;

        result.get("message").and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Ollama 响应缺少 message.content".to_string())
    }
}
