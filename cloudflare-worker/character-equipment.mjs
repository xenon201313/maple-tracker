const itemFields = ['item_equipment_part','item_equipment_slot','item_name','item_icon','starforce','potential_option_grade','additional_potential_option_grade','potential_option_1','potential_option_2','potential_option_3','additional_potential_option_1','additional_potential_option_2','additional_potential_option_3'];
const symbolFields = ['symbol_name','symbol_icon','symbol_level','symbol_force','symbol_exp','symbol_growth_count','symbol_require_growth_count'];

function project(rows, fields) {
  return rows.map(row => Object.fromEntries(fields.filter(key => Object.hasOwn(row || {}, key)).map(key => [key,row[key]])));
}

export function equipmentProfile(ocid, item, symbol) {
  const result = {ocid, date:item?.date || symbol?.date || null};
  if (Array.isArray(item?.item_equipment)) result.equipment = project(item.item_equipment, itemFields);
  if (Array.isArray(symbol?.symbol)) result.symbols = project(symbol.symbol, symbolFields);
  if (!result.equipment && !result.symbols) return null;
  if (!result.equipment || !result.symbols) result.warning = '일부 정보는 불러오지 못했습니다. 기존 값을 확인하세요.';
  return result;
}
