// Tavern 自动生成，请勿修改：插件加载或启动出错时只记日志，不影响 DSH 启动。
const report = (stage, error) => console.warn("[Tavern 插件] plugins/dsh-tavern-simulator" + ' ' + stage + '失败：' + (error && error.stack || error))
let plugin = null
try {
  const mod = await import(new URL("./index.mjs", import.meta.url).href)
  const value = typeof mod.apply === 'function' ? mod : mod.default
  plugin = typeof value === 'function' ? { apply: value } : value && typeof value.apply === 'function' ? value : null
  if (!plugin) report('加载', new Error('入口没有导出 apply 函数'))
} catch (error) { report('加载', error) }
export const name = plugin && typeof plugin.name === 'string' && plugin.name ? plugin.name : "dsh-tavern-simulator"
export const inject = plugin ? plugin.inject : undefined
export const Config = plugin ? plugin.Config : undefined
export function apply(ctx, config) {
  if (!plugin) return
  try {
    const result = plugin.apply(ctx, config)
    return result && typeof result.then === 'function' ? result.catch(error => report('启动', error)) : result
  } catch (error) { report('启动', error) }
}
