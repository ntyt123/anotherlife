# 1.3.77 提交前验证

本次提交记录上次 Git 提交以来累计的源码、模块拆分、构建脚本、测试及说明，不表示全量测试已经通过。未推送远端、未创建发布标签；没有纳入玩家存档、本地模型配置、运行日志或临时备份。

## 当前结果

- `npm run check`：通过。
- 已跟踪及最终暂存区的空白检查通过；仅清除generic-host.mjs两条代码空行中的尾随空格，保留原换行和业务逻辑。
- 本轮正文兼容及关联定向回归：63项通过，0失败、0跳过；使用模型桩、React桩和内存文件系统，不是真实模型或浏览器验收。
- 全量离线测试：81个测试文件，982项测试；938通过、32失败、12跳过，0取消。
- 真实样本/现场环境开关仅在测试子进程中清空；12项可选样本测试按原有条件跳过。未修改全局环境或真实存档，未调用付费模型。

不能把上述定向测试通过扩称为全量通过。以下失败尚未在本次“提交Git”任务中逐项定位，不断言它们全是旧测试过时、环境问题或与最新修改无关，也不为提交而放宽生产逻辑、删除测试或隐藏失败。

## 全量失败位置

下列行号对应本次待提交源码；每行是一项失败测试。

```text
tests/appearance.test.mjs:12
tests/creation-wardrobe.test.mjs:34
tests/creation-warnings.test.mjs:25
tests/generation.test.mjs:13
tests/generic-arithmetic.test.mjs:10
tests/generic-arithmetic.test.mjs:11
tests/generic-client.test.mjs:13
tests/generic-client.test.mjs:15
tests/generic-core.test.mjs:18
tests/generic-core.test.mjs:19
tests/generic-core.test.mjs:27
tests/generic-edge.test.mjs:12
tests/generic-edge.test.mjs:16
tests/generic-final.test.mjs:17
tests/generic-final.test.mjs:19
tests/generic-host.test.mjs:15
tests/generic-host.test.mjs:18
tests/generic-host.test.mjs:20
tests/generic-host.test.mjs:22
tests/generic-lifecycle.test.mjs:20
tests/initial-feed.test.mjs:13
tests/initial-feed.test.mjs:16
tests/initial-feed.test.mjs:17
tests/initial-feed.test.mjs:18
tests/initial-location.test.mjs:21
tests/initial-location.test.mjs:24
tests/wardrobe-repair.test.mjs:16
tests/wardrobe-repair.test.mjs:20
tests/wardrobe-repair.test.mjs:21
tests/wardrobe-warning.test.mjs:17
tests/world-news-opening.test.mjs:13
tests/world-news-opening.test.mjs:18
```

全量命令等价于 `node --experimental-vm-modules --test tests/*.test.mjs`；本次由父进程枚举全部 `.test.mjs` 后以继承标准输出方式运行，避免子进程管道限制，并仅在子进程移除可选真实样本环境开关。完整测试输出保存在本机临时目录，不纳入仓库。

## 最新修复范围

- 变量顶层/路径写法和中文容器归一化；不明归属保留诊断而非静默忽略。
- 拒绝诊断展示提交路径、拟写入值及原因，保留安全边界。
- 重算后重新校验已解决的房产/账务提示；读取状态可零模型调用纠正最新旧误报。
- 正文工具优先；缺少有效工具正文时采用同次可见普通全文，拆分笔记/正文/选项并继续原结算，不额外重发正文。

本次 Git 操作没有自动补写历史失败正文或其他历史游玩数据，也没有扩大为修复上述32项全量失败。
