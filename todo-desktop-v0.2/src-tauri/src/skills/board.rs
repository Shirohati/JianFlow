/// 目标板增强 prompt
/// 嵌入 tool_system_prompt 中，加强 AI 对目标板操作的理解
pub fn board_enhancement_prompt() -> String {
    r#"
=== 目标板操作增强说明 ===

目标板（看板）是您做长期规划的便签画布。便签之间可以通过连接线形成路线图。

操作建议：
- 用户说「帮我做二轮复习规划」→ 先用 board_read 查看现有便签，再用 note_create 创建新便签，最后 connection_create 建立连接
- 用户说「看看我的目标板」→ 用 board_read 读取所有便签和连接线
- 用户说「把这个便签和那个连起来」→ 先用 task_list 或 board_read 找到两个便签的 id，再用 connection_create

board_read 工具说明：
- 不需要参数
- 返回目标板上所有便签（grid_x/grid_y 不为空）和连接线
- 返回格式：{ notes: [...], connections: [...] }
"#.to_string()
}
