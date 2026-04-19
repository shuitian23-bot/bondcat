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
## iter 20 (v0.4.0) — 2026-04-18 — 大版本发布
**minor bump** (新功能集合):
- 13 张混元 AI 生成 PNG 素材全替换原字符串像素
- 5 种怪 (史莱姆/蝙蝠/骷髅/哥布林/赤龙王BOSS) + 精英变种
- 4 系技能树 (攻击/体力/贪婪/幸运)
- 10 个成就+金币奖励
- combo 连击 4阶加成 (x1.5/2/3/4)
- 暴击 5%基础+幸运叠加,2x 伤害
- 粒子系统 (重力/阻尼/发光/尺寸)
- 昼夜循环 (系统时钟,月亮/太阳)
- 天气 (晴/雨/雪)
- 武器挥砍 PNG 旋转动画
- UI: XP 进度条,伤害文字分级,modal 橙光
## hotfix v0.4.1 — 2026-04-18
- 13 张 PNG 后处理去白底 (PIL threshold 230 + 15px 羽化)
- 挥砍动画收窄: 弧度 0.8π (原 1.1π),武器缩小 28→22,trail 半径 18
- 标题栏加回 🎯 输入计数诊断

## v0.4.5 — 2026-04-18 — 核心机制打通庆祝版
- 权限配齐: Accessibility + Input Monitoring 都需独立授权
- 移除 stats 行诊断 (🟢⌨N🖱M),改回纯游戏 HUD
- 权限心得已存 memory
## v0.4.7 iter 1/5 — 装备系统 schema 重构

- SAVE_KEY v4→v5,旧存档隔离
- state.equipment (head/body/weapon/accessory 4 槽)
- state.inventory 列表
- GEAR_BASES 每槽 3 基础件
- AFFIX_POOL 5 词缀 (暴击/攻/HP/吸血/金币)
- RARITY 5 品质 (普通/精良/稀有/史诗/传说)
- genItem() 按槽 + 品质随机生成+词缀
- itemTotalDmg/Hp 累加升级倍率 + 词缀
- sumEquipStat() 聚合四槽
- playerAttack dmg 取装备武器,暴击取装备+技能
- recomputeMaxHp() 动态计算 = 基础 + 等级 + 体力 + 装备
## v0.4.8 iter 2/5 — 装备掉落 + 词缀生效

- killMonster 22% 基础掉率,精英 50%,BOSS 100%
- 品质权重按 state.level 动态: 低级多普通,高级多史诗/传说
- BOSS 专属高稀有权重 [1,2,3,5,8]
- 掉落飘字按品质颜色 (灰/绿/蓝/紫/橙)
- 吸血词缀: 攻击命中回血 (+heal 绿飘字)
- 金币词缀: 宝箱拾取时 +N% 金币
## v0.4.9 iter 3/5 — 装备操作函数

- equipItem(id) / unequipItem(slot): 背包↔装备槽切换
- upgradeItem(id): 金币升级,cost=40*(lv+1)²*(1+rarity*0.3)
- sellItem(id): 卖装备,price=15*(1+rarity)^1.3*(1+lv*0.5)
- findItemById: 跨装备/背包查找
- itemStatSummary: 生成显示字符串
- 装备操作后 recomputeMaxHp 同步 HP
## v0.4.10 iter 4/5 — 装备管理 UI

- 📦 背包面板重做为装备管理中心
- 顶部 4 槽横排,点击槽位卸下
- 中间: 宝箱快开 (还有存货时显示)
- 下方: 背包物品列表,按品质降序
- 每件物品: 装备 / 升级(带成本) / 卖(带价格) 三按钮
- 品质色 border-left 条高亮
- 词缀摘要显示在物品下方
- 操作后自动刷新面板
## v0.5.0 iter 5/5 — 装备系统大版本发布

5轮迭代集合,参考 Tap Tap Loot 做出核心 RPG 机制:
- 4 槽位 (头/身/武器/饰品)
- 5 品质 (普通/精良/稀有/史诗/传说),带色
- 5 词缀 (+暴击/+攻/+HP/+吸血/+金币)
- 装备掉落 22% 基础/精英50%/BOSS100%,品质权重按等级
- 装备升级: 金币花费,upgradeLevel 提基础值+20%
- 装备出售: 20%折价回收
- 装备UI: 4槽横排+物品列表+装/升/卖按钮
- 吸血词缀实时回血,金币词缀提升拾取
- recomputeMaxHp() 动态计算加成

## v0.5.3 — 2026-04-19
- **修复 boss 黑底**: dragon_boss.png 原本是黑色实底（RGBA 但 alpha 全 1），其他怪物都是透明底
- 修法: Python PIL 从四角 BFS flood fill，把连通的近黑像素 (R+G+B<60) alpha 设为 0
- 105998 / 262144 像素被去掉（外围背景），dragon 主体 + 火焰保留
- 备份原图后覆盖（备份已 rm 不入库）
- bump version 0.5.2 → 0.5.3 (package.json + Cargo.toml + tauri.conf.json)
- CI 触发 build.yml，等 macOS aarch64 DMG artifact

## v0.5.4 — 2026-04-19
- **修 boss 同屏多只**: spawnMonster 加判断, 若已存在 boss 且抽到 boss, 重抽一次仍是 boss 则降级为当前等级最高阶普通怪
- **修版本号漂移**: 标题栏 + window.title 硬编码 v0.5.2 的问题, 改为启动时从 Tauri window.__TAURI__.app.getVersion() 动态注入, 再不会版本不同步

## v0.5.5 — 2026-04-19
- **多 BOSS 上线 (合并原计划 iter 1+2)**: 新增 3 个 boss
  - 骸骨王 skeletonKing (minLv 15, HP 240, 金币 400-800, xp 150)
  - 影刺客 shadowBlade (minLv 20, HP 160, 金币 500-1000, xp 180)
  - 元素巫妖 elementalLich (minLv 25, HP 320, 金币 700-1400, xp 250)
- 素材流程: DashScope wanx2.1-t2i-turbo 生成 + Python flood fill (dark/light 自适应) + rembg (lich 蓝底用 u2net 模型)
- IMG_SOURCES + MONSTER_TYPES + MONSTER_PARTICLE_COLOR 三处同步扩展
- AI 差异化 / 章节系统 留待 v0.5.6 / v0.6.0

## v0.5.6 — 2026-04-19
- **BOSS AI 差异化**
  - 骸骨王 skeletonKing: speed 30 (最快), atkCd 2s, 伤害中等 (8+lv*0.7)
  - 影刺客 shadowBlade: speed 22, **30% 闪避** 玩家攻击 (MISS 浮字), atkCd 1.2s (最快), 伤害较低 (6+lv*0.6)
  - 元素巫妖 elementalLich: speed 8 (最慢), **远程攻击 x<=350 就能打猫**, atkCd 3s, 伤害最高 (16+lv*1.0)
- 其他怪保持原 atkRange 130 / atkCd 2 不变
- monster 实体加 dodgeTimer 字段备用

## v0.6.0 — 2026-04-19
- **章节系统上线**
- 5 章主题循环 (每 10 级 1 章): 翠绿草原 / 炽热沙漠 / 凛冬雪原 / 熔岩地狱 / 暗影秘境
- currentChapter() 由 state.level 动态算
- 渲染: 天空 fillRect overlay + 地面 multiply 着色 (草原无 overlay 保持原色)
- 顶栏 stats 加 [章节名] 前缀
- 章节 boss 必现机制留待 v0.6.1

## v0.6.1 — 2026-04-19
- **章节 boss 必现 + 必掉紫装**
- state.chapterBossPending 标记位; 升 10/20/30/... 级时 set 1
- 下一次 spawnMonster 强制选当前可用最高阶 boss, 弹★ 章节 BOSS 降临! 金字提示
- chapter boss 击杀掉装备 weights = [0,0,0,5,8] (只出史诗+传说)
- 普通 boss 仍按原概率 [1,2,3,5,8]
- defaultState/loadState 都补 chapterBossPending 默认 0 兼容旧存档

## v0.6.5 — 2026-04-19
- **职业系统上线**
- 3 职业: 战士 +20%HP / 法师 +20%暴击伤害 / 刺客 +30%暴击率
- state.classId 字段, 首次进入弹窗 3 选 1 不可关
- HP 基础公式带 hpMult 系数
- 暴击率叠加 critRateAdd, 暴击伤害基础 ×2 再乘 critDmgMult
- 选完弹选择 X 浮字提示
- 旧存档兼容 (loadState 默认 classId=null 触发首次选择)
- ⚠️ 中途 Python 写文件失败把 index.html 写空, git checkout 恢复后重跑 patch

## v0.6.6 — 2026-04-19
- **职业专属被动**
- 战士: 受击时 20% 概率格挡 (BLOCK 浮字, 完全免伤)
- 法师: 自身暴击时给目标 frozenTimer=1.5s, 减速 ×0.5 (FROZEN 浮字, 蓝色)
- 刺客: comboCount >= 5 时暴击率 ×2
- monster 加 frozenTimer 字段, update loop 应用 speedMult

## v0.6.7 — 2026-04-19
- **皮肤系统 (渲染接入)**
- 素材: cat_knight / cat_mage / cat_rogue 三张 DashScope 生成, flood fill + rembg 兜底抠背景
- IMG_SOURCES 加 catKnight/catMage/catRogue 三 key
- OUTFITS 数组重构: 每项含 name/cost/img/color/bonus
- 渲染: 猫贴图按 state.outfit 查 OUTFITS[state.outfit].img
- 商店 UI 留待 v0.6.8
- defaultState outfitOwned 扩成 4 项; loadState 兼容旧存档

## v0.6.8 — 2026-04-19
- **皮肤商店 UI + 皮肤加成生效**
- 商店面板重做: 左边 28×28 皮肤小图预览 + 品质色 border + 加成描述
- 金币不足时按钮变灰
- applyOutfitBonus(): 切换皮肤后重算 catMaxHp (含职业+技能+皮肤 hpMult)
- 暴击率/暴击伤害叠加皮肤 bonus (catRogue +3% 暴击率 / catMage +5% 暴击伤害 / catKnight +5% HP)
- 购买成功自动穿上

## v0.7.0 — 2026-04-19
- **装备合成 + 重铸**
- 合成: 3 件同槽同品质 -> 1 件品质+1 (genItem 重新 roll, 最高传说)
- 重铸: 花金币重新 roll 词缀, 成本 200 * (rarity+1)^2, 普通装备无词缀不可重铸
- 背包面板顶部聚合显示可合成组, 金色 ⚗ 按钮触发
- 装备项新增 ♻ 重铸按钮 (绿色, 成本显示)
- 原 upgrade/sell/equip 按钮保留

## v0.7.1 — 2026-04-19
- **宠物系统**
- 5 种宠物: 小史莱姆 / 小蝙蝠 / 小骷髅 / 小哥布林 / 小赤龙 (复用现有怪物图)
- 蛋掉落: 普通怪 5%, boss 20%
- 孵化: 按等级权重抽宠物, 级高赤龙概率高
- 宠物加成: atkBonus (2-12), critBonus (0-5%) 全局叠加到 playerAttack
- 背包面板顶部显示宠物区 + 孵化按钮
- 渲染: 猫身后 tiny 16×16 排开, 最多 5 只显示

## v0.7.2 — 2026-04-19 (loop 终点)
- **转生系统** (loop 计划最后一项)
- Lv 50+ 可转生, 重置 level/xp/equipment/inventory/pets, 保留 50% 金币 + 职业 + 皮肤
- 灵魂点 = floor(level / 10) + prestigeCount * 2 (转生奖励)
- 4 种永久 buff (花灵魂点购买, 每条最高 10 级):
  - 初始攻击 (1魂/级 +1 攻)
  - 金币倍率 (1魂/级 +5%)
  - 初始暴击 (2魂/级 +1%)
  - 初始HP (1魂/级 +20)
- 转生殿堂面板 (★ 按钮新加在顶栏)
- buff 应用: playerAttack base + critChance + greedBuff + applyPrestigeStart()
