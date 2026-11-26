(function () {
  'use strict';

  const defaults = {
    signings: 25, sellingMonths: 6, term: 6, installment: 360, collection: 95,
    claim: 32, supply: 40, fixed: 13000, orderCost: 440,
    initialCash: 140000, setup: 36000, initialCredit: 10000,
  };
  const cases = {
    stop: defaults,
    opening: { ...defaults, term: 8, sellingMonths: 18, claim: 22, initialCredit: 0 },
    legacy: { ...defaults, signings: 0, initialCredit: 65000, setup: 0, fixed: 8000 },
  };
  const fields = [
    ['signings', '每月新签', '份', 0, 2000, 1],
    ['sellingMonths', '新签持续', '个月', 1, 24, 1],
    ['term', '每批扣款期数', '期', 1, 24, 1],
    ['installment', '每份每期应扣', '元', 0, 100000, 10],
    ['collection', '预计平均实收率', '%', 0, 100, 1],
    ['claim', '当月核销比例', '%', 0, 100, 1],
    ['supply', '实际供货成本率', '%', 0, 100, 1],
    ['fixed', '每月固定支出', '元', 0, 1000000, 500],
    ['orderCost', '每份新签当月现金支出', '元', 0, 100000, 10],
    ['initialCash', '期初现金', '元', 0, 10000000, 1000],
    ['setup', '启动时一次性支出', '元', 0, 10000000, 1000],
    ['initialCredit', '期初未核销余额', '元', 0, 10000000, 1000],
  ];
  const yuan = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
  const money = (amount) => yuan.format(amount);
  const wan = (amount) => `${dec.format(amount / 10000)} 万`;

  function simulate(parameters, months, rule) {
    const { signings, sellingMonths, term, installment, collection, claim, supply, fixed,
      orderCost, initialCash, setup, initialCredit } = parameters;
    const supplyRate = supply / 100;
    let cash = initialCash - setup;
    let credit = initialCredit;
    const rows = [];

    for (let month = 0; month <= months; month++) {
      const newContracts = month > 0 && month <= sellingMonths ? signings : 0;
      const activeBatches = month === 0 || signings === 0 ? 0 :
        Math.max(0, Math.min(month, sellingMonths) - Math.max(1, month - term + 1) + 1);
      const receipts = activeBatches * signings * installment * collection / 100;
      const openingCredit = credit;
      const eligibleCredit = openingCredit + receipts;
      const basis = rule === 'receipts' ? receipts : eligibleCredit;
      const redeemed = month > 0 ? Math.min(eligibleCredit, basis * claim / 100) : 0;
      const fulfillment = redeemed * supplyRate;
      const orderExpense = newContracts * orderCost;
      const fixedExpense = month > 0 ? fixed : 0;
      const operatingMovement = receipts - fulfillment - orderExpense - fixedExpense;
      credit = eligibleCredit - redeemed;
      cash += operatingMovement;
      const reserve = credit * supplyRate;
      rows.push({ month, newContracts, activeBatches, receipts, openingCredit, redeemed, fulfillment,
        orderExpense, fixedExpense, operatingMovement, cash, credit, reserve, available: cash - reserve });
    }

    return rows;
  }

  function firstZeroReceiptStockMonth(rows) {
    return rows.find((row) => row.month > 0 && row.receipts === 0 && row.openingCredit >= 0.01)?.month;
  }

  function fieldMarkup(field) {
    const [key, label, unit, minimum, maximum, step] = field;
    return `<label class="cf-field" for="cf-${key}"><span>${label}</span><span class="cf-input"><input name="${key}" id="cf-${key}" type="number" min="${minimum}" max="${maximum}" step="${step}" inputmode="decimal" value="${defaults[key]}"><span>${unit}</span></span></label>`;
  }

  function mountCashflow(root) {
    if (!root || root.dataset.mounted === 'true') return;
    root.dataset.mounted = 'true';
    root.classList.add('cf-app');
    root.innerHTML = `
      <section class="cf-mechanism" aria-labelledby="cf-mechanism-title">
        <div class="cf-mechanism-header">
          <div class="cf-month-receipt">
            <span><b data-cf="inlineMonth">第 11 月</b> · 两种规则当月到账</span>
            <h2 id="cf-mechanism-title"><span class="cf-sr-only">当月到账 </span><span data-cf="inlineReceipts"></span></h2>
          </div>
          <div class="cf-mechanism-controls" role="group" aria-label="查看上月或推进一个月">
            <button type="button" class="cf-rewind" data-ledger-step="-1" aria-label="回到上一个月">上一个月</button>
            <button type="button" class="cf-advance" data-ledger-step="1"><span data-cf="nextLabel">推进到第 12 月</span></button>
          </div>
          <p data-cf="mechanismStatus" class="cf-mechanism-status" aria-live="polite"></p>
        </div>
        <table class="cf-flow" aria-label="当前月份两种核销规则各自的资金账">
          <colgroup><col class="cf-flow-label"><col><col></colgroup>
          <thead><tr><td></td><th scope="col">原规则<small>只按当月到账核销</small></th><th scope="col">改进规则<small>按当月可用余额核销</small></th></tr></thead>
          <tbody>
            <tr><th scope="row">各自期初未核销余额</th><td data-cf="oldOpening"></td><td data-cf="newOpening"></td></tr>
            <tr><th scope="row">当月核销基数</th><td data-cf="oldBasis"></td><td data-cf="newBasis"></td></tr>
            <tr><th scope="row">当月核销<small data-cf="claimRate"></small></th><td data-cf="inlineOld"></td><td data-cf="inlineNew"></td></tr>
            <tr class="cf-flow-cash"><th scope="row">供货现金支出<small data-cf="supplyRate"></small></th><td data-cf="oldFulfillment"></td><td data-cf="inlineFulfillment"></td></tr>
          </tbody>
        </table>
        <div class="cf-conclusion"><p class="cf-observation" data-cf="observation"></p><span>核销差额 <b data-cf="inlineDelta"></b></span></div>
      </section>

      <section class="cf-stage" aria-labelledby="cf-chart-title">
        <div class="cf-stage-head">
          <h2 id="cf-chart-title">全期走势</h2>
          <div class="cf-presetbar" role="group" aria-label="模拟情景">
            <button type="button" data-preset="stop" aria-pressed="true">停止新签</button><button type="button" data-preset="opening" aria-pressed="false">持续新签</button><button type="button" data-preset="legacy" aria-pressed="false">只有存量</button>
          </div>
          <div class="cf-segment" role="group" aria-label="测算月数"><button type="button" data-length="18" aria-pressed="true">18 个月</button><button type="button" data-length="36" aria-pressed="false">36 个月</button></div>
        </div>
        <figure class="cf-plot">
          <div class="cf-plot-bar"><div class="cf-legend"><span><i></i>改进后账上现金</span><span><i></i>原规则账上现金</span><span><i></i>预留后可用资金</span></div><button type="button" class="cf-jump" data-jump-zero>跳到零回款月</button></div>
          <div class="cf-chart"><canvas tabindex="0" role="slider" aria-label="图上月份" aria-describedby="cf-drag-help" aria-valuemin="0" aria-valuemax="18" aria-valuenow="11"></canvas></div>
          <div class="cf-month-control">
            <button type="button" data-step-month="-1" aria-label="上一个月">‹</button>
            <label class="cf-month-slider" for="cf-month"><strong data-cf="month"></strong><input type="range" id="cf-month" min="0" max="18" value="11" aria-label="选择月份"><span data-cf="endMonth">第 18 月</span></label>
            <button type="button" data-step-month="1" aria-label="下一个月">›</button>
          </div>
          <figcaption id="cf-drag-help">点击或左右拖动图上月份。键盘可用方向键逐月核对。</figcaption>
        </figure>
        <div class="cf-stage-notice">
          <p data-cf="jumpResult" role="status" class="cf-jump-result"></p>
          <button type="button" class="cf-try-stock" data-use-stock hidden>试试「只有存量」</button>
        </div>
      </section>

      <div class="cf-kpis" aria-live="polite">
        <article class="cf-kpi"><span>期末账上现金</span><strong data-cf="cash">–</strong><small data-cf="cashNote"></small></article>
        <article class="cf-kpi"><span>期末预留后资金</span><strong data-cf="available">–</strong><small data-cf="reserveNote"></small></article>
        <article class="cf-kpi cf-kpi-emphasis"><span>期间最大补资缺口</span><strong data-cf="gap">–</strong><small data-cf="gapNote"></small></article>
      </div>

      <div class="cf-detail-grid">
        <details class="cf-disclosure cf-ledger" aria-live="polite">
          <summary><span data-cf="detailTitle">当月收支明细</span></summary>
          <div class="cf-detail-body">
            <p class="cf-detail-caption" data-cf="detailCaption"></p>
            <div class="cf-ledger-grid">
              <div><h4>现金收支</h4><dl><div><dt>合同回款</dt><dd data-cf="receipts"></dd></div><div><dt>商品供货支出</dt><dd data-cf="fulfillment"></dd></div><div><dt>新签相关支出</dt><dd data-cf="orderExpense"></dd></div><div><dt>固定支出</dt><dd data-cf="fixedExpense"></dd></div><div class="cf-ledger-total"><dt>本月经营净流入</dt><dd data-cf="movement"></dd></div></dl></div>
              <div><h4>供货责任</h4><dl><div><dt>月初未核销余额</dt><dd data-cf="openingCredit"></dd></div><div><dt>原规则核销</dt><dd data-cf="oldRedeemed"></dd></div><div><dt>改进规则核销</dt><dd data-cf="newRedeemed"></dd></div><div><dt>月底未核销余额</dt><dd data-cf="credit"></dd></div><div class="cf-ledger-total"><dt>按供货成本率预留</dt><dd data-cf="reserve"></dd></div></dl></div>
            </div>
          </div>
        </details>
        <details class="cf-disclosure cf-parameters">
          <summary>调整测算假设</summary>
          <div class="cf-detail-body">
            <div class="cf-parameters-title"><p>输入均为示例数据。修改参数后，图表会重算。</p><button type="button" class="cf-reset">重置</button></div>
            <div class="cf-field-list">${fields.map(fieldMarkup).join('')}</div>
          </div>
        </details>
      </div>
      <p class="cf-invariant">预留和实际供货使用同一成本率时，兑付同步降低账上现金和供货预留，预留后可用资金保持相同。页面只模拟现金收支和供货责任。<a class="cf-source" href="https://github.com/duntoyo-hub/pet-monthly-cashflow/blob/72e6cf414494d73f272d652d42b95f3c023b3004/index.html#L205" target="_blank" rel="noreferrer">查看原核销算式</a></p>`;

    const $ = (selector) => root.querySelector(selector);
    const all = (selector) => [...root.querySelectorAll(selector)];
    const output = Object.fromEntries(all('[data-cf]').map((element) => [element.dataset.cf, element]));
    const range = $('#cf-month');
    const canvas = $('canvas');
    const previousMonth = $('[data-step-month="-1"]');
    const nextMonth = $('[data-step-month="1"]');
    const stepBack = $('[data-ledger-step="-1"]');
    const stepAhead = $('[data-ledger-step="1"]');
    const tryStock = $('[data-use-stock]');
    const inputByKey = Object.fromEntries(all('input[type=number]').map((input) => [input.name, input]));
    const state = { parameters: { ...defaults }, months: 18, selected: 11, oldRows: [], newRows: [] };
    const plot = { left: 48, right: 24, top: 35, bottom: 29 };
    let dragPointer = null;

    const write = (key, value) => { output[key].textContent = value; };
    const setPressed = (selector, key, value) => all(selector).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset[key] === String(value)));
    });

    function drawChart() {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (w === 0 || h === 0 || state.newRows.length === 0) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const scale = Math.min(globalThis.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      context.scale(scale, scale);

      const values = [0, ...state.newRows.map((row) => row.cash), ...state.newRows.map((row) => row.available), ...state.oldRows.map((row) => row.cash)];
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const spread = Math.max(maximum - minimum, 1000);
      const lo = minimum - spread * 0.08;
      const hi = maximum + spread * 0.08;
      const y = (value) => plot.top + (hi - value) / (hi - lo) * (h - plot.top - plot.bottom);
      const x = (month) => plot.left + month / state.months * (w - plot.left - plot.right);
      const sum = (v) => `${dec.format(v / 10000)}万`;
      const selectedX = x(state.selected);
      const currentRow = state.newRows[state.selected];
      context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      for (let tick = 0; tick <= 4; tick++) {
        const value = lo + (hi - lo) * tick / 4;
        context.strokeStyle = '#383939';
        context.beginPath();
        context.moveTo(plot.left, y(value));
        context.lineTo(w - plot.right, y(value));
        context.stroke();
        context.fillStyle = '#b4b3b1';
        context.fillText(sum(value), plot.left - 7, y(value), plot.left - 7);
      }
      context.strokeStyle = '#6b6b6b';
      context.beginPath();
      context.moveTo(plot.left, y(0));
      context.lineTo(w - plot.right, y(0));
      context.stroke();
      context.textAlign = 'center';
      for (let month = 0; month <= state.months; month += state.months / 6) {
        context.fillStyle = '#b4b3b1';
        context.fillText(`${month}月`, x(month), h - 12);
      }
      const paintLine = (rows, key, color, dash = []) => {
        context.lineWidth = 2.2;
        context.strokeStyle = color;
        context.setLineDash(dash);
        context.beginPath();
        rows.forEach((row, index) => {
          if (index === 0) context.moveTo(x(row.month), y(row[key]));
          else context.lineTo(x(row.month), y(row[key]));
        });
        context.stroke();
        context.setLineDash([]);
      };
      paintLine(state.newRows, 'available', '#999d9d');
      paintLine(state.oldRows, 'cash', '#c0c6ca', [5, 5]);
      paintLine(state.newRows, 'cash', '#f1ede4');
      context.strokeStyle = '#eec885';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(selectedX, plot.top - 5);
      context.lineTo(selectedX, h - plot.bottom);
      context.stroke();
      const label = state.selected === 0 ? '开业时' : currentRow.receipts === 0 ? `第 ${state.selected} 月 · 零回款` : `第 ${state.selected} 月`;
      context.font = '650 12px -apple-system, BlinkMacSystemFont, sans-serif';
      context.fillStyle = '#eec885';
      const labelHalf = context.measureText(label).width / 2;
      const labelX = Math.min(w - labelHalf - 2, Math.max(labelHalf + 2, selectedX));
      context.fillText(label, labelX, plot.top - 16);
      for (const [value, color] of [[state.oldRows[state.selected].cash, '#c0c6ca'], [currentRow.available, '#999d9d'], [currentRow.cash, '#f1ede4']]) {
        context.fillStyle = color;
        context.strokeStyle = '#171819';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(selectedX, y(value), 4.5, 0, Math.PI * 2);
        context.stroke();
        context.fill();
      }
    }

    function showMonth() {
      const { selected, newRows, oldRows, parameters } = state;
      const row = newRows[selected];
      const previous = oldRows[selected];
      const monthLabel = selected ? `第 ${selected} 月` : '开业时';
      write('month', monthLabel);
      write('inlineMonth', monthLabel);
      write('inlineReceipts', money(row.receipts));
      write('oldOpening', money(previous.openingCredit));
      write('newOpening', money(row.openingCredit));
      write('oldBasis', money(previous.receipts));
      write('newBasis', money(row.openingCredit + row.receipts));
      write('claimRate', `基数 × ${parameters.claim}%`);
      write('supplyRate', `核销 × ${parameters.supply}%`);
      write('inlineOld', money(previous.redeemed));
      write('inlineNew', money(row.redeemed));
      const delta = Math.round(row.redeemed - previous.redeemed);
      write('inlineDelta', delta > 0 ? `+${money(delta)}` : money(delta));
      write('oldFulfillment', money(previous.fulfillment));
      write('inlineFulfillment', money(row.fulfillment));
      write('nextLabel', selected < state.months ? `推进到第 ${selected + 1} 月` : '已到最后一月');
      const nextRow = newRows[selected + 1];
      const lastReceipt = selected > 0 && row.receipts > 0 && nextRow && nextRow.receipts === 0 && row.newContracts === 0;
      const firstZero = selected > 0 && row.receipts === 0 && newRows[selected - 1].receipts > 0;
      write('mechanismStatus', lastReceipt ? '最后一次到账。向后一步，看看余额仍在时会发生什么。' :
        firstZero ? `上月到账 ${money(newRows[selected - 1].receipts)}，本月归零。` : '');
      write('detailTitle', selected ? `${monthLabel} · 收支明细` : '开业时 · 起始资金');
      write('detailCaption', selected ? `${row.newContracts} 份新签 · ${row.activeBatches} 批合同在扣款期内` : `启动支出 ${money(parameters.setup)}，计入期初现金。`);
      for (const [key, amount] of Object.entries({
        receipts: row.receipts, fulfillment: row.fulfillment, orderExpense: row.orderExpense,
        fixedExpense: row.fixedExpense, movement: row.operatingMovement, openingCredit: row.openingCredit,
        oldRedeemed: previous.redeemed, newRedeemed: row.redeemed, credit: row.credit, reserve: row.reserve,
      })) write(key, money(amount));
      if (selected === 0) {
        write('observation', '期初余额沿各自规则向后结转。');
      } else if (row.receipts === 0 && row.redeemed > 0) {
        write('observation', '当月回款为零，改进规则仍估算会动用历史余额供货。');
      } else {
        write('observation', '两列沿各自规则累积余额，共用同月的模拟到账。');
      }
      range.setAttribute('aria-valuetext', monthLabel);
      canvas.setAttribute('aria-valuemax', String(state.months));
      canvas.setAttribute('aria-valuenow', String(selected));
      canvas.setAttribute('aria-valuetext', `${monthLabel}，回款 ${money(row.receipts)}，原规则核销 ${money(previous.redeemed)}，改进规则核销 ${money(row.redeemed)}`);
      previousMonth.disabled = selected === 0;
      nextMonth.disabled = selected === state.months;
      stepBack.disabled = selected === 0;
      stepAhead.disabled = selected === state.months;
      drawChart();
    }

    function selectMonth(month, redraw = false) {
      const selected = Math.max(0, Math.min(state.months, month));
      if (!redraw && selected === state.selected) return;
      state.selected = selected;
      range.value = String(state.selected);
      write('jumpResult', '');
      tryStock.hidden = true;
      showMonth();
    }

    function jumpToZeroReceipts() {
      const month = firstZeroReceiptStockMonth(state.newRows);
      tryStock.hidden = month !== undefined;
      if (month === undefined) {
        write('jumpResult', '这段测算里没有同时满足零回款、仍有待供货余额的月份。');
        return;
      }
      selectMonth(month);
      write('jumpResult', `第 ${month} 月回款为零，月初仍有 ${money(state.newRows[month].openingCredit)} 的未核销余额。`);
    }

    function render() {
      const { parameters, months } = state;
      state.newRows = simulate(parameters, months, 'balance');
      state.oldRows = simulate(parameters, months, 'receipts');
      const final = state.newRows.at(-1);
      const gapRow = state.newRows.reduce((lowest, row) => row.available < lowest.available ? row : lowest);
      write('cash', wan(final.cash));
      write('available', wan(final.available));
      write('gap', wan(Math.max(0, -gapRow.available)));
      write('cashNote', `第 ${months} 月月底`);
      write('reserveNote', `当月末预留 ${money(final.reserve)}`);
      write('gapNote', gapRow.available < 0 ? (gapRow.month ? `第 ${gapRow.month} 月达到低点` : '开业时达到低点') : '本情景无额外资金缺口');
      write('endMonth', `第 ${months} 月`);
      range.max = String(months);
      write('jumpResult', '');
      tryStock.hidden = true;
      selectMonth(state.selected, true);
    }

    function preset(key) {
      state.parameters = { ...cases[key] };
      state.selected = { stop: 11, opening: 6, legacy: 1 }[key];
      Object.entries(state.parameters).forEach(([name, value]) => { inputByKey[name].value = String(value); });
      all('input[type=number]').forEach((input) => input.removeAttribute('aria-invalid'));
      setPressed('[data-preset]', 'preset', key);
      render();
    }

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-jump-zero')) return jumpToZeroReceipts();
      if (button.hasAttribute('data-use-stock')) {
        preset('legacy');
        $('[data-preset="legacy"]').focus();
        return;
      }
      if (button.dataset.ledgerStep) return selectMonth(state.selected + Number(button.dataset.ledgerStep));
      if (button.dataset.stepMonth) return selectMonth(state.selected + Number(button.dataset.stepMonth));
      if (button.dataset.preset) preset(button.dataset.preset);
      if (button.dataset.length) {
        state.months = Number(button.dataset.length);
        state.selected = Math.min(state.selected, state.months);
        setPressed('[data-length]', 'length', state.months);
        render();
      }
      if (button.classList.contains('cf-reset')) {
        state.months = 18;
        setPressed('[data-length]', 'length', state.months);
        preset('stop');
      }
    });
    function acceptInputs(event) {
      const input = event.target;
      if (input.type !== 'number') return;
      const value = input.valueAsNumber;
      const valid = Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max) && Number.isInteger(value);
      if (!valid) {
        input.setAttribute('aria-invalid', 'true');
        if (event.type === 'change') {
          input.value = String(state.parameters[input.name]);
          input.removeAttribute('aria-invalid');
        }
        return;
      }
      input.removeAttribute('aria-invalid');
      state.parameters[input.name] = value;
      setPressed('[data-preset]', 'preset', '');
      render();
    }
    root.addEventListener('input', acceptInputs);
    root.addEventListener('change', acceptInputs);
    range.addEventListener('input', () => selectMonth(Number(range.value)));
    function selectAtX(clientX) {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width - plot.left - plot.right;
      if (width > 0) selectMonth(Math.round((clientX - rect.left - plot.left) / width * state.months));
    }
    canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      dragPointer = event.pointerId;
      canvas.setPointerCapture(dragPointer);
      canvas.focus({ preventScroll: true });
      selectAtX(event.clientX);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId === dragPointer) selectAtX(event.clientX);
    });
    const endDrag = (event) => {
      if (event.pointerId === dragPointer) dragPointer = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    canvas.addEventListener('keydown', (event) => {
      const targets = { ArrowLeft: state.selected - 1, ArrowDown: state.selected - 1,
        ArrowRight: state.selected + 1, ArrowUp: state.selected + 1, Home: 0, End: state.months };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      selectMonth(targets[event.key]);
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(drawChart).observe(canvas);
    render();
  }

  globalThis.mountCashflow = mountCashflow;
  if (typeof module !== 'undefined' && module.exports) module.exports = { simulate, cases, firstZeroReceiptStockMonth };
}());
