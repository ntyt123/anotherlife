import {BASIC_WEAR_KEYS} from '../lib/data-integrity.mjs';
import {CREATION_WEAR_KEYS} from '../lib/creation-wardrobe.mjs';
export function ordinaryWear(actor){const female=String(actor?.性别||'').includes('女'),keys=female?CREATION_WEAR_KEYS:BASIC_WEAR_KEYS;return Object.fromEntries(keys.map(k=>{const filled=k==='上衣'||female&&['内衣','内裤'].includes(k);return[k,{物品:k==='上衣'?'日常上衣':filled?k==='内衣'?'棉质贴身背心':'日常棉质内裤':'',稀有度:filled?'N':'',状态:'',简介:filled?'平时轮换穿用的普通衣物，保持干净整齐':''}];}));}
export function fillOrdinaryCreation(s){s.protagonist.穿着=ordinaryWear(s.protagonist);for(const n of s.npcs||[]){n.穿着=ordinaryWear(n);n.表性格=n.表性格||'待人平和有礼，交流时愿意耐心倾听';n.里性格=n.里性格||'重视承诺与生活稳定，遇事会先考虑家人的需要';n.背景=n.背景||'在普通家庭环境中成长，后来在日常生活中与主角相识，已有身份和关系保持不变。';}return s;}
