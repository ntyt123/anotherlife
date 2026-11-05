export const WRITING_STYLE_FILE_LIMIT = 2 * 1024 * 1024;
export const WRITING_STYLE_GUIDE_LIMIT = 200000;
const byteSize = text => new TextEncoder().encode(text).byteLength;
const textValue = value => typeof value === 'string' ? value : '';
const fileStem = name => String(name || '').split(/[\\/]/).pop().replace(/\.(?:json|txt|md)$/i, '').trim() || '导入指导';
const guideBody = value => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('文风指导正文为空');
  if (value.length > WRITING_STYLE_GUIDE_LIMIT) throw new Error('指导超过20万字符，未截断导入；请确认选择的不是小说原文');
  if (value.includes('\u0000')) throw new Error('文件包含异常空字符，请检查文本编码');
  return value;
};
function portableEvidence(rows) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new Error('提炼依据必须是数组');
  if (rows.length > 128) throw new Error('提炼依据超过128项，未截断处理');
  return rows.map(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('提炼依据条目格式错误');
    return { dimension: textValue(r.dimension), claim: textValue(r.claim), quote: textValue(r.quote), scope: textValue(r.scope), kind: textValue(r.kind),
      startLine: Number.isSafeInteger(r.startLine) && r.startLine > 0 ? r.startLine : 0,
      endLine: Number.isSafeInteger(r.endLine) && r.endLine > 0 ? r.endLine : 0 };
  });
}

// 导出统一为UTF-8；导入兼容带BOM的UTF-8/UTF-16和旧GB18030文本。
export function decodeWritingStyleFile(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > WRITING_STYLE_FILE_LIMIT) throw new Error('指导文件超过2 MB，请确认选择的不是小说原文');
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch {
    if (encoding !== 'utf-8') throw new Error('文本编码错误，请另存为UTF-8后导入');
    try { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
    catch { throw new Error('无法识别文本编码，请另存为UTF-8后导入'); }
  }
}

export function parseWritingStyleFile(text, filename = '') {
  if (typeof text !== 'string') throw new Error('文风文件必须是文字');
  if (byteSize(text) > WRITING_STYLE_FILE_LIMIT) throw new Error('指导文件解码后超过2 MB，请确认选择的不是小说原文');
  const body = text.replace(/^\uFEFF/, '');
  const extension = String(filename).match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || '';
  if (extension && !['json', 'txt', 'md'].includes(extension)) throw new Error('请选择JSON、TXT或Markdown文风文件');
  const asJson = extension === 'json' || (!extension && /^[\s]*[{"]/.test(body));
  if (!asJson) return { name: fileStem(filename).slice(0, 100), guide: guideBody(body), evidence: [] };
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('JSON格式错误，未改变当前指导；纯文本请保存为TXT文件'); }
  if (typeof data === 'string') return { name: fileStem(filename).slice(0, 100), guide: guideBody(data), evidence: [] };
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON应为单份文风对象或正文字符串');
  if (data.type != null && data.type !== 'anotherlife-writing-style') throw new Error('不是文风指导文件');
  if (data.type === 'anotherlife-writing-style' && data.version != null && data.version !== 1) throw new Error('文风文件版本暂不支持');
  const guide = [data.guide, data.content, data.body, data.写作指导].find(value => typeof value === 'string');
  return { name: (textValue(data.name) || textValue(data.title) || fileStem(filename)).trim().slice(0, 100) || fileStem(filename).slice(0, 100), guide: guideBody(guide),
    evidence: portableEvidence(data.evidence).map(row => ({ ...row, verified: false, location: '', note: '导入资料，未由本机原文核验' })) };
}

export function serializeWritingStyleFile(draft, format = 'json') {
  if (!['json', 'txt'].includes(format)) throw new Error('请选择JSON或TXT格式');
  const guide = guideBody(draft?.guide);
  const name = textValue(draft?.name).trim() || '文风指导';
  let stem = [...name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '')].slice(0, 100).join('') || '文风指导';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = '_' + stem;
  const content = format === 'txt' ? '\uFEFF' + guide : JSON.stringify({ type: 'anotherlife-writing-style', version: 1, name, guide, evidence: portableEvidence(draft?.evidence) }, null, 2);
  if (byteSize(content) > WRITING_STYLE_FILE_LIMIT) throw new Error('导出资料超过2 MB，无法完整导回；请减少依据或导出TXT正文');
  return { filename: stem + '.' + format, content, mime: format === 'txt' ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8' };
}


export const WRITING_STYLE_SOURCE_LIMIT = 32 * 1024 * 1024;
export function decodeWritingStyleSourceFile(buffer, requested = 'auto') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > WRITING_STYLE_SOURCE_LIMIT) throw new Error('原文文件超过32 MB，请拆分后导入');
  let encoding = requested, text;
  if (!['auto', 'utf-8', 'gb18030'].includes(encoding)) throw new Error('文本编码选项无效');
  if (encoding === 'auto') {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
    else encoding = 'utf-8';
  }
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch {
    if (requested !== 'auto' || encoding !== 'utf-8') throw new Error('无法按所选编码解码，请选择自动识别或正确的文本编码');
    encoding = 'gb18030';
    try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { throw new Error('无法识别原文编码，请另存为UTF-8后导入'); }
  }
  if (!text.trim()) throw new Error('原文为空');
  if (text.includes('\u0000')) throw new Error('原文含异常空字符，请检查编码或文件类型');
  const savedBytes = byteSize(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (savedBytes > WRITING_STYLE_SOURCE_LIMIT) throw new Error('文件解码后按UTF-8保存约' + (savedBytes / 1048576).toFixed(1) + ' MB，超过32 MB原文上限，请拆分后导入');
  return { text, encoding: ({ 'utf-8': 'UTF-8', gb18030: 'GB18030／GBK', 'utf-16le': 'UTF-16LE', 'utf-16be': 'UTF-16BE' })[encoding] };
}
