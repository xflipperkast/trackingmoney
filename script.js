  const monthOrder = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  let rawData, currentYear, currentMonth, accounts, pots, editing;

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
          const nYear = next.getFullYear();
          const nMonthIdx = next.getMonth();
          if (nYear > cYear || (nYear === cYear && nMonthIdx > cMonthIdx)) return;
          const iso = next.toISOString().split('T')[0];
          const nMonthName = monthOrder[nMonthIdx];
          if (!rawData[nYear]) rawData[nYear] = {};
          if (!rawData[nYear][nMonthName]) rawData[nYear][nMonthName] = [];
          const exists = rawData[nYear][nMonthName].some(r => r.Datum === iso && r.Omschrijving === row.Omschrijving);
          if (!exists) {
            rawData[nYear][nMonthName].push({ ...row, Datum: iso });
            if (row.Rekening && accounts[row.Rekening]) {
              accounts[row.Rekening].balance += row.Type === 'inkomen' ? row.Bedrag : -row.Bedrag;
            }
            if (row.Pot && pots[row.Pot]) {
              pots[row.Pot].balance += row.Type === 'inkomen' ? row.Bedrag : -row.Bedrag;
            }
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
            netAfter += r.Type === 'inkomen' ? v : -v;
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
          bal += r.Type === 'inkomen' ? v : -v;
        });
      }
      if (m === month) break;
    }
    return bal;
  }

  // Render transactions table
  function renderTransactions() {
    const container = document.getElementById('transactionsContainer'); container.innerHTML = '';
    if (!rawData[currentYear]) rawData[currentYear] = {};
    if (!rawData[currentYear][currentMonth]) rawData[currentYear][currentMonth] = [];

    const monthRows = rawData[currentYear][currentMonth];
    const totalBal = computeMonthEndBalance(currentYear, currentMonth);
    const salary = monthRows.filter(r=>r.Type==='inkomen' && r.SubType==='salaris').reduce((s,r)=>s+parseFloat(r.Bedrag),0);
    const expenses = monthRows.filter(r=>r.Type==='uitgave').reduce((s,r)=>s+parseFloat(r.Bedrag),0);
    const net = monthRows.reduce((s,r)=>s+(r.Type==='inkomen'?parseFloat(r.Bedrag):-parseFloat(r.Bedrag)),0);
    const startYear = computeYearStartBalance(currentYear);

    const infoTop = document.createElement('div');
    infoTop.className = 'mb-2';
    infoTop.textContent = `Totaal saldo: €${totalBal.toFixed(2)} (Begin jaar: €${startYear.toFixed(2)})`;
    container.appendChild(infoTop);

    if(Object.keys(pots).length){
      const infoPots=document.createElement('div');
      infoPots.className='mb-2';
      infoPots.textContent='Potten: '+Object.entries(pots).map(([n,o])=>`${n}: €${o.balance.toFixed(2)}`).join(' | ');
      container.appendChild(infoPots);
    }

    const table = document.createElement('table'); table.className = 'table table-dark table-bordered';
    const thead = document.createElement('thead'), headRow = document.createElement('tr');
    ['Datum','Omschrijving','Bedrag','Type','SubType','Rekening','Acties'].forEach(h => { const th = document.createElement('th'); th.textContent = h; headRow.appendChild(th); });
    thead.appendChild(headRow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rawData[currentYear][currentMonth].forEach((row, i) => {
      const tr = document.createElement('tr'); tr.className = parseFloat(row.Bedrag) < 0 ? 'negative' : 'positive';
      ['Datum','Omschrijving','Bedrag','Type','SubType','Rekening'].forEach(k => { const td = document.createElement('td'); td.textContent = row[k] || ''; tr.appendChild(td); });
      const tdAct = document.createElement('td'); const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-warning'; btn.textContent = '✏️'; btn.onclick = () => openEdit(i);
      tdAct.appendChild(btn); tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); container.appendChild(table);

    const infoBottom = document.createElement('div');
    infoBottom.className = 'mt-2';
    const diff = salary - expenses;
    infoBottom.innerHTML = `Salaris: €${salary.toFixed(2)} | Uitgaven: €${expenses.toFixed(2)} | Verschil deze maand: €${net.toFixed(2)} | Over van salaris: <span class="${diff < 0 ? 'text-danger' : 'text-success'}">€${diff.toFixed(2)}</span>`;
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
    new bootstrap.Modal(document.getElementById('transactionModal')).show();
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
  });

  // Show subtype based on type selection
  document.getElementById('transType').addEventListener('change', () => {
    const val = document.getElementById('transType').value;
    document.getElementById('incomeSubTypeWrapper').style.display = val === 'inkomen' ? 'block' : 'none';
    document.getElementById('expenseSubTypeWrapper').style.display = val === 'uitgave' ? 'block' : 'none';
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
    if (!date || !desc || isNaN(amt) || !type) return alert('Vul alle velden in');
    const d = new Date(date); const y = d.getFullYear().toString(); const m = d.toLocaleString('nl-NL',{month:'long'});
    if (!rawData[y]) rawData[y] = {};
    if (!rawData[y][m]) rawData[y][m] = [];
    const sub = type === 'inkomen' ? subIncome : (type === 'uitgave' ? subExpense : null);
    const newRow = { Datum: date, Omschrijving: desc, Bedrag: amt, Type: type, SubType: sub, Herhaal: rec, Rekening: acc, Pot: pot };
    if (editing !== null) {
      const old = rawData[editing.year][editing.month][editing.index];
      accounts[old.Rekening].balance -= (old.Type === 'inkomen' ? old.Bedrag : -old.Bedrag);
      if (old.Pot && pots[old.Pot]) pots[old.Pot].balance -= (old.Type === 'inkomen' ? old.Bedrag : -old.Bedrag);
      rawData[editing.year][editing.month][editing.index] = newRow;
      editing = null;
    } else rawData[y][m].push(newRow);
    if (acc && accounts[acc]) accounts[acc].balance += (type === 'inkomen' ? amt : -amt);
    if (pot && pots[pot]) pots[pot].balance += (type === 'inkomen' ? amt : -amt);
    renderAll();
    bootstrap.Modal.getInstance(document.getElementById('transactionModal')).hide();
  });

  // Accounts management
  function updateAccountList() {
    const list = document.getElementById('accountList'); list.innerHTML = '';
    Object.entries(accounts).forEach(([name,obj]) => {
      const li = document.createElement('li'); li.className='list-group-item bg-dark text-white d-flex align-items-center';
      const inpName = document.createElement('input'); inpName.type='text'; inpName.value=name; inpName.className='form-control me-2'; inpName.style.maxWidth='30%';
      inpName.onchange=e => { const nn=e.target.value.trim(); if (nn && nn!==name) { accounts[nn] = obj; delete accounts[name]; renderAll(); } };
      const inpBal = document.createElement('input'); inpBal.type='number'; inpBal.value=obj.balance.toFixed(2); inpBal.className='form-control me-2'; inpBal.style.maxWidth='30%';
      inpBal.onchange=e => { accounts[name].balance = parseFloat(e.target.value); renderAll(); };
      const btnDel = document.createElement('button'); btnDel.className='btn btn-sm btn-danger'; btnDel.textContent='✖'; btnDel.onclick=_ => { if (confirm(`Verwijder ${name}?`)) { delete accounts[name]; renderAll(); } };
      li.append(inpName, inpBal, btnDel); list.appendChild(li);
    });
    updateAccountSelect();
  }

  function updatePotList() {
    const list = document.getElementById('potList'); if(!list) return; list.innerHTML = '';
    Object.entries(pots).forEach(([name,obj]) => {
      const li=document.createElement('li'); li.className='list-group-item bg-dark text-white d-flex align-items-center';
      const inpName=document.createElement('input'); inpName.type='text'; inpName.value=name; inpName.className='form-control me-2'; inpName.style.maxWidth='30%';
      inpName.onchange=e=>{const nn=e.target.value.trim(); if(nn && nn!==name){ pots[nn]=obj; delete pots[name]; renderAll(); }};
      const inpBal=document.createElement('input'); inpBal.type='number'; inpBal.value=obj.balance.toFixed(2); inpBal.className='form-control me-2'; inpBal.style.maxWidth='30%';
      inpBal.onchange=e=>{ pots[name].balance=parseFloat(e.target.value); renderAll(); };
      const btnDel=document.createElement('button'); btnDel.className='btn btn-sm btn-danger'; btnDel.textContent='✖'; btnDel.onclick=_=>{ if(confirm(`Verwijder ${name}?`)){ delete pots[name]; renderAll(); } };
      li.append(inpName, inpBal, btnDel); list.appendChild(li);
    });
    updatePotSelect();
  }

  function updatePotSelect() {
    const sel = document.getElementById('transPot'); if(!sel) return; sel.innerHTML = '<option value="">(geen)</option>';
    Object.keys(pots).forEach(p => { const opt=document.createElement('option'); opt.value=p; opt.textContent=`${p} (€${pots[p].balance.toFixed(2)})`; sel.appendChild(opt); });
  }

  function updateAccountSelect() {
    const sel = document.getElementById('transAccount'); sel.innerHTML = '';
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
