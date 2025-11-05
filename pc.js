(function () {
  // kintone の数値フィールドも「文字列」で渡すのがルール
  const TYPE = {
    scan_at: 'DATETIME',
    col_prod: 'TEXT',
    col_width: 'NUMBER',
    col_length: 'NUMBER',
    col_lot: 'TEXT',
    col_label: 'TEXT',
    col_packs: 'NUMBER',
    col_rotation: 'NUMBER',
    result: 'TEXT',
    reason: 'TEXT'
  };
  const v = (code, raw) => {
    if (TYPE[code] === 'DATETIME') return { value: new Date().toISOString() };
    if (TYPE[code] === 'NUMBER')   return { value: String(raw) };  // ←数値でも文字列！
    return { value: String(raw ?? '') };
  };

  const row = {
    scan_at:    v('scan_at',    new Date()),
    col_prod:   v('col_prod',   'TEST'),
    col_width:  v('col_width',  16),
    col_length: v('col_length', 6000),
    col_lot:    v('col_lot',    '51104'),
    col_label:  v('col_label',  'AA'),
    col_packs:  v('col_packs',  2),
    col_rotation:v('col_rotation',1),
    result:     v('result',     'OK'),
    reason:     v('reason',     '')
  };

  const r = kintone.app.record.get();
  r.record.scan_table.value.push({ value: row });
  kintone.app.record.set({ record: r.record });
  console.log('pushed 1 row', row);
})();
