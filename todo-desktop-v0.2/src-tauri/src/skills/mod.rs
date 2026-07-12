pub mod init;
pub mod evening;
pub mod morning;
pub mod board;
pub mod report;

use crate::models::SkillResponse;
use serde_json::Value;

pub fn process_skill(skill_name: &str, form_data: &Value) -> Result<SkillResponse, String> {
    match skill_name {
        "init" => init::process_init_form(form_data),
        "evening" => evening::process_evening_form(form_data),
        "morning" => morning::process_morning_form(form_data),
        "report" => report::process_report_form(form_data),
        _ => Err(format!("未知 skill: {}", skill_name)),
    }
}
