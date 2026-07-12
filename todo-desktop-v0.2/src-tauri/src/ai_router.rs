use crate::models::ActivitySettings;

#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub enum TaskComplexity {
    Trivial,
    Simple,
    Moderate,
    Complex,
}

#[derive(Debug, Clone)]
pub struct ModelTier {
    pub name: String,
    pub model_id: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub cost_per_1k_input: f64,
    pub cost_per_1k_output: f64,
    pub supports_streaming: bool,
}

impl Default for ModelTier {
    fn default() -> Self {
        Self {
            name: "default".into(),
            model_id: "gpt-4o-mini".into(),
            max_tokens: 8192,
            temperature: 0.7,
            cost_per_1k_input: 0.15,
            cost_per_1k_output: 0.60,
            supports_streaming: true,
        }
    }
}

pub struct ComplexityClassifier;

impl ComplexityClassifier {
    pub fn new() -> Self { Self }

    pub fn classify(&self, message: &str, history_len: usize, _has_tools: bool) -> TaskComplexity {
        let msg_lower = message.to_lowercase();
        let len = message.chars().count();

        if len < 15 || msg_lower.contains("hi") || msg_lower.contains("hello") || msg_lower.contains("你好") || msg_lower == "在吗" {
            return TaskComplexity::Trivial;
        }

        let complex_keywords = ["工作流", "workflow", "深度分析", "全面", "详细报告", "策略", "长期"];
        let moderate_keywords = ["分析", "规划", "总结", "建议", "review", "plan", "analyze", "评估", "对比"];

        if complex_keywords.iter().any(|k| msg_lower.contains(k)) || len > 200 {
            return TaskComplexity::Complex;
        }

        if moderate_keywords.iter().any(|k| msg_lower.contains(k)) || len > 80 || history_len > 6 {
            return TaskComplexity::Moderate;
        }

        TaskComplexity::Simple
    }
}

pub struct ModelRouter;

impl ModelRouter {
    pub fn new() -> Self { Self }

    pub fn route(&self, complexity: &TaskComplexity, settings: &ActivitySettings) -> (String, u32, f32) {
        let configured_model = if settings.ai_model.is_empty() { "gpt-4o-mini" } else { &settings.ai_model };

        match complexity {
            TaskComplexity::Trivial => {
                ("gpt-4o-mini".to_string(), 1024, 0.3)
            }
            TaskComplexity::Simple => {
                (configured_model.to_string(), 2048, 0.5)
            }
            TaskComplexity::Moderate => {
                (configured_model.to_string(), 4096, 0.7)
            }
            TaskComplexity::Complex => {
                (configured_model.to_string(), 8192, 0.7)
            }
        }
    }

    pub fn adapt_prompt(&self, complexity: &TaskComplexity, full_prompt: &str) -> String {
        match complexity {
            TaskComplexity::Trivial => {
                "你是一个简洁的 AI 助手，用最短的话回答用户。不需要工具调用。".to_string()
            }
            TaskComplexity::Simple => {
                full_prompt.chars().take(500).collect()
            }
            _ => full_prompt.to_string()
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct CostTracker {
    pub daily_cost: f64,
    pub total_cost: f64,
    pub total_tokens_input: u64,
    pub total_tokens_output: u64,
    pub request_count: u64,
}
