---
target: 手机端回收站页面
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-22T13-06-32Z
slug: apps-web-src-pages-trash-tsx
---
# 回收站手机端设计审查

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | 加载、禁用与成功反馈完整，但未提示表格还有大量隐藏列 |
| 2 | Match System / Real World | 3 | 文案清楚，信息顺序仍偏桌面数据表 |
| 3 | User Control and Freedom | 3 | 支持恢复、搜索和批量操作，移动端操作路径不够顺手 |
| 4 | Consistency and Standards | 2 | 手机端仍使用横向滚动桌面表格，不符合移动列表习惯 |
| 5 | Error Prevention | 4 | 永久删除有确认，未选择时相关操作禁用 |
| 6 | Recognition Rather Than Recall | 2 | 仅 38% 表格宽度可见，用户需拖动才能发现金额、分类等信息 |
| 7 | Flexibility and Efficiency | 2 | 有搜索和批量选择，但手机端批量工作流低效 |
| 8 | Aesthetic and Minimalist Design | 2 | 大卡片、常驻禁用按钮和分页留白削弱信息密度 |
| 9 | Error Recovery | 3 | 支持恢复且错误会反馈，但恢复入口离记录本身较远 |
| 10 | Help and Documentation | 2 | 保留期限解释清楚，但没有横向滚动或选择操作提示 |
| **Total** |  | **26/40** | **Acceptable，需移动端重构** |

## Design Specificity Verdict

整体色彩、圆角和字体与轻账一致，但回收站主体仍是通用后台表格。`TRASH · 回收站` 的装饰标签没有弥补移动端交互缺少针对性的问题。自动扫描未发现结构类反模式；主要问题来自真实布局尺寸，而非静态代码规则。

## Overall Impression

页面能完成任务，也对永久删除做了充分保护；但在手机上，用户第一眼看到的是禁用按钮和被截断的表格，而不是“这笔账是什么、多少钱、何时会被清理”。最大机会是把手机端改为记录卡片列表。

## What's Working

- 永久删除前有明确确认，风险控制到位。
- “恢复所选 / 彻底删除 / 清空回收站”用词直白，禁用状态明确。
- 30 天自动清理规则在操作前可见，减少误解。

## Priority Issues

### [P1] 桌面表格被直接塞进手机内容区

**Why it matters:** 800px 表格只有约 306px 可见，494px 内容隐藏，金额、分类和清理日期不能一眼看到。

**Fix:** 手机端改成卡片列表：首行项目与金额，次行日期、分类、删除时间和到期时间；点击卡片或复选框进入选择态。桌面端保留表格。

**Suggested command:** `$impeccable adapt`

### [P1] 批量操作在未选择时持续占据首屏

**Why it matters:** 两个灰色禁用按钮比账目记录更早出现，清空回收站又成为最醒目的按钮，行动层级倒置。

**Fix:** 默认只保留低强调的“清空回收站”；选择记录后，再显示包含数量的批量操作栏，并把“恢复”设为主操作。

**Suggested command:** `$impeccable distill`

### [P2] 搜索、计数和分页占用空间过多

**Why it matters:** 只有一笔记录时仍显示完整分页，卡片下方留下大片空白，降低信息密度。

**Fix:** 搜索框与数量放在同一紧凑工具栏；一页内数据不显示分页；列表容器去掉不必要的固定感和空白。

**Suggested command:** `$impeccable layout`

### [P2] 内容末端贴近固定底栏

**Why it matters:** 当前卡片底部与导航发生约 7px 的视觉重叠，分页和最后一项容易显得被底栏压住。

**Fix:** 按底栏高度与安全区增加稳定的内容尾部留白，并让移动列表的最后一项完全滚出底栏上方。

**Suggested command:** `$impeccable adapt`

## Persona Red Flags

- **Casey（单手手机用户）:** 必须横向拖动才能了解一笔账，关键恢复操作又在页面上方，拇指操作成本高。
- **Alex（高效用户）:** 批量能力存在，但选择与操作距离远；一笔数据仍显示分页，增加无效视觉扫描。
- **Sam（辅助功能用户）:** 横向表格让放大和线性阅读更困难，隐藏列也缺少明确提示。

## Minor Observations

- `TRASH · 回收站` 与下方中文标题信息重复，可在手机端移除。
- 手机端卡片内边距可以收紧，页面会更像操作工具而非介绍页。
- 单条记录应直接提供上下文，而不是只露出删除时间、日期和项目三列。

## Questions to Consider

- 回收站的首要任务是快速恢复，还是批量清理？当前视觉更偏向后者。
- 用户是否真的需要在手机上看到完整六列，还是应该优先展示项目、金额与到期时间？
- 一页不足 20 条时，分页是否应该完全消失？
