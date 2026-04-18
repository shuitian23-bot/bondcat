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

## iter 10 (v0.3.16) — 2026-04-18
- 武器挥砍动画: 按 state.weapon 取对应 PNG (sword/hammer/wand)
- 攻击期间 translate+rotate 画出武器,角度随 attackArc 进度从 -126° → +72°
- 白色弧形 slash trail 半透明描边
- 替换原来纯描边圆弧

## iter 11 (v0.3.17) — 2026-04-18
- 技能树系统: 3系被动 max lv10
- ⚔️ 攻击: 每级 +10% 伤害 (乘到 playerAttack dmg 计算)
- ❤️ 体力: 每级 +20 最大HP,购买立即补血
- 💰 贪婪: 每级 +10% 宝箱金币 (乘到 killMonster chest gold)
- 成本公式: 50 * (lv+1)² — 1级50,2级200,3级450...10级5500
- HUD: 标题栏加 🌟 按钮打开技能面板

## iter 12 (v0.3.18) — 2026-04-18
- 粒子系统升级: 支持 gravity/drag/size/glow
- 普通击杀: 14 粒子,重力+阻尼,自然下落
- BOSS 击杀: 40 金色发光粒子大爆炸,屏幕弹 "💥 BOSS 已斩!"
- 一键开箱: 金粉爆发从猫身上冲向天空,箱数越多粒子越多(max 60)

## iter 13 (v0.3.19) — 2026-04-18
- 成就系统: 10 个成就 (首杀/屠戮者/巨贾/大师/连击手/屠龙者等)
- 解锁: 🏆 toast + 金币奖励 + 30金色粒子爆发
- state 加 bossKills/maxCombo/achievements[] 追踪
- checkAchievements() 每秒轮询
- HUD: 🏆 按钮打开成就面板,显示 ✅/🔒 状态

## iter 14 (v0.3.20) — 2026-04-18
- 昼夜循环: new Date() 取系统时钟,12点白天/0点夜晚,过渡基于 distFromNoon
- nightF 因子 0-1 驱动:
  - 星空透明度 (白天隐藏)
  - 月亮 (夜晚,带 crescent 切月+光晕)
  - 太阳 (白天,自转光线)
- 过渡期 (早晚 6-9 点) 日月都半透明

## iter 15 (v0.3.21) — 2026-04-18
- 暴击系统: 5% 基础+每点幸运+2%,2倍伤害
- 新技能: 🍀 幸运 (max lv10 = 25% 暴击率)
- 暴击视觉: 橘色 CRIT- 文字 + 10 橘色发光粒子爆发

## iter 16 (v0.3.22) — 2026-04-18
- 天气系统: clear/rain/snow 三态随机切换
- 周期 20-60s 一变,权重 60% 晴 / 25% 雨 / 15% 雪
- 雨: 蓝色斜线 380 速度垂直+40 斜风
- 雪: 白色2x2 方块,x 速度正弦抖动制造飘落感
- 击地销毁,ambient 效果不影响游戏逻辑
## iter 17 (v0.3.23) — 2026-04-18
- 精英怪: 10% 概率非 BOSS 怪变精英,2x HP,3x 金币
- 视觉: 金色呼吸光效覆盖 (sin 波动)
- 生成时弹 "✨ 精英怪!" 提示
- 磁吸加强: 宝箱向猫飞速度受 luck 技能加成 (每点+0.5)
## iter 18 (v0.3.24) — 2026-04-18
- XP 进度条: 标题栏底部 2px 渐变条 (橙→浅橙),实时显示升级进度
- 伤害文字分级: 15px (LEVEL/BOSS/COMBO),14px (CRIT/🏆),11px 普通
- 文字阴影: 黑色 blur(3) 提升可读性
- Modal 样式: 圆角+橙光阴影,自定义细滚动条,标题底横线
## iter 19 (v0.3.25) — 2026-04-18
- SAVE_KEY bondcat_v3 → bondcat_v4,旧存档隔离避免 schema 冲突
- Balance: 赤龙王 HP 50→120,XP 50→100,金币 100-300 → 250-600
- Balance: 宝箱掉率 80%→70% 减少画面密度
- resetData 重置 weather+combo 状态
- 脚本语法校验通过 (833 行)
