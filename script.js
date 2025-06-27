  const monthOrder = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  let rawData, currentYear, currentMonth, accounts, pots, editing;
  let dragAccountName = null;
  let dragPotName = null;

  // Initialize data and state
  function initializeTemplate() {
    const now = new Date();
    currentYear = now.getFullYear().toString();
    currentMonth = now.toLocaleString('nl-NL', { month: 'long' });
    rawData = { [currentYear]: { [currentMonth]: [] } };
    accounts = {};
    pots = {};
    editing = null;
  }

  // Core renderAll function to avoid missing definition
  function renderAll() {
    renderYearTabs();
    renderMonthTabs();
    applyRecurring();
    renderTransactions();
    updateAccountList();
    updatePotList();
  }

  // Render year tabs
  function renderYearTabs() {
    const container = document.getElementById('yearTabs'); container.innerHTML = '';
    Object.keys(rawData).sort((a, b) => a - b).forEach(year => {
      const li = document.createElement('li'); li.className = 'nav-item';
      const btn = document.createElement('button'); btn.className = 'nav-link' + (year === currentYear ? ' active' : ''); btn.textContent = year;
      btn.onclick = () => { currentYear = year; currentMonth = Object.keys(rawData[year]).sort((a,b)=>monthOrder.indexOf(a.toLowerCase())-monthOrder.indexOf(b.toLowerCase()))[0]; renderAll(); };
      li.appendChild(btn); container.appendChild(li);
    });
  }

  // Render month tabs
  function renderMonthTabs() {
    const container = document.getElementById('monthTabs'); container.innerHTML = '';
    if (!rawData[currentYear]) rawData[currentYear] = {};
    monthOrder.forEach(month => {
      if (!rawData[currentYear][month]) rawData[currentYear][month] = [];
      const li = document.createElement('li'); li.className = 'nav-item';
      const btn = document.createElement('button'); btn.className = 'nav-link' + (month === currentMonth ? ' active' : ''); btn.textContent = month;
      btn.onclick = () => { currentMonth = month; renderAll(); };
      li.appendChild(btn); container.appendChild(li);
    });
  }

  // Apply recurring transactions up to the selected month
  function adjustBalances(row, mult = 1) {
    const amt = parseFloat(row.Bedrag) * mult;
    if (row.Type === 'inkomen') {
      if (row.Rekening && accounts[row.Rekening]) accounts[row.Rekening].balance += amt;
      if (row.Pot && pots[row.Pot]) pots[row.Pot].balance += amt;
    } else if (row.Type === 'uitgave') {
      if (row.Rekening && accounts[row.Rekening]) accounts[row.Rekening].balance -= amt;
      if (row.Pot && pots[row.Pot]) pots[row.Pot].balance -= amt;
    } else if (row.Type === 'transfer') {
      if (row.Rekening && accounts[row.Rekening]) accounts[row.Rekening].balance -= amt;
      if (row.Pot && pots[row.Pot]) pots[row.Pot].balance += amt;
    }
  }

  function applyRecurring() {
    const cYear = parseInt(currentYear);
    const cMonthIdx = monthOrder.indexOf(currentMonth.toLowerCase());
    Object.entries(rawData).forEach(([y, months]) => {
      Object.entries(months).forEach(([mName, rows]) => {
        rows.forEach(row => {
          let freq = row.Herhaal;
          if (!freq || freq === 'none') return;
          if (freq === true) freq = 'monthly';
          const next = new Date(row.Datum);
          if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
          else if (freq === 'weekly') next.setDate(next.getDate() + 7);
          else if (freq === 'yearly') next.setFullYear(next.getFullYear() + 1);
          if(row.HerhaalTot && new Date(next) > new Date(row.HerhaalTot)) return;
          const nYear = next.getFullYear();
          const nMonthIdx = next.getMonth();
          if (nYear > cYear || (nYear === cYear && nMonthIdx > cMonthIdx)) return;
          const iso = next.toISOString().split('T')[0];
          const nMonthName = monthOrder[nMonthIdx];
          if (!rawData[nYear]) rawData[nYear] = {};
          if (!rawData[nYear][nMonthName]) rawData[nYear][nMonthName] = [];
          const exists = rawData[nYear][nMonthName].some(r => r.Datum === iso && r.Omschrijving === row.Omschrijving);
          if (!exists) {
            const newEntry = { ...row, Datum: iso };
            rawData[nYear][nMonthName].push(newEntry);
            adjustBalances(newEntry, 1);
          }
        });
      });
    });
  }

  function computeYearStartBalance(year) {
    const finalTotal = Object.values(accounts).reduce((s, a) => s + a.balance, 0);
    let netAfter = 0;
    Object.entries(rawData).forEach(([y, months]) => {
      if (parseInt(y) >= parseInt(year)) {
        Object.values(months).forEach(rows => {
          rows.forEach(r => {
            const v = parseFloat(r.Bedrag);
            if (r.Type === 'inkomen') netAfter += v;
            else if (r.Type === 'uitgave' || r.Type === 'transfer') netAfter -= v;
          });
        });
      }
    });
    return finalTotal - netAfter;
  }

  function computeMonthEndBalance(year, month) {
    let bal = computeYearStartBalance(year);
    for (const m of monthOrder) {
      if (rawData[year] && rawData[year][m]) {
        rawData[year][m].forEach(r => {
          const v = parseFloat(r.Bedrag);
          if (r.Type === 'inkomen') bal += v;
          else if (r.Type === 'uitgave' || r.Type === 'transfer') bal -= v;
        });
      }
      if (m === month) break;
    }
    return bal;
  }

  function computePotBalances(year, month) {
    const ySel = parseInt(year);
    const mSel = monthOrder.indexOf(month.toLowerCase());
    const res = {};
    Object.entries(pots).forEach(([n, o]) => { res[n] = o.balance; });
    Object.entries(rawData).forEach(([y, months]) => {
      const yNum = parseInt(y);
      Object.entries(months).forEach(([mName, rows]) => {
        const mIdx = monthOrder.indexOf(mName.toLowerCase());
        rows.forEach(r => {
          if (!r.Pot || res[r.Pot] === undefined) return;
          const after = yNum > ySel || (yNum === ySel && mIdx > mSel);
          if (!after) return;
          const v = parseFloat(r.Bedrag);
          if (r.Type === 'inkomen') res[r.Pot] -= v;
          else if (r.Type === 'uitgave') res[r.Pot] += v;
          else if (r.Type === 'transfer') res[r.Pot] -= v;
        });
      });
    });
    return res;
  }

  function computeAccountBalances(year, month) {
    const ySel = parseInt(year);
    const mSel = monthOrder.indexOf(month.toLowerCase());
    const res = {};
    Object.entries(accounts).forEach(([n,o]) => { res[n] = o.balance; });
    Object.entries(rawData).forEach(([y, months]) => {
      const yNum = parseInt(y);
      Object.entries(months).forEach(([mName, rows]) => {
        const mIdx = monthOrder.indexOf(mName.toLowerCase());
        rows.forEach(r => {
          if (!r.Rekening || res[r.Rekening] === undefined) return;
          const after = yNum > ySel || (yNum === ySel && mIdx > mSel);
          if (!after) return;
          const v = parseFloat(r.Bedrag);
          if (r.Type === 'inkomen') res[r.Rekening] -= v;
          else if (r.Type === 'uitgave' || r.Type === 'transfer') res[r.Rekening] += v;
        });
      });
    });
    return res;
  }

  // Render transactions table
  let dragTransIndex = null;

  function renderTransactions() {
    const container = document.getElementById('transactionsContainer'); container.innerHTML = '';
    if (!rawData[currentYear]) rawData[currentYear] = {};
    if (!rawData[currentYear][currentMonth]) rawData[currentYear][currentMonth] = [];

    const monthRows = rawData[currentYear][currentMonth];
    const totalBal = computeMonthEndBalance(currentYear, currentMonth);
    const salary = monthRows.filter(r=>r.Type==='inkomen' && r.SubType==='salaris').reduce((s,r)=>s+parseFloat(r.Bedrag),0);
    const expenses = monthRows.filter(r=>r.Type==='uitgave').reduce((s,r)=>s+parseFloat(r.Bedrag),0);
    const fixed = monthRows.filter(r=>(r.Type==='uitgave' || r.Type==='transfer') && r.Herhaal && r.Herhaal!=='none').reduce((s,r)=>s+parseFloat(r.Bedrag),0);
    const net = monthRows.reduce((s,r)=>{
      if(r.Type==='inkomen') return s+parseFloat(r.Bedrag);
      if(r.Type==='uitgave') return s-parseFloat(r.Bedrag);
      return s;
    },0);
    const startYear = computeYearStartBalance(currentYear);

    const infoTop = document.createElement('div');
    infoTop.className = 'mb-2';
    let topText = `Totaal saldo: €${totalBal.toFixed(2)} (Begin jaar: €${startYear.toFixed(2)})`;
    if (Object.keys(accounts).length) {
      const monthAcc = computeAccountBalances(currentYear, currentMonth);
      const accStr = Object.entries(monthAcc).map(([n,o])=>`${n}: €${o.toFixed(2)}`).join(' | ');
      topText += ` | ${accStr}`;
    }
    infoTop.textContent = topText;
    container.appendChild(infoTop);

    if(Object.keys(pots).length){
      const infoPots=document.createElement('div');
      infoPots.className='mb-2';
      const monthPots = computePotBalances(currentYear, currentMonth);
      infoPots.textContent='Potten: '+Object.entries(monthPots).map(([n,o])=>`${n}: €${o.toFixed(2)}`).join(' | ');
      container.appendChild(infoPots);
    }

    const table = document.createElement('table'); table.className = 'table table-dark table-bordered';
    const thead = document.createElement('thead'), headRow = document.createElement('tr');
    ['Datum','Omschrijving','Bedrag','Type','SubType','Rekening','Pot','Acties'].forEach(h => { const th = document.createElement('th'); th.textContent = h; headRow.appendChild(th); });
    thead.appendChild(headRow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rawData[currentYear][currentMonth].forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.className = (parseFloat(row.Bedrag) < 0 ? 'negative' : 'positive') + ' draggable';
      tr.draggable = true;
      tr.dataset.index = i;
      tr.addEventListener('dragstart', e => { dragTransIndex = i; });
      tr.addEventListener('dragover', e => { e.preventDefault(); tr.classList.add('drag-over'); });
      tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
      tr.addEventListener('drop', e => {
        e.preventDefault();
        const target = parseInt(e.currentTarget.dataset.index);
        if (dragTransIndex === null || target === dragTransIndex) return;
        reorderTransaction(dragTransIndex, target);
        dragTransIndex = null;
        tr.classList.remove('drag-over');
      });
      ['Datum','Omschrijving','Bedrag','Type','SubType','Rekening','Pot'].forEach(k => {
        const td = document.createElement('td');
        td.textContent = row[k] || '';
        tr.appendChild(td);
      });
      const tdAct = document.createElement('td');
      const btnUp = document.createElement('button');
      btnUp.className = 'btn btn-sm btn-secondary me-1';
      btnUp.textContent = '▲';
      btnUp.onclick = () => moveTransaction(i, -1);
      const btnDown = document.createElement('button');
      btnDown.className = 'btn btn-sm btn-secondary me-1';
      btnDown.textContent = '▼';
      btnDown.onclick = () => moveTransaction(i, 1);
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-warning me-1';
      btnEdit.textContent = '✏️';
      btnEdit.onclick = () => openEdit(i);
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-danger';
      btnDel.textContent = '✖';
      btnDel.onclick = () => removeTransaction(i);
      tdAct.append(btnUp, btnDown, btnEdit, btnDel);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); container.appendChild(table);

    const infoBottom = document.createElement('div');
    infoBottom.className = 'mt-2';
    const diff = salary - expenses;
    infoBottom.innerHTML = `Salaris: €${salary.toFixed(2)} | Uitgaven: €${expenses.toFixed(2)} | Verschil deze maand: €${net.toFixed(2)} | Vaste Uitgaven: €${fixed.toFixed(2)} | Over van salaris: <span class="${diff < 0 ? 'text-danger' : 'text-success'}">€${diff.toFixed(2)}</span>`;
    container.appendChild(infoBottom);
  }

  // Open edit modal
  function openEdit(i) {
    const row = rawData[currentYear][currentMonth][i]; editing = { year: currentYear, month: currentMonth, index: i };
    document.querySelector('#transactionModal .modal-title').textContent = 'Bewerk Transactie';
    document.getElementById('transDate').value = row.Datum;
    document.getElementById('transDesc').value = row.Omschrijving;
    document.getElementById('transAmount').value = row.Bedrag;
    document.getElementById('transType').value = row.Type;
    document.getElementById('incomeSubTypeWrapper').style.display = row.Type === 'inkomen' ? 'block' : 'none';
    document.getElementById('expenseSubTypeWrapper').style.display = row.Type === 'uitgave' ? 'block' : 'none';
    if(row.Type === 'inkomen') {
      document.getElementById('incomeSubType').value = row.SubType || 'salaris';
    } else if(row.Type === 'uitgave') {
      document.getElementById('expenseSubType').value = row.SubType || 'andere';
    }
    updateAccountSelect();
    updatePotSelect();
    document.getElementById('transAccount').value = row.Rekening;
    document.getElementById('transPot').value = row.Pot || '';
    let recVal = 'none';
    if (row.Herhaal === true) recVal = 'monthly';
    else if (typeof row.Herhaal === 'string') recVal = row.Herhaal;
    document.getElementById('transRecurring').value = recVal;
    document.getElementById('transRecEnd').value = row.HerhaalTot || '';
    document.getElementById('recurringEndWrapper').style.display = recVal !== 'none' ? 'block' : 'none';
    new bootstrap.Modal(document.getElementById('transactionModal')).show();
  }

  function moveTransaction(index, dir) {
    const arr = rawData[currentYear][currentMonth];
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    const [item] = arr.splice(index, 1);
    arr.splice(newIdx, 0, item);
    renderTransactions();
  }

  function reorderTransaction(from, to) {
    const arr = rawData[currentYear][currentMonth];
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    renderTransactions();
  }

  function removeTransaction(index) {
    if (!confirm('Verwijder deze transactie?')) return;
    const arr = rawData[currentYear][currentMonth];
    const [removed] = arr.splice(index, 1);
    adjustBalances(removed, -1);
    renderAll();
  }

  // Reset form for new transactions
    document.getElementById('addTransaction').addEventListener('click', () => {
      editing = null;
      document.querySelector('#transactionModal .modal-title').textContent = 'Nieuwe Transactie';
      ['transDate','transDesc','transAmount'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('transType').value = '';
      document.getElementById('incomeSubTypeWrapper').style.display = 'none';
      document.getElementById('expenseSubTypeWrapper').style.display = 'none';
      document.getElementById('transAccount').value = '';
      updateAccountSelect();
      updatePotSelect();
      document.getElementById('transPot').value = '';
      document.getElementById('transRecurring').value = 'none';
      document.getElementById('transRecEnd').value = '';
      document.getElementById('recurringEndWrapper').style.display = 'none';
    });

  // Show subtype based on type selection
  document.getElementById('transType').addEventListener('change', () => {
    const val = document.getElementById('transType').value;
    document.getElementById('incomeSubTypeWrapper').style.display = val === 'inkomen' ? 'block' : 'none';
    document.getElementById('expenseSubTypeWrapper').style.display = val === 'uitgave' ? 'block' : 'none';
  });

  document.getElementById('transRecurring').addEventListener('change', () => {
    const val = document.getElementById('transRecurring').value;
    document.getElementById('recurringEndWrapper').style.display = val !== 'none' ? 'block' : 'none';
  });

  // Save (add/edit) transaction
  document.getElementById('saveTransaction').addEventListener('click', () => {
    const date = document.getElementById('transDate').value;
    const desc = document.getElementById('transDesc').value;
    const amt = parseFloat(document.getElementById('transAmount').value);
    const type = document.getElementById('transType').value;
    const subIncome = document.getElementById('incomeSubType').value;
    const subExpense = document.getElementById('expenseSubType').value;
    const acc = document.getElementById('transAccount').value;
    const pot = document.getElementById('transPot').value;
    const rec = document.getElementById('transRecurring').value;
    const recEnd = document.getElementById('transRecEnd').value;
    if (!date || !desc || isNaN(amt) || !type) return alert('Vul alle velden in');
    if (type === 'transfer' && (!acc || !pot)) return alert('Selecteer rekening en pot voor transfer');
    const d = new Date(date); const y = d.getFullYear().toString(); const m = d.toLocaleString('nl-NL',{month:'long'});
    if (!rawData[y]) rawData[y] = {};
    if (!rawData[y][m]) rawData[y][m] = [];
    const sub = type === 'inkomen' ? subIncome : (type === 'uitgave' ? subExpense : null);
    const newRow = { Datum: date, Omschrijving: desc, Bedrag: amt, Type: type, SubType: sub, Herhaal: rec, HerhaalTot: recEnd || null, Rekening: acc, Pot: pot };
    if (editing !== null) {
      const old = rawData[editing.year][editing.month][editing.index];
      adjustBalances(old, -1);
      rawData[editing.year][editing.month][editing.index] = newRow;
      editing = null;
    } else rawData[y][m].push(newRow);
    adjustBalances(newRow, 1);
    renderAll();
    bootstrap.Modal.getInstance(document.getElementById('transactionModal')).hide();
  });

  // Accounts management
  function updateAccountList() {
    const list = document.getElementById('accountList'); list.innerHTML = '';
    Object.entries(accounts).forEach(([name,obj]) => {
      const li = document.createElement('li');
      li.className='list-group-item bg-dark text-white d-flex align-items-center draggable';
      li.draggable = true;
      li.dataset.name = name;
      li.addEventListener('dragstart', e => { dragAccountName = name; });
      li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', e => {
        e.preventDefault();
        const target = e.currentTarget.dataset.name;
        if (dragAccountName && target && target !== dragAccountName) {
          accounts = reorderObjectByName(accounts, dragAccountName, target);
          dragAccountName = null;
          renderAll();
        }
        li.classList.remove('drag-over');
      });
      const inpName = document.createElement('input');
      inpName.type='text';
      inpName.value=name;
      inpName.className='form-control me-2';
      inpName.style.maxWidth='30%';
      inpName.onchange=e => { const nn=e.target.value.trim(); if (nn && nn!==name) { accounts[nn] = obj; delete accounts[name]; renderAll(); } };
      const inpBal = document.createElement('input');
      inpBal.type='number';
      inpBal.value=obj.balance.toFixed(2);
      inpBal.className='form-control me-2';
      inpBal.style.maxWidth='30%';
      inpBal.onchange=e => { accounts[name].balance = parseFloat(e.target.value); renderAll(); };
      const btnUp=document.createElement('button');
      btnUp.className='btn btn-sm btn-secondary me-1';
      btnUp.textContent='▲';
      btnUp.onclick=_=>moveAccount(name,-1);
      const btnDown=document.createElement('button');
      btnDown.className='btn btn-sm btn-secondary me-1';
      btnDown.textContent='▼';
      btnDown.onclick=_=>moveAccount(name,1);
      const btnDel = document.createElement('button');
      btnDel.className='btn btn-sm btn-danger';
      btnDel.textContent='✖';
      btnDel.onclick=_ => { if (confirm(`Verwijder ${name}?`)) { delete accounts[name]; renderAll(); } };
      li.append(inpName, inpBal, btnUp, btnDown, btnDel);
      list.appendChild(li);
    });
    updateAccountSelect();
  }

  function updatePotList() {
    const list = document.getElementById('potList'); if(!list) return; list.innerHTML = '';
    const monthBalances = computePotBalances(currentYear, currentMonth);
    Object.entries(pots).forEach(([name,obj]) => {
      const li=document.createElement('li');
      li.className='list-group-item bg-dark text-white d-flex align-items-center draggable';
      li.draggable = true;
      li.dataset.name = name;
      li.addEventListener('dragstart', e => { dragPotName = name; });
      li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', e => {
        e.preventDefault();
        const target = e.currentTarget.dataset.name;
        if (dragPotName && target && target !== dragPotName) {
          pots = reorderObjectByName(pots, dragPotName, target);
          dragPotName = null;
          renderAll();
        }
        li.classList.remove('drag-over');
      });
      const inpName=document.createElement('input');
      inpName.type='text';
      inpName.value=name;
      inpName.className='form-control me-2';
      inpName.style.maxWidth='30%';
      inpName.onchange=e=>{const nn=e.target.value.trim(); if(nn && nn!==name){ pots[nn]=obj; delete pots[name]; renderAll(); }};
      const bal=document.createElement('input');
      bal.type='number';
      bal.disabled=true;
      bal.className='form-control me-2';
      bal.style.maxWidth='30%';
      bal.value=(monthBalances[name]!==undefined?monthBalances[name]:obj.balance).toFixed(2);
      const btnUp=document.createElement('button');
      btnUp.className='btn btn-sm btn-secondary me-1';
      btnUp.textContent='▲';
      btnUp.onclick=_=>movePot(name,-1);
      const btnDown=document.createElement('button');
      btnDown.className='btn btn-sm btn-secondary me-1';
      btnDown.textContent='▼';
      btnDown.onclick=_=>movePot(name,1);
      const btnDel=document.createElement('button');
      btnDel.className='btn btn-sm btn-danger';
      btnDel.textContent='✖';
      btnDel.onclick=_=>{ if(confirm(`Verwijder ${name}?`)){ delete pots[name]; renderAll(); } };
      li.append(inpName, bal, btnUp, btnDown, btnDel);
      list.appendChild(li);
    });
    updatePotSelect();
  }

  function reorderObject(obj, key, dir) {
    const keys = Object.keys(obj);
    const idx = keys.indexOf(key);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= keys.length) return obj;
    [keys[idx], keys[newIdx]] = [keys[newIdx], keys[idx]];
    const res = {};
    keys.forEach(k => { res[k] = obj[k]; });
    return res;
  }

  function reorderObjectByName(obj, from, to) {
    const keys = Object.keys(obj);
    const fromIdx = keys.indexOf(from);
    const toIdx = keys.indexOf(to);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return obj;
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, from);
    const res = {};
    keys.forEach(k => { res[k] = obj[k]; });
    return res;
  }

  function moveAccount(name, dir) {
    accounts = reorderObject(accounts, name, dir);
    renderAll();
  }

  function movePot(name, dir) {
    pots = reorderObject(pots, name, dir);
    renderAll();
  }

  function updatePotSelect() {
    const sel = document.getElementById('transPot'); if(!sel) return; sel.innerHTML = '<option value="">(geen)</option>';
    Object.keys(pots).forEach(p => { const opt=document.createElement('option'); opt.value=p; opt.textContent=`${p} (€${pots[p].balance.toFixed(2)})`; sel.appendChild(opt); });
  }

  function updateAccountSelect() {
    const sel = document.getElementById('transAccount'); sel.innerHTML = '<option value="">(geen)</option>';
    Object.keys(accounts).forEach(acc => { const opt=document.createElement('option'); opt.value=acc; opt.textContent=`${acc} (€${accounts[acc].balance.toFixed(2)})`; sel.appendChild(opt); });
  }

  document.getElementById('addAccount').addEventListener('click', () => {
    const name = document.getElementById('newAccountName').value.trim(); const balance = parseFloat(document.getElementById('newAccountBalance').value);
    if (!name || isNaN(balance)) return;
    accounts[name] = { balance };
    renderAll();
    document.getElementById('newAccountName').value=''; document.getElementById('newAccountBalance').value='';
  });

  document.getElementById('addPot').addEventListener('click', () => {
    const name=document.getElementById('newPotName').value.trim(); const balance=parseFloat(document.getElementById('newPotBalance').value);
    if(!name || isNaN(balance)) return;
    pots[name] = { balance };
    renderAll();
    document.getElementById('newPotName').value=''; document.getElementById('newPotBalance').value='';
  });

  document.getElementById('addIncomeSub').addEventListener('click', () => {
    const val = prompt('Naam nieuwe subcategorie voor inkomen?');
    if(!val) return;
    const sel = document.getElementById('incomeSubType');
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = val;
    sel.appendChild(opt); sel.value = val;
  });

  document.getElementById('addExpenseSub').addEventListener('click', () => {
    const val = prompt('Naam nieuwe subcategorie voor uitgave?');
    if(!val) return;
    const sel = document.getElementById('expenseSubType');
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = val;
    sel.appendChild(opt); sel.value = val;
  });

  document.getElementById('fileInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text(); const parsed = JSON.parse(text);
      rawData = parsed.data || parsed; accounts = parsed.accounts || {}; pots = parsed.pots || {};
      currentYear = Object.keys(rawData)[0]; currentMonth = Object.keys(rawData[currentYear])[0];
      renderAll();
    } catch {
      initializeTemplate();
      renderAll();
    }
  });

  document.getElementById('downloadBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ data: rawData, accounts, pots }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='geldzaken.json'; a.click(); URL.revokeObjectURL(url);
  });

  window.addEventListener('DOMContentLoaded', () => { initializeTemplate(); renderAll(); });
