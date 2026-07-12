use chrono::Datelike;
use crate::models::*;
use std::collections::HashMap;

pub struct MemoryEngine {
    pub memories: std::sync::Mutex<Vec<VectorMemory>>,
}

impl MemoryEngine {
    pub fn new() -> Self {
        MemoryEngine {
            memories: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn from_vec(memories: Vec<VectorMemory>) -> Self {
        MemoryEngine {
            memories: std::sync::Mutex::new(memories),
        }
    }

    pub async fn store(&self, mut memory: VectorMemory) -> String {
        if memory.id.is_empty() {
            memory.id = uuid::Uuid::new_v4().to_string();
        }
        if memory.memory_type.is_empty() {
            memory.memory_type = auto_classify(&memory.content);
        }
        memory.embedding = Some(compute_embedding(&memory.content));
        if memory.created_at.is_empty() {
            memory.created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        }
        memory.last_accessed = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let mut memories = self.memories.lock().unwrap();
        if let Some(existing) = memories.iter_mut().find(|m| m.id == memory.id) {
            *existing = memory.clone();
        } else {
            memories.push(memory.clone());
        }
        memory.id
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<VectorMemory> {
        let memories = self.memories.lock().unwrap();
        if memories.is_empty() {
            return Vec::new();
        }
        let query_tokens = tokenize(query);
        let mut scored: Vec<(f64, usize)> = memories.iter().enumerate().map(|(i, m)| {
            let content_tokens = tokenize(&m.content);
            let mut score = 0.0;
            for qt in &query_tokens {
                for ct in &content_tokens {
                    if ct.contains(qt) || qt.contains(ct) {
                        score += 1.0;
                    }
                }
            }
            if !content_tokens.is_empty() {
                score = score / content_tokens.len() as f64;
            }
            score += m.importance * 2.0;
            score *= 1.0 - m.decay_rate;
            score += (m.access_count as f64).ln_1p() * 0.1;
            (score, i)
        }).collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(limit).map(|(_, i)| {
            let mut m = memories[i].clone();
            m.access_count += 1;
            m.last_accessed = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            m
        }).collect()
    }

    pub async fn extract_from_conversation(&self, user_message: &str, _ai_reply: &str) -> Vec<VectorMemory> {
        let mut extracted = Vec::new();
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        if user_message.contains("喜欢") || user_message.contains("prefer") || user_message.contains("like") {
            extracted.push(VectorMemory {
                id: String::new(),
                content: user_message.to_string(),
                memory_type: "preference".into(),
                source: "conversation".into(),
                importance: 0.6,
                created_at: now.clone(),
                last_accessed: now.clone(),
                access_count: 0,
                embedding: None,
                related_ids: Vec::new(),
                decay_rate: 0.2,
                metadata: HashMap::new(),
            });
        }

        if user_message.contains("想") || user_message.contains("要") || user_message.contains("打算") || user_message.contains("目标") {
            extracted.push(VectorMemory {
                id: String::new(),
                content: user_message.to_string(),
                memory_type: "goal".into(),
                source: "conversation".into(),
                importance: 0.7,
                created_at: now.clone(),
                last_accessed: now.clone(),
                access_count: 0,
                embedding: None,
                related_ids: Vec::new(),
                decay_rate: 0.2,
                metadata: HashMap::new(),
            });
        }

        if user_message.chars().count() > 20 && extracted.is_empty() {
            extracted.push(VectorMemory {
                id: String::new(),
                content: user_message.to_string(),
                memory_type: "observation".into(),
                source: "conversation".into(),
                importance: 0.3,
                created_at: now.clone(),
                last_accessed: now.clone(),
                access_count: 0,
                embedding: None,
                related_ids: Vec::new(),
                decay_rate: 0.3,
                metadata: HashMap::new(),
            });
        }

        extracted
    }

    pub fn get_by_type(&self, memory_type: &str) -> Vec<VectorMemory> {
        let memories = self.memories.lock().unwrap();
        memories.iter().filter(|m| m.memory_type == memory_type).cloned().collect()
    }

    pub fn get_important(&self, threshold: f64) -> Vec<VectorMemory> {
        let memories = self.memories.lock().unwrap();
        memories.iter().filter(|m| m.importance >= threshold).cloned().collect()
    }

    pub fn decay(&self, days_threshold: i64) -> usize {
        let mut memories = self.memories.lock().unwrap();
        let cutoff = chrono::Local::now() - chrono::Duration::days(days_threshold);
        let before = memories.len();
        memories.retain(|m| {
            if m.importance > 0.7 {
                return true;
            }
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&m.created_at, "%Y-%m-%d %H:%M:%S") {
                let date = chrono::NaiveDate::from_ymd_opt(dt.year(), dt.month(), dt.day()).unwrap_or_default();
                date > cutoff.date_naive()
            } else {
                true
            }
        });
        before - memories.len()
    }

    pub fn build_context(&self, query: &str, max_memories: usize) -> String {
        let relevant = self.search(query, max_memories);
        if relevant.is_empty() {
            return String::new();
        }
        let mut lines = Vec::new();
        lines.push("\n\n== 相关记忆 ==".to_string());
        for m in &relevant {
            let type_label = match m.memory_type.as_str() {
                "fact" => "事实",
                "preference" => "偏好",
                "pattern" => "模式",
                "event" => "事件",
                "goal" => "目标",
                "observation" => "观察",
                _ => &m.memory_type,
            };
            lines.push(format!("[{}] {}（重要度：{:.1}）", type_label, m.content, m.importance));
        }
        lines.join("\n")
    }
}

fn auto_classify(content: &str) -> String {
    if content.contains("喜欢") || content.contains("不喜欢") || content.contains("爱")
        || content.contains("讨厌") || content.contains("prefer") || content.contains("like")
        || content.contains("hate") || content.contains("love")
    {
        "preference".into()
    } else if content.contains("经常") || content.contains("总是") || content.contains("习惯")
        || content.contains("每次") || content.contains("usually") || content.contains("always")
    {
        "pattern".into()
    } else if content.contains("昨天") || content.contains("今天") || content.contains("明天")
        || content.contains("去了") || content.contains("yesterday") || content.contains("today")
        || content.contains("将来") || content.contains("过去")
    {
        "event".into()
    } else if content.contains("想") || content.contains("要") || content.contains("目标")
        || content.contains("计划") || content.contains("打算") || content.contains("want")
        || content.contains("goal") || content.contains("plan") || content.contains("aim")
    {
        "goal".into()
    } else if content.contains("是") || content.contains("叫") || content.contains("在")
        || content.contains("有") || content.contains("is") || content.contains("am")
        || content.contains("are") || content.contains("was")
    {
        "fact".into()
    } else {
        "observation".into()
    }
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current_word = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' || ch == '-' {
            current_word.push(ch);
        } else {
            if !current_word.is_empty() {
                tokens.push(current_word.clone());
                current_word.clear();
            }
            if ch as u32 > 0x4E00 && (ch as u32) < 0x9FFF {
                tokens.push(ch.to_string());
            }
        }
    }
    if !current_word.is_empty() {
        tokens.push(current_word);
    }
    tokens
}

fn compute_embedding(text: &str) -> Vec<f32> {
    let tokens = tokenize(text);
    let mut freq: HashMap<String, f32> = HashMap::new();
    for t in &tokens {
        *freq.entry(t.clone()).or_insert(0.0) += 1.0;
    }
    let max_freq = freq.values().cloned().fold(0.0f32, f32::max);
    let mut sorted: Vec<(String, f32)> = freq.into_iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut embedding: Vec<f32> = sorted.iter().take(128).map(|(_, count)| {
        if max_freq > 0.0 { count / max_freq } else { 0.0 }
    }).collect();
    while embedding.len() < 128 {
        embedding.push(0.0);
    }
    embedding
}
