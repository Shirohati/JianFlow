use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerStatus {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub tools_count: usize,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub server_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolCallRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolCallResult {
    pub success: bool,
    pub content: Vec<McpContentItem>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum McpContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "resource")]
    Resource { resource: Value },
}

struct McpServerConnection {
    config: McpServerConfig,
    tools: Vec<McpToolDefinition>,
    connected: bool,
    error: Option<String>,
}

pub struct McpRegistry {
    servers: Mutex<HashMap<String, McpServerConnection>>,
    client: reqwest::Client,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn register_server(&self, config: McpServerConfig) -> Result<(), String> {
        let mut servers = self.servers.lock().map_err(|e| e.to_string())?;
        if servers.contains_key(&config.id) {
            return Err(format!("服务器 {} 已存在", config.id));
        }
        servers.insert(
            config.id.clone(),
            McpServerConnection {
                config,
                tools: Vec::new(),
                connected: false,
                error: None,
            },
        );
        Ok(())
    }

    pub fn remove_server(&self, id: &str) -> bool {
        let mut servers = self.servers.lock().ok();
        match servers {
            Some(ref mut s) => s.remove(id).is_some(),
            None => false,
        }
    }

    pub fn get_servers(&self) -> Vec<McpServerStatus> {
        let servers = self.servers.lock().ok();
        match servers {
            Some(ref s) => s
                .iter()
                .map(|(_, conn)| McpServerStatus {
                    id: conn.config.id.clone(),
                    name: conn.config.name.clone(),
                    connected: conn.connected,
                    tools_count: conn.tools.len(),
                    error: conn.error.clone(),
                })
                .collect(),
            None => Vec::new(),
        }
    }

    pub fn get_tools(&self, server_id: &str) -> Result<Vec<McpToolDefinition>, String> {
        let servers = self.servers.lock().map_err(|e| e.to_string())?;
        let conn = servers.get(server_id).ok_or_else(|| "服务器未找到".to_string())?;
        Ok(conn.tools.clone())
    }

    pub fn get_all_tools(&self) -> Vec<McpToolDefinition> {
        let servers = self.servers.lock().ok();
        match servers {
            Some(ref s) => s.iter().flat_map(|(_, c)| c.tools.clone()).collect(),
            None => Vec::new(),
        }
    }

    pub async fn connect_server(&self, id: &str) -> Result<(), String> {
        let config = {
            let servers = self.servers.lock().map_err(|e| e.to_string())?;
            let conn = servers.get(id).ok_or_else(|| "服务器未找到".to_string())?;
            conn.config.clone()
        };

        let transport = config.transport.as_str();
        let tools = match transport {
            "sse" | "http" => self.connect_http(&config).await?,
            "stdio" => self.connect_stdio(&config).await?,
            _ => return Err(format!("不支持的传输类型: {}", transport)),
        };

        let mut servers = self.servers.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = servers.get_mut(id) {
            conn.connected = true;
            conn.tools = tools;
            conn.error = None;
        }
        Ok(())
    }

    pub async fn disconnect_server(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = servers.get_mut(id) {
            conn.connected = false;
            conn.tools.clear();
            conn.error = None;
            Ok(())
        } else {
            Err("服务器未找到".to_string())
        }
    }

    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        args: Value,
    ) -> Result<McpToolCallResult, String> {
        let config = {
            let servers = self.servers.lock().map_err(|e| e.to_string())?;
            let conn = servers.get(server_id).ok_or_else(|| "服务器未找到".to_string())?;
            if !conn.connected {
                return Err("服务器未连接".to_string());
            }
            conn.config.clone()
        };

        match config.transport.as_str() {
            "sse" | "http" => self.call_tool_http(&config, tool_name, args).await,
            "stdio" => self.call_tool_stdio(&config, tool_name, args).await,
            _ => Err(format!("不支持的传输类型: {}", config.transport)),
        }
    }

    async fn connect_http(&self, config: &McpServerConfig) -> Result<Vec<McpToolDefinition>, String> {
        let url = config.url.as_ref().ok_or_else(|| "缺少 URL".to_string())?;

        let init_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "learning_todo",
                    "version": "0.2.0"
                }
            }
        });

        let resp = self
            .client
            .post(url)
            .json(&init_body)
            .send()
            .await
            .map_err(|e| format!("初始化请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("初始化返回状态码: {}", resp.status()));
        }

        let list_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        });

        let resp = self
            .client
            .post(url)
            .json(&list_body)
            .send()
            .await
            .map_err(|e| format!("获取工具列表失败: {}", e))?;

        let text = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
        let v: Value = serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {}", e))?;
        let result = v.get("result").ok_or_else(|| "响应缺少 result".to_string())?;
        let tools_arr = result
            .get("tools")
            .and_then(|t| t.as_array())
            .ok_or_else(|| "响应缺少 tools 数组".to_string())?;

        let tools = tools_arr
            .iter()
            .map(|t| McpToolDefinition {
                name: t.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                description: t
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string(),
                input_schema: t.get("inputSchema").cloned().unwrap_or(Value::Null),
                server_id: config.id.clone(),
            })
            .collect();

        Ok(tools)
    }

    async fn connect_stdio(&self, _config: &McpServerConfig) -> Result<Vec<McpToolDefinition>, String> {
        Err("STDIO 传输尚未实现".to_string())
    }

    async fn call_tool_http(
        &self,
        config: &McpServerConfig,
        tool_name: &str,
        args: Value,
    ) -> Result<McpToolCallResult, String> {
        let url = config.url.as_ref().ok_or_else(|| "缺少 URL".to_string())?;

        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": args
            }
        });

        let resp = self
            .client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("调用工具失败: {}", e))?;

        let text = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
        let v: Value = serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {}", e))?;

        if let Some(error) = v.get("error") {
            return Ok(McpToolCallResult {
                success: false,
                content: Vec::new(),
                error: Some(error.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误").to_string()),
            });
        }

        let result = v.get("result").ok_or_else(|| "响应缺少 result".to_string())?;
        let content_arr = result.get("content").and_then(|c| c.as_array()).cloned().unwrap_or_default();

        let content: Vec<McpContentItem> = content_arr
            .iter()
            .filter_map(|item| {
                let type_str = item.get("type").and_then(|t| t.as_str()).unwrap_or("text");
                match type_str {
                    "text" => Some(McpContentItem::Text {
                        text: item.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                    }),
                    "resource" => Some(McpContentItem::Resource {
                        resource: item.clone(),
                    }),
                    _ => None,
                }
            })
            .collect();

        Ok(McpToolCallResult {
            success: true,
            content,
            error: None,
        })
    }

    async fn call_tool_stdio(
        &self,
        _config: &McpServerConfig,
        _tool_name: &str,
        _args: Value,
    ) -> Result<McpToolCallResult, String> {
        Err("STDIO 传输尚未实现".to_string())
    }
}

impl Default for McpRegistry {
    fn default() -> Self {
        Self::new()
    }
}
