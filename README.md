# anotherlife —— 人生模拟器（DSH Tavern 插件）

一个「自己写、自己跑」的人生模拟：填好世界观与主角，插件替你生成每轮正文与 8 条行动路线，并在后台结算全部变量。

## 它是两部分，缺一不可

| 部分 | 作用 |
|---|---|
| `anotherlife/` | 插件本体：整个界面、开局流程、每轮正文、变量结算、行动选项规则 |
| `cards/人生模拟器.json` | 载体卡：提供 gameId（Tavern 用哪一局存状态）＋ 内置世界书里的写作参考资料 |

**卡里不含逻辑，只装卡是没用的。**

## 安装

1. `anotherlife/` 整个文件夹 → Tavern 数据目录的 `plugins/` 下
2. `cards/人生模拟器.json` → `resources/cards/`（或在 Tavern 界面里导入）

> 仓库里这份是**标准 `chara_card_v3`**，可以直接导入。
> 导入后新开一局时 Tavern 会提示「人物卡没有开场白，将从空白场景开始」—— **忽略即可，这是正常的**：
> 这张卡只是插件载体，正文由插件自己生成，不靠 Tavern 的开场白。
> 照常点「开始新游戏」，然后在输入框上方点「🎭 模拟器」（或右侧栏「＋」里的「模拟器」）进插件界面。
>
> ⚠️ 别用「卡片工作台」里导出的那份 —— 它是工作台中间格式（外面套了一层 `kind/version/raw/meta`），
> Tavern 读不出开场白。要用就先把 `raw` 那段单独存成文件。

3. 重启 DSH
4. 在 Tavern 里选这张卡新开一局 → 进入插件界面 → 填世界观与主角 → 点「进入正文 →」
5. 模型自己配：插件「设定」页里填 BaseURL / API Key / 模型（还有检索、结算、总结三个可选的便宜模型槽位）

## 更新

插件界面「设定」页最下面有「更新与提交」：

    检查更新      看远端有没有新版本（列出了哪些提交）
    更新到最新    把插件与卡对齐到远端；本地未提交的改动会丢弃（有二次确认）
    提交并上传    把本地的插件与卡提交到远端 —— 给改过代码的人用

改完之后：宿主侧代码（`index.mjs`）要**重启 DSH**；只改界面（`client.js`）重开面板就够。

## 部署到服务器（给一起玩的人）

把它放在云服务器上、用手机浏览器玩的话，第一次要准备三件事：

**1. 克隆到一个稳定的目录**（别放在 Tavern 的 `plugins/` 里面）

    git clone https://github.com/ntyt123/anotherlife.git /opt/anotherlife

**2. 配拉取凭据** —— 私有仓库必须做，否则「更新」会报 Authentication failed

> **Deploy Key（推荐，只读，最安全）**
> ```
> ssh-keygen -t ed25519 -f ~/.ssh/anotherlife -N ''
> ```
> 把 `~/.ssh/anotherlife.pub` 的内容加到 GitHub 仓库的
> Settings → Deploy keys（**不要**勾 Allow write access），
> 再让 github.com 走这个 key（写进 `~/.ssh/config`）：
> ```
> Host github.com
>   IdentityFile ~/.ssh/anotherlife
> ```

> **Personal Access Token（备选）**
> ```
> git config --global credential.helper store
> ```
> 第一次 pull 时输用户名 + token，之后会记住。

**3. 在插件里指认仓库目录**

「设定」页 →「更新与提交」→ 把「仓库目录」填成第 1 步那个路径 → 点「记住」。

之后每次更新就是：**点[检查更新] → 点[更新到最新] → 重启 DSH**。

## 插件界面

七个页签：正文 / 主角 / 角色 / 资产 / 世界观 / 卡片 / 设定。

「设定」页里可以调界面字体与字号（字体统一；字号分 7 档，可整体调也可按区域微调），以及提示音、模型槽位、更新与提交。

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