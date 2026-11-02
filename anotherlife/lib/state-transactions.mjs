import { createSerialQueue } from './runtime-core.mjs';

// 跨文件提交使用可恢复日志：单个文件原子写，进程退出后仍可判定提交点。
export function createAuxiliaryTransactions({ readJson, writeJson, statePath, readExtras, writeExtras, warn = async () => {} }) {
  const serial = createSerialQueue();
  const journalPath = (gameId) => statePath(gameId) + '.txn.json';
  async function clear(gameId) {
    try { await writeJson(journalPath(gameId), null); }
    catch (error) { try { await warn('事务已完成，清理记录失败：' + String(error.message || error)); } catch {} }
  }
  return {
    path: journalPath,
    recover(gameId) {
      return serial(String(gameId), async () => {
        const journal = await readJson(journalPath(gameId));
        if (!journal) return;
        if (journal._type !== 'anotherlife-transaction' || !Number.isFinite(Number(journal.nextRevision)) || !journal.previousExtras || typeof journal.previousExtras !== 'object') throw new Error('存档事务记录损坏，未覆盖现有数据');
        let main = null;
        try { main = await readJson(statePath(gameId)); } catch { /* 主档损坏交给 loadState 的备份恢复 */ }
        if (!main || Number(main._revision) !== Number(journal.nextRevision)) await writeExtras(gameId, journal.previousExtras);
        await clear(gameId);
      });
    },
    commit(gameId, state, extras, writeMain) {
      return serial(String(gameId), async () => {
        if (!extras) return writeMain();
        const previousExtras = await readExtras(gameId);
        await writeJson(journalPath(gameId), { _type: 'anotherlife-transaction', _v: 1, nextRevision: state._revision, previousExtras });
        try {
          await writeExtras(gameId, extras);
          await writeMain();
        } catch (error) {
          let current = null;
          try { current = await readJson(statePath(gameId)); } catch {}
          // 写入已提交但应答失败时，不能把新主档搭配旧关联文件。
          if (!current || Number(current._revision) !== Number(state._revision)) {
            try { await writeExtras(gameId, previousExtras); }
            catch (rollbackError) { throw new Error('保存失败且关联数据恢复失败，已保留事务日志：' + String(error.message || error) + '；' + String(rollbackError.message || rollbackError)); }
          }
          await clear(gameId);
          throw error;
        }
        await clear(gameId);
      });
    },
  };
}
