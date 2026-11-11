// 仅保存当前界面会话的展开选择；不写存档、不调用后台。
export function createViewFolds() {
  const choices = new Map();
  return function foldProps(gameId, name, defaultOpen = true) {
    const key = JSON.stringify([String(gameId ?? ''), String(name)]);
    return {
      open: choices.has(key) ? choices.get(key) : defaultOpen === true,
      onToggle(event) {
        const node = event?.currentTarget;
        if (!node || typeof node.open !== 'boolean') return;
        // 内层details的toggle不应覆盖外层的展开选择。
        if (event.target && event.target !== node) return;
        choices.set(key, node.open);
      },
    };
  };
}
