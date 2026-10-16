# 人生模拟器（DSH Tavern 插件）

一个「自己写、自己跑」的人生模拟：填好世界观与主角，插件替你生成每轮正文与 8 条行动路线，并在后台结算全部变量。

## 它是两部分，缺一不可

| 部分 | 作用 |
|---|---|
| `dsh-tavern-simulator/` | 插件本体：整个界面、开局流程、每轮正文、变量结算、行动选项规则 |
| `cards/人生模拟器.json` | 载体卡：提供 gameId（Tavern 用哪一局存状态）＋ 内置世界书里的写作参考资料 |

**卡里不含逻辑，只装卡是没用的。**

## 安装

1. `dsh-tavern-simulator/` 整个文件夹 → Tavern 数据目录的 `plugins/` 下
2. `cards/人生模拟器.json` → `resources/cards/`（或在 Tavern 界面里导入）
3. 重启 DSH
4. 在 Tavern 里选这张卡新开一局 → 进入插件界面 → 填世界观与主角 → 点「进入正文 →」
5. 模型自己配：插件「设定」页里填 BaseURL / API Key / 模型（还有检索、结算、总结三个可选的便宜模型槽位）

## 更新

    git pull
    重启 DSH

插件与卡在同一个 commit 里，两边版本永远对得上。

## 插件界面

七个页签：正文 / 主角 / 角色 / 资产 / 世界观 / 卡片 / 设定。

「设定」页里可以调界面字体与字号（字体统一，字号分 7 档、可整体调也可分区微调），以及提示音。

## 数据存在哪

插件把数据写在 Tavern 数据目录下：

    workspace/simulator-session-*.json     每局一份存档
    workspace/simulator-presets.json       跨局共用的预设
    workspace/simulator-settings.json      跨局共用的设置（不含密钥）

路径由插件自动推导（从插件自身位置往上找），不用手改。密钥存在 DSH 的凭据服务里，不落文件。

## 已知限制

- **存档不随卡走**：状态写在上面的 workspace 里，所以导出或分叉这张卡不会带上进度
- **要自己配模型**：插件通过 Tavern 调模型，密钥由使用者自己填
- 需要 DSH Tavern（用的是它的插件接口）
