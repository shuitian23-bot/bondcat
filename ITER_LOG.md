# BondCat 迭代日志

## iter 1 (v0.3.7) — 2026-04-18
- 建 src/assets/ 目录
- 跑通 DashScope wanx2.1-t2i-turbo 图生 pipeline
- 辅助脚本: _gen/genimg.sh (异步投稿+轮询+下载)
- 首个素材: cat.png (橙橘猫+小银剑,512x512)
- 暂未接入 HTML 渲染(后续迭代批量替换)

## iter 2 (v0.3.8) — 2026-04-18
- 并行生成 slime.png (绿色史莱姆) + bat.png (紫色蝙蝠)
- 并行调用节省时间 (两任务 <30s)

## iter 3 (v0.3.9) — 2026-04-18
- skull.png (漂浮骷髅+红眼)
- goblin.png (绿皮哥布林武士 48x48,将作为新 mini-boss)

## iter 4 (v0.3.10) — 2026-04-18
- chest_normal.png (木宝箱)
- chest_rare.png (蓝宝石宝箱)
- chest_epic.png (紫水晶史诗宝箱)

## iter 5 (v0.3.11) — 2026-04-18
- weapon_sword.png (木剑 DMG+1)
- weapon_hammer.png (铁锤 DMG+3)
- weapon_wand.png (魔杖 DMG+6)

## iter 6 (v0.3.12) — 2026-04-18
- ground.png (可平铺草地条)
- dragon_boss.png (红龙终极BOSS,64x64,用于后续boss战)
- 素材库已齐: 12个 PNG (猫/3怪/mini-boss/龙BOSS/3宝箱/3武器/地面)

## iter 7 (v0.3.13) — 2026-04-18
- **核心重构**: drawSprite (fillRect 字符数组) → drawImg (Image + drawImage)
- 新增 IMG 对象预加载 13 张素材
- MONSTER_TYPES 改 img 键引用,size 替代 sprite.length*scale
- 宝箱/猫/怪物全走 PNG 渲染
- 猫装扮色 via canvas composite source-atop 覆色
- 地面改 PNG tile 平铺
- flash 击中效果: source-atop 白色半透明覆盖

## iter 8 (v0.3.14) — 2026-04-18
- **Combo 系统**: 连击计数+2s窗口重置
- 阶梯加成: 5x=1.5倍,10x=2倍,20x=3倍,30x=4倍
- 视觉: 伤害数字颜色分层(白/青/金),里程碑弹 "COMBO x5!"
- HUD: 标题栏显示 🔥5x2 (连击数x倍数)
- 去掉诊断 🎯 计数,加 combo 显示

## iter 9 (v0.3.15) — 2026-04-18
- 怪物池扩到5种: 史莱姆/蝙蝠/骷髅/哥布林(lv6+)/赤龙王(lv10+BOSS)
- 权重 spawn: minLv 解锁+近期 tier 权重更高,BOSS 固定低权重(1)
- BOSS 标识: 慢速移动,生成时红字 "⚠ BOSS 来袭!" 警告
- BOSS 伤害缩放独立: 10 + lv*0.8 (普通怪 3 + type*2 + lv*0.5)
