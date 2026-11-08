import { assertSafeValue } from './runtime-core.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const rows = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
export function quantity(value, label = '数量', allowZero = true) {
  const n = Number(value);
  if (value === '' || value == null || typeof value === 'boolean' || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > 1e12) throw new Error(label + '无效');
  const rounded=Math.round(n*1e6)/1e6;if(!allowZero&&rounded<=0)throw new Error(label+'低于计量精度');return rounded;
}
export function money(value) { const n = quantity(value, '金额'); const minor = Math.round(n * 100); if (!Number.isSafeInteger(minor)) throw new Error('金额超出可计算范围'); return minor / 100; }
const plus = (...values) => money(values.reduce((sum, value) => sum + Math.round(money(value) * 100), 0) / 100);
const minus = (a, b) => Math.round((money(a) - money(b)) * 100) / 100;
const rate = value => { const n = quantity(value, '比例'); if (n > 1) throw new Error('比例应在0至1之间'); return n; };
const required = (value, label) => { const s = text(value); if (!s) throw new Error('缺少' + label); return s; };
const idText = value => { const s = required(value, '标识'); if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(s) || ['__proto__', 'constructor', 'prototype'].includes(s)) throw new Error('标识无效'); return s; };
export function normalizePeriod(value) {
  const raw=required(value,'结算期间'),match=raw.match(/^(\d{1,6})(?:年|[-/.])(\d{1,2})(?:月)?$/);
  if(match){const month=Number(match[2]);if(month<1||month>12)throw new Error('结算月份无效');return String(Number(match[1])).padStart(4,'0')+'-'+String(month).padStart(2,'0');}return raw;
}
function periodAt(unit,index){const start=String(unit.periodRules?.startPeriod||'');if(start){const normalized=normalizePeriod(start),m=normalized.match(/^(\d+)-(\d{2})$/);if(m){const total=Number(m[1])*12+Number(m[2])-1+index;return String(Math.floor(total/12)).padStart(4,'0')+'-'+String(total%12+1).padStart(2,'0');}}return 'period:'+String(index+1);}
export function createManagement() { return { units: [], transactions: [], settlements: [], processedActions: [], personalPayouts: 0 }; }
export function normalizeManagement(value) {
  assertSafeValue(value || {});
  const out = { ...createManagement(), ...clone(value || {}) };
  for (const key of ['units', 'transactions', 'settlements', 'processedActions']) if (!Array.isArray(out[key])) throw new Error('经营数据格式错误：' + key);
  const ids = new Set(); for (const unit of out.units) { idText(unit.id); if (ids.has(unit.id)) throw new Error('经营单位标识重复'); ids.add(unit.id); }
  return out;
}
export function normalizeShareholders(value) {
  return (Array.isArray(value)?value:value&&typeof value==='object'?[value]:[]).map((row,index)=>{
    assertSafeValue(row);
    const name=text(row.name||row.actorName||row.姓名||row.名字);
    const fields=['share','ratio','比例','持股比例'].filter(k=>row[k]!=null&&row[k]!=='');
    if(!fields.length)throw new Error('股东'+(name||index+1)+'缺少持股比例');
    const values=fields.map(k=>{
      const raw=row[k],s=typeof raw==='string'?raw.trim().replace(/％/g,'%').replace(/[,，\s]/g,''):raw;
      let n=typeof s==='string'&&/%$/.test(s)?quantity(s.slice(0,-1),'股东持股百分比')/100:quantity(s,'股东持股比例');
      if(n>1&&Number.isInteger(n)&&n<=100)n/=100;
      return rate(n);
    });
    if(values.some(n=>Math.abs(n-values[0])>1e-6))throw new Error('股东'+(name||index+1)+'的比例字段互相冲突');
    return {actorId:text(row.actorId||row.角色ID),name,share:values[0]};
  });
}
export function createUnit(raw) {
  assertSafeValue(raw); const id = idText(raw.id);
  const stock = {}; for (const [key, value] of Object.entries(raw.stock || {})) stock[idText(key)] = quantity(value, '库存');
  const unit = {
    id, name: required(raw.name, '单位名称'), kind: text(raw.kind) || 'business', kindName:text(raw.kindName), currency: text(raw.currency), description: text(raw.description), businessProfile:Object.fromEntries(['businessScope','organization','development','operatingStatus','premises'].map(k=>[k,text(raw.businessProfile?.[k])])), resources:rows(raw.resources).map(x=>({id:idText(x.id),name:required(x.name,'物资名称'),unit:text(x.unit)})), periodElapsedDays:0, periodIndex:0,
    balance: money(raw.balance ?? 0), balanceKnown:raw.balanceKnown!==false&&raw.balance!=null&&raw.balance!=='', stock, shareholders: normalizeShareholders(raw.shareholders),
    facilities: rows(raw.facilities).map(x => ({ ...x, id: idText(x.id), name: required(x.name, '设施名称'), level: quantity(x.level ?? 1, '设施等级', false) })),
    facilityDefinitions: rows(raw.facilityDefinitions).map(normalizeFacilityDefinition), productionRules: rows(raw.productionRules).map(normalizeProductionRule),
    orders: [], productionOrders: [], staff: rows(raw.staff).map(x=>({...x,id:idText(x.id),count:quantity(x.count??1),salary:money(x.salary??0),salaryKnown:x.salary!=null&&x.salary!=='',workFraction:rate(x.workFraction??1)})), projects: rows(raw.projects), contracts: rows(raw.contracts), works: rows(raw.works), rights: rows(raw.rights),
    periodRules: { income: [], expenses: [], dividendRate: 0, periodDays:30, autoSettle:false, includePayroll:true, ...clone(raw.periodRules || {}) }, recommendations: [], recommendationBasis: '', recommendationAttempt: '',
    notes: text(raw.notes), revision: 1, recommendationVersion:0,
  };
  if (unit.shareholders.reduce((s, x) => s + Math.round(x.share*1e6), 0) > 1e6) throw new Error('持股比例合计超过100%');
  unit.periodRules.dividendRate = rate(unit.periodRules.dividendRate || 0);
  for (const k of ['income', 'expenses']) if (!Array.isArray(unit.periodRules[k])) throw new Error('周期规则格式错误');
  return unit;
}
function normalizedMaterials(raw = {}) { const out = {}; for (const [key, value] of Object.entries(raw)) out[idText(key)] = quantity(value, '物资'); return out; }
function normalizeEffect(raw = {}) {
  const out = {}; for (const k of ['capacity', 'staffSlots', 'outputMultiplier', 'costMultiplier']) if (raw[k] != null) out[k] = quantity(raw[k], '效果');
  if (raw.description) out.description = text(raw.description); return out;
}
export function normalizeFacilityDefinition(raw) {
  return { id: idText(raw.id), name: required(raw.name, '设施名称'), description: text(raw.description), cashOnly:raw.cashOnly===true||!Object.keys(raw.materials||{}).length, cost: money(raw.cost ?? 0), costKnown:raw.costKnown!==false&&raw.cost!=null&&raw.cost!=='', durationKnown:raw.durationKnown!==false&&raw.durationDays!=null&&raw.durationDays!=='', materials: normalizedMaterials(raw.materials), durationDays: quantity(raw.durationDays ?? 0, '工期'), targetLevel: quantity(raw.targetLevel ?? 1, '目标等级', false), effects: normalizeEffect(raw.effects) };
}
export function normalizeProductionRule(raw) {
  return { id: idText(raw.id), name: required(raw.name, '生产名称'), cashOnly:raw.cashOnly===true||!Object.keys(raw.inputs||{}).length, inputs: normalizedMaterials(raw.inputs), outputs: normalizedMaterials(raw.outputs), cycleDays: quantity(raw.cycleDays, '生产周期', false), costPerCycle: money(raw.costPerCycle ?? 0), costKnown:raw.costKnown!==false&&raw.costPerCycle!=null&&raw.costPerCycle!=='', facilityId: text(raw.facilityId), requiredStaff: quantity(raw.requiredStaff ?? 0, '所需人数') };
}
function needUnit(state, id) { const found = state.units.find(x => x.id === id); if (!found) throw new Error('经营单位不存在'); return found; }
function spend(unit, amount) { amount = money(amount); if(amount>0&&unit.balanceKnown===false)throw new Error(unit.name+'账户余额未明确'); if (unit.balance < amount) throw new Error(unit.name + '资金不足'); unit.balance = minus(unit.balance, amount); }
function consume(unit, materials, count = 1) {
  for (const [key, value] of Object.entries(materials)) if ((unit.stock[key] || 0) + 1e-8 < value * count) throw new Error('库存不足：' + key);
  for (const [key, value] of Object.entries(materials)) unit.stock[key] = Math.max(0, Math.round(((unit.stock[key] || 0) - value * count) * 1e6) / 1e6);
}
function post(state, unit, actionId, kind, amount, name, extra = {}) {
  state.transactions.push({ id: actionId + ':' + state.transactions.length, actionId, unitId: unit.id, kind, amount: money(amount), name: text(name), period:extra.period||(unit.periodRules?.autoSettle?periodAt(unit,unit.periodIndex||0):''), ...extra });
}
function fixedAmount(rule) {
  if(rule.amountKnown===false||rule.priceKnown===false)throw new Error('金额规则尚未确定');
  if (rule.amount != null && rule.amount !== '') return money(rule.amount);
  if (rule.quantity != null && rule.unitPrice != null) return money(quantity(rule.quantity) * quantity(rule.unitPrice,'单价'));
  throw new Error('缺少计算数据：' + (text(rule.name) || text(rule.id) || '收支项目'));
}
function allocatePayouts(shareholders,total){
  const cents=Math.round(money(total)*100),rows=shareholders.map((x,index)=>{const weight=Math.round(rate(x.share)*1e6),product=(cents%1e6)*weight,floor=Math.floor(cents/1e6)*weight+Math.floor(product/1e6);return {actorId:text(x.actorId),name:text(x.name),index,weight,cents:floor,remainder:product%1e6};});
  const weight=rows.reduce((sum,x)=>sum+x.weight,0);if(weight>1e6)throw new Error('持股比例合计超过100%');const target=Math.floor(cents/1e6)*weight+Math.round((cents%1e6)*weight/1e6);let remaining=target-rows.reduce((sum,x)=>sum+x.cents,0);
  for(const row of rows.slice().sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){if(remaining<=0)break;row.cents++;remaining--;}
  return rows.map(x=>({actorId:x.actorId,name:x.name,amount:x.cents/100}));
}
export function previewSettlement(management, unitId, period) {
  const state=normalizeManagement(management),unit=needUnit(state,unitId),key=normalizePeriod(period);if(unit.balanceKnown===false)throw new Error(unit.name+'账户余额未明确');
  if(state.settlements.some(x=>x.unitId===unitId&&normalizePeriod(x.period)===key))throw new Error(unit.name+'该期间已结算');
  const booked=state.transactions.filter(x=>x.unitId===unitId&&!x.settledPeriod&&(!x.period||normalizePeriod(x.period)===key)&&['recordIncome','recordSale','recordExpense','constructionCost','productionCost'].includes(x.kind));
  const bookedIncome=booked.filter(x=>['recordIncome','recordSale'].includes(x.kind)),bookedExpenses=booked.filter(x=>!['recordIncome','recordSale'].includes(x.kind));
  const pending=rules=>rows(rules).filter(x=>!booked.some(t=>t.ruleId&&t.ruleId===x.id)).map(x=>({id:text(x.id),name:text(x.name),amount:fixedAmount(x),actorId:text(x.actorId)}));
  const incomeRows=pending(unit.periodRules?.income),expenseRows=pending(unit.periodRules?.expenses);
  if(unit.periodRules?.includePayroll!==false)for(const member of rows(unit.staff)){
    if(member.salaryKnown===false||member.salary==null||member.salary==='')throw new Error('人员工资未确定：'+(member.name||member.role||''));
    const id='payroll:'+member.id;if(booked.some(x=>x.ruleId===id)||expenseRows.some(x=>x.id===id))continue;
    expenseRows.push({id,name:(member.name||member.role||'人员')+'工资',amount:money(money(member.salary)*quantity(member.count??1)*rate(member.workFraction??1)),actorId:text(member.actorId)});
  }
  const income=plus(...incomeRows.map(x=>x.amount),...bookedIncome.map(x=>x.amount)),expenses=plus(...expenseRows.map(x=>x.amount),...bookedExpenses.map(x=>x.amount));
  const closingBeforeDividends=Math.round((unit.balance+plus(...incomeRows.map(x=>x.amount))-plus(...expenseRows.map(x=>x.amount)))*100)/100;
  if(closingBeforeDividends<0)throw new Error(unit.name+'结算后资金不足');
  const profit=Math.round((income-expenses)*100)/100,declaredDividends=money(Math.max(0,profit)*rate(unit.periodRules?.dividendRate||0));
  const payouts=allocatePayouts(rows(unit.shareholders),declaredDividends),dividends=plus(...payouts.map(x=>x.amount));
  if(dividends>closingBeforeDividends)throw new Error(unit.name+'分红资金不足');
  return {unitId,unitName:unit.name,period:key,openingBalance:unit.balance,incomeRows,expenseRows,bookedTransactionIds:booked.map(x=>x.id),bookedIncome:plus(...bookedIncome.map(x=>x.amount)),bookedExpenses:plus(...bookedExpenses.map(x=>x.amount)),income,expenses,profit,declaredDividends,dividends,payouts,closingBalance:minus(closingBeforeDividends,dividends)};
}
function applySettlement(state,result,actionId){
  const unit=needUnit(state,result.unitId);unit.balance=result.closingBalance;let personal=0;
  for(const item of state.transactions)if(result.bookedTransactionIds.includes(item.id))item.settledPeriod=result.period;
  for(const row of result.incomeRows)post(state,unit,actionId,'periodIncome',row.amount,row.name,{period:result.period,ruleId:row.id});
  for(const row of result.expenseRows){post(state,unit,actionId,'periodExpense',row.amount,row.name,{period:result.period,ruleId:row.id,actorId:row.actorId});if(row.actorId==='player')personal=plus(personal,row.amount);}
  for(const row of result.payouts){post(state,unit,actionId,'dividend',row.amount,row.name,{actorId:row.actorId,period:result.period});if(row.actorId==='player')personal=plus(personal,row.amount);}
  state.settlements.push({...result,id:actionId+':'+unit.id});return personal;
}

function finishOrders(unit, days) {
  for (const order of unit.orders) if (order.status === 'running') {
    order.elapsedDays = quantity((order.elapsedDays || 0) + days, '进度');
    if (order.elapsedDays + 1e-8 >= order.definition.durationDays) {
      order.status = 'completed';
      const found = unit.facilities.find(x => x.id === order.facilityId);
      const next = { id: order.facilityId, name: order.definition.name, level: order.definition.targetLevel, description: order.definition.description, effects: clone(order.definition.effects) };
      if (found) Object.assign(found, next); else unit.facilities.push(next);
      unit.revision++;
    }
  }
}
function runProduction(state, unit, days, actionId) {
  for (const order of unit.productionOrders) if (order.status === 'running') {
    const rule = order.rule;if(Object.keys(rule.inputs||{}).length&&rule.cashOnly!==true){order.status='paused';order.reason='需更新全包货币报价';continue;}
    const facility = rule.facilityId ? unit.facilities.find(x => x.id === rule.facilityId) : null;
    if (rule.facilityId && !facility) { order.status = 'paused'; order.reason = '设施不存在'; continue; }
    const staff = rows(unit.staff).filter(x => !rule.facilityId || x.facilityId === rule.facilityId).reduce((s, x) => s + Number(x.count || 0)*Number(x.workFraction??1), 0);
    if (staff < rule.requiredStaff) { order.status = 'paused'; order.reason = '人员不足'; continue; }
    const outputMultiplier = facility?.effects?.outputMultiplier ?? 1, costMultiplier = facility?.effects?.costMultiplier ?? 1;
    order.elapsedDays = quantity((order.elapsedDays || 0) + days, '生产进度');
    const wanted = Math.min(Math.floor((order.elapsedDays + 1e-8) / rule.cycleDays), order.targetCycles - order.completedCycles);
    let possible = wanted;

    const cycleCost = money(rule.costPerCycle * costMultiplier);
    if (cycleCost > 0) possible = Math.min(possible, Math.floor(unit.balance / cycleCost));
    if (possible > 0) {
      spend(unit,money(cycleCost*possible));
      order.completedCycles += possible; order.elapsedDays = Math.max(0, order.elapsedDays - possible * rule.cycleDays);
      post(state, unit, actionId, 'productionCost', money(cycleCost * possible), rule.name, { cycles: possible, orderId: order.id });
    }
    if (order.completedCycles >= order.targetCycles) { order.status = 'completed'; order.elapsedDays = 0; }
    else if (possible < wanted) { order.status = 'paused'; order.reason = '资金不足'; order.elapsedDays = Math.min(order.elapsedDays, rule.cycleDays); }
  }
}
export function validateStaffAllocations(management){
  const totals=new Map();for(const unit of rows(management.units))for(const staff of rows(unit.staff)){if(!text(staff.actorId)||Number(staff.count??1)===0)continue;const total=(totals.get(staff.actorId)||0)+Math.round(rate(staff.workFraction??1)*1e6);if(total>1e6)throw new Error((text(staff.name)||'同一人员')+'跨单位工时分配超过100%');totals.set(staff.actorId,total);}return true;
}
export function executeManagement(management, raw) {
  assertSafeValue(raw); const state = normalizeManagement(management), action = clone(raw), actionId = idText(action.id);
  if (state.processedActions.includes(actionId)) return { management: state, personalDelta: 0, report: { duplicate: true, actionId } };
  let personalDelta = 0, report = { actionId, type: action.type };
  if (action.type === 'createUnit') {
    const unit = createUnit(action.unit); if (state.units.some(x => x.id === unit.id)) throw new Error('经营单位已存在'); state.units.push(unit); report.unitId = unit.id;
  } else if (action.type === 'settlePeriod') {
    const ids = rows(action.unitIds).length ? action.unitIds : [required(action.unitId, '经营单位')];
    if (new Set(ids).size !== ids.length) throw new Error('结算单位重复');
    const results = ids.map(id => previewSettlement(state, id, action.period));
    for (const result of results) personalDelta=plus(personalDelta,applySettlement(state,result,actionId));
    state.personalPayouts = plus(state.personalPayouts || 0, personalDelta); report.results = results;
  } else if (action.type === 'advanceTime') {
    const days = quantity(action.days, '经过天数'); const ids = rows(action.unitIds).length ? action.unitIds : state.units.map(x => x.id);
    if (new Set(ids).size !== ids.length) throw new Error('经营单位重复');
    for (const id of ids) {
      const unit=needUnit(state,id),periodDays=quantity(unit.periodRules?.periodDays??30,'结算周期',false),auto=unit.periodRules?.autoSettle===true;
      const boundaries=[days];for(const order of unit.orders)if(order.status==='running'){const remaining=order.definition.durationDays-(order.elapsedDays||0);if(remaining>0&&remaining<days)boundaries.push(remaining);}
      if(auto){let boundary=periodDays-(unit.periodElapsedDays||0);if(Math.ceil(days/periodDays)>10000)throw new Error('经营跨度过大，请分批推进');while(boundary<=days){boundaries.push(boundary);boundary+=periodDays;}}
      let cursor=0;for(const at of [...new Set(boundaries)].sort((a,b)=>a-b)){
        const elapsed=at-cursor;if(elapsed<0)continue;runProduction(state,unit,elapsed,actionId);finishOrders(unit,elapsed);unit.periodElapsedDays=quantity((unit.periodElapsedDays||0)+elapsed,'经营经过天数');cursor=at;
        if(auto&&unit.periodElapsedDays+1e-8>=periodDays){const period=periodAt(unit,unit.periodIndex||0);if(!state.settlements.some(x=>x.unitId===id&&normalizePeriod(x.period)===period))personalDelta=plus(personalDelta,applySettlement(state,previewSettlement(state,id,period),actionId+':period:'+unit.periodIndex));unit.periodIndex=(unit.periodIndex||0)+1;unit.periodElapsedDays=Math.max(0,unit.periodElapsedDays-periodDays);}
      }
    }
    state.personalPayouts=plus(state.personalPayouts||0,personalDelta);
    report.days = days;
  } else {
    const unit = needUnit(state, action.unitId); report.unitId = unit.id;
    if (action.type === 'recordIncome' || action.type === 'recordExpense' || action.type === 'recordSale') {
      const amount = fixedAmount(action);
      if (action.type === 'recordSale' && action.resourceId) consume(unit, { [idText(action.resourceId)]: quantity(action.quantity, '销售数量', false) });
      if (action.type === 'recordExpense') spend(unit, amount); else unit.balance = plus(unit.balance, amount);
      post(state, unit, actionId, action.type, amount, action.name, {...(action.period?{period:normalizePeriod(action.period)}:{}),ruleId:text(action.ruleId)}); report.amount = amount;
    } else if (action.type === 'transferFunds') {
      const target=needUnit(state,action.targetUnitId);if(target.id===unit.id)throw new Error('不能向自身转账');if(unit.currency&&target.currency&&unit.currency!==target.currency&&action.exchangeRate==null)throw new Error('不同币种转账缺少明确汇率');const amount=money(action.amount),exchangeRate=quantity(action.exchangeRate??1,'兑换率',false),received=money(amount*exchangeRate);spend(unit,amount);target.balance=plus(target.balance,received);post(state,unit,actionId,'transferOut',amount,action.name,{targetUnitId:target.id,exchangeRate});post(state,target,actionId,'transferIn',received,action.name,{sourceUnitId:unit.id,exchangeRate});
    } else if (action.type === 'fundUnit') {
      const amount=money(action.amount);if(unit.balanceKnown===false)throw new Error('公司账户余额未明确');unit.balance=plus(unit.balance,amount);personalDelta=-amount;post(state,unit,actionId,'ownerContribution',amount,action.name||'个人出资');
    } else if (action.type === 'withdrawUnit') {
      const amount=money(action.amount);spend(unit,amount);personalDelta=amount;post(state,unit,actionId,'ownerWithdrawal',amount,action.name||'个人取款');
    } else if (action.type === 'payActor') {
      const amount=money(action.amount);spend(unit,amount);if(action.actorId==='player')personalDelta=amount;post(state,unit,actionId,'recordExpense',amount,action.name||'人员支付',{actorId:text(action.actorId),ruleId:text(action.ruleId),...(action.period?{period:normalizePeriod(action.period)}:{})});
    } else if (action.type === 'transferStock') {
      const target=needUnit(state,action.toUnitId),key=idText(action.resourceId),targetKey=idText(action.toResourceId||key),amount=quantity(action.quantity);if(target.id===unit.id&&targetKey===key)throw new Error('相同库存无需转移');consume(unit,{[key]:amount});target.stock[targetKey]=quantity((target.stock[targetKey]||0)+amount,'转入库存');post(state,unit,actionId,'stockTransferOut',0,action.name,{resourceId:key,quantity:amount,linkedUnitId:target.id});post(state,target,actionId,'stockTransferIn',0,action.name,{resourceId:targetKey,quantity:amount,linkedUnitId:unit.id});
    } else if (action.type === 'initializeAccount') {
      if(unit.balanceKnown!==false)throw new Error('账户初值已经明确，不能重复初始化');unit.balance=money(action.amount);unit.balanceKnown=true;post(state,unit,actionId,'openingBalance',unit.balance,action.name||'账户初值');
    } else if (action.type === 'defineResource') {
      const resource={id:idText(action.resource.id),name:required(action.resource.name,'物资名称'),unit:text(action.resource.unit)};unit.resources=rows(unit.resources);const at=unit.resources.findIndex(x=>x.id===resource.id);if(at>=0)unit.resources[at]=resource;else unit.resources.push(resource);
    } else if (action.type === 'defineFacility') {
      const definition = normalizeFacilityDefinition(action.definition); const at = unit.facilityDefinitions.findIndex(x => x.id === definition.id); if (at >= 0) unit.facilityDefinitions[at] = definition; else unit.facilityDefinitions.push(definition); unit.revision++;
    } else if (action.type === 'buildFacility' || action.type === 'upgradeFacility') {
      const definition = unit.facilityDefinitions.find(x => x.id === action.definitionId); if (!definition) throw new Error('建设方案不存在');
      const facilityId = idText(action.facilityId || ('facility:' + actionId)); const current = unit.facilities.find(x => x.id === facilityId);
      if (action.type === 'buildFacility' && current) throw new Error('设施已存在');
      if (action.type === 'upgradeFacility' && !current) throw new Error('升级目标不存在');
      if (current && definition.targetLevel <= current.level) throw new Error('目标等级没有提升');
      if (unit.orders.some(x => x.facilityId === facilityId && x.status === 'running')) throw new Error('该设施已有进行中的订单');
      if(definition.costKnown===false||definition.durationKnown===false)throw new Error('建设成本或工期未确定');
      if(Object.keys(definition.materials||{}).length&&definition.cashOnly!==true)throw Error('需更新全包货币报价');spend(unit, definition.cost);
      unit.orders.push({ id: actionId, facilityId, status: 'running', elapsedDays: 0, definition: clone(definition) }); post(state, unit, actionId, 'constructionCost', definition.cost, definition.name); finishOrders(unit, 0);
    } else if (action.type === 'defineProduction') {
      const rule = normalizeProductionRule(action.rule); const at = unit.productionRules.findIndex(x => x.id === rule.id); if (at >= 0) unit.productionRules[at] = rule; else unit.productionRules.push(rule); unit.revision++;
    } else if (action.type === 'startProduction') {
      const rule = unit.productionRules.find(x => x.id === action.ruleId); if (!rule) throw new Error('生产规则不存在');
      if(rule.costKnown===false)throw new Error('业务成本未确定');if(Object.keys(rule.inputs||{}).length&&rule.cashOnly!==true)throw Error('需更新全包货币报价');
      const targetCycles = quantity(action.cycles ?? 1, '生产次数', false); if (!Number.isInteger(targetCycles)) throw new Error('生产次数应为整数');
      unit.productionOrders.push({ id: actionId, status: 'running', elapsedDays: 0, completedCycles: 0, targetCycles, rule: clone(rule) });
    } else if (action.type === 'pauseProduction' || action.type === 'resumeProduction') {
      const order = unit.productionOrders.find(x => x.id === action.orderId); if (!order || order.status === 'completed') throw new Error('没有可操作的生产订单'); order.status = action.type === 'pauseProduction' ? 'paused' : 'running'; order.reason = '';
    } else if (action.type === 'recordStock') {
      const key = idText(action.resourceId), amount = quantity(action.quantity); unit.stock[key] = quantity((unit.stock[key] || 0) + amount, '库存');
    } else if (action.type === 'assignStaff') {
      const member = { id: idText(action.staffId), actorId: text(action.actorId), name: text(action.name), role: required(action.role, '岗位'), count: quantity(action.count ?? 1, '人数'), facilityId: text(action.facilityId), salary: money(action.salary ?? 0), salaryKnown:action.salary!=null&&action.salary!=='', workFraction:rate(action.workFraction??1) };
      const assigned=state.units.reduce((total,x)=>total+rows(x.staff).filter(y=>!(x.id===unit.id&&y.id===member.id)&&y.actorId===member.actorId&&Number(y.count)>0).reduce((sum,y)=>sum+Number(y.workFraction??1),0),0);
      if(member.actorId&&assigned+member.workFraction>1.000001)throw new Error('该人物工时分配超过100%，请先调整已有分配');
      const at = unit.staff.findIndex(x => x.id === member.id); if (at >= 0) unit.staff[at] = member; else unit.staff.push(member);
    } else if (action.type === 'recordProject' || action.type === 'recordContract' || action.type === 'recordWork' || action.type === 'recordRight') {
      const key = { recordProject: 'projects', recordContract: 'contracts', recordWork: 'works', recordRight: 'rights' }[action.type];
      const item = clone(action.record || {}); idText(item.id); required(item.name, '名称');
      const at = unit[key].findIndex(x => x.id === item.id); if (at >= 0) unit[key][at] = { ...unit[key][at], ...item }; else unit[key].push(item);
    } else if (action.type === 'updateUnitRules') {
      if (action.periodRules) { const rules = { ...unit.periodRules, ...clone(action.periodRules) }; if (!Array.isArray(rules.income) || !Array.isArray(rules.expenses)) throw new Error('周期规则格式错误'); rules.dividendRate = rate(rules.dividendRate || 0); if(rules.autoSettle!==unit.periodRules.autoSettle||rules.periodDays!==unit.periodRules.periodDays||rules.startPeriod!==unit.periodRules.startPeriod){unit.periodElapsedDays=0;unit.periodIndex=0;} unit.periodRules = rules; }
      if (action.description != null) unit.description = text(action.description); unit.revision++;
    } else throw new Error('不支持的经营操作：' + text(action.type));
  }
  if(['recordIncome','recordExpense','recordSale','fundUnit','withdrawUnit','payActor','transferFunds'].includes(action.type)&&(action.amountKnown===false||action.priceKnown===false||action.costKnown===false))throw new Error('交易金额尚未确定');
  validateStaffAllocations(state);state.processedActions.push(actionId); assertSafeValue(state); return { management: state, personalDelta, report };
}
export function previewManagement(management, actions) {
  let next = normalizeManagement(management), personalDelta = 0; const reports = [];
  for (const action of rows(actions)) { const result = executeManagement(next, action); next = result.management; personalDelta = plus(personalDelta, result.personalDelta); reports.push(result.report); }
  return { management: next, personalDelta, reports };
}
export function recommendationSignature(unit) { return JSON.stringify({ name: unit.name, kind: unit.kind, description: unit.description, facilities: unit.facilities, facilityDefinitions: unit.facilityDefinitions, productionRules: unit.productionRules, revision: unit.revision }); }
export function applyRecommendations(management, requested, result) {
  assertSafeValue(result||{});const next=normalizeManagement(management),accepted=[],issues=[];
  for(const task of requested){const unit=needUnit(next,task.unitId);if(recommendationSignature(unit)!==task.basis){unit.recommendationError='单位资料已变化，请更新推荐';issues.push(unit.recommendationError);continue;}
    try{const matches=rows(result?.units).filter(r=>r.unitId===unit.id);if(matches.length!==1)throw Error('未返回对应单位的推荐');const raw=rows(matches[0].recommendations);if(raw.length<3)throw Error('每次至少需要3条不同的可选方案');const version=(unit.recommendationVersion||0)+1;
      const recommendations=raw.map((item,index)=>{if(!['buildFacility','upgradeFacility'].includes(item.kind))throw Error('方案类型不正确');const definition=normalizeFacilityDefinition({...item.definition,id:item.definition?.id||'definition:'+unit.id+':'+index,name:item.definition?.name||item.name});if(!definition.cashOnly||!definition.costKnown||!definition.durationKnown)throw Error('方案须有明确的全包货币费用与工期');return {id:'recommendation:'+unit.id+':'+version+':'+index,name:required(item.name,'推荐名称'),description:text(item.description),kind:item.kind,facilityId:text(item.facilityId),definition};});
      if(new Set(recommendations.map(x=>x.name.replace(/\s/gu,''))).size!==recommendations.length||new Set(recommendations.map(x=>x.definition.id)).size!==recommendations.length)throw Error('可选方案名称或编号重复');unit.recommendations=recommendations;unit.recommendationVersion=version;unit.recommendationBasis=task.basis;unit.recommendationError='';accepted.push(unit.id);
    }catch(e){unit.recommendationError=unit.name+'：'+String(e.message||e);issues.push(unit.recommendationError);}
  }return {management:next,accepted,issues};
}
