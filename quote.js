(function () {
  'use strict';

  const products = [
    { id: 'base', name: '门店管理套件', note: '会员、订单、收银', price: 3600, billing: 'annual' },
    { id: 'stock', name: '库存管理模块', note: '进出库和低库存提醒', price: 1200, billing: 'annual' },
    { id: 'insight', name: '经营报表模块', note: '跨门店经营对比', price: 1800, billing: 'annual' },
    { id: 'setup', name: '实施和培训', note: '配置门店和培训员工', price: 1600, billing: 'once' },
    { id: 'migration', name: '历史资料迁移', note: '导入会员和商品档案', price: 800, billing: 'once' }
  ];

  const presets = [
    { name: '一店开业', client: '云爪宠物店', years: 1, discount: 0, quantities: { base: 1, stock: 1, setup: 1 } },
    { name: '三店连锁', client: '小岛宠物连锁', years: 2, discount: 10, quantities: { base: 3, stock: 3, insight: 3, setup: 3, migration: 3 } },
    { name: '旧店迁移', client: '拾力训练工作室', years: 1, discount: 5, quantities: { base: 1, insight: 1, setup: 1, migration: 1 } }
  ];
  const presetLabels = ['宠物店首店', '宠物品牌连锁', '健身工作室'];
  const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const money = (cents) => currency.format(cents / 100);

  function initialState(index) {
    const preset = presets[index];
    return { preset: index, client: preset.client, years: preset.years, discount: preset.discount, quantities: { ...preset.quantities } };
  }

  function calculate(state) {
    const lines = products.map((item) => {
      const qty = state.quantities[item.id] || 0;
      return { ...item, qty, cents: item.price * qty * 100 };
    }).filter((item) => item.qty > 0);
    const annual = lines.filter((item) => item.billing === 'annual').reduce((sum, item) => sum + item.cents, 0);
    const once = lines.filter((item) => item.billing === 'once').reduce((sum, item) => sum + item.cents, 0);
    const saving = Math.round(annual * state.discount / 100);
    const yearly = annual - saving;
    return { lines, once, saving, yearly, firstYear: yearly + once, total: yearly * state.years + once };
  }

  function compareVersions(baseline, current, currentTotals) {
    const before = calculate(baseline);
    return {
      baselineTotal: before.total,
      delta: currentTotals.total - before.total,
      softwareDelta: currentTotals.yearly * current.years - before.yearly * baseline.years,
      serviceDelta: currentTotals.once - before.once,
      firstYearDelta: currentTotals.firstYear - before.firstYear,
      changes: [
        { label: '客户', from: baseline.client.trim() || '未填写', to: current.client.trim() || '未填写' },
        { label: '合同期限', from: `${baseline.years} 年`, to: `${current.years} 年` },
        { label: '订阅优惠', from: `${baseline.discount}%`, to: `${current.discount}%` },
        ...products.map(({ id, name }) => ({ label: name, from: `${baseline.quantities[id] || 0} 店`, to: `${current.quantities[id] || 0} 店` }))
      ].filter(({ from, to }) => from !== to)
    };
  }

  function saveVersion(state) {
    return { ...state, quantities: { ...state.quantities } };
  }

  function adjustMatchingStores(state, step) {
    const quantities = Object.fromEntries(Object.entries(state.quantities).map(([id, qty]) => [id, qty > 0 ? Math.min(99, Math.max(1, qty + step)) : 0]));
    return { ...state, quantities };
  }

  function moneyDelta(cents) {
    if (cents === 0) return '持平';
    return `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`;
  }

  const escape = (text) => String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function productRows() {
    return products.map((item, index) => `
      ${index === 0 ? '<h4>软件订阅 <span>每年</span></h4>' : ''}
      ${index === 3 ? '<h4>交付服务 <span>一次性</span></h4>' : ''}
      <div class="oq-product" data-quote-product="${item.id}">
        <div>
          <strong>${item.name}</strong>
          <small>${item.note} · ${money(item.price * 100)} / 店</small>
        </div>
        <div class="oq-quantity">
          <button type="button" data-quote-step="-1" data-product="${item.id}" aria-label="减少${item.name}数量">−</button>
          <input type="number" inputmode="numeric" min="0" max="99" step="1" aria-label="${item.name}" aria-describedby="oq-quantity-help" data-quote-count="${item.id}">
          <button type="button" data-quote-step="1" data-product="${item.id}" aria-label="增加${item.name}数量">+</button>
        </div>
      </div>`).join('');
  }

  function documentHeader(headingLevel) {
    return `<header class="oq-document-head">
      <div><span class="oq-document-label" lang="en">Sales quotation</span><${headingLevel}>销售报价单</${headingLevel}></div>
      <span class="oq-document-flag">报价示例</span>
    </header>`;
  }

  function documentMeta(state) {
    return `<dl class="oq-document-meta">
        <div><dt>客户</dt><dd>${escape(state.client.trim() || '未填写')}</dd></div>
        <div><dt>合同期限</dt><dd>${state.years} 年</dd></div>
      </dl>`;
  }

  function documentTotal(state, totals, interactive = false) {
    return `<div class="oq-document-total"><span>${state.years} 年合同总额</span><strong${interactive ? ' data-quote-quick-current' : ''}>${money(totals.total)}</strong></div>`;
  }

  function documentItems(state, totals, reference) {
    const rows = totals.lines.map(({ id, name, billing, qty, cents }) => {
      const change = reference ? qty - (reference.quantities[id] || 0) : 0;
      return `<tr${change ? ' class="oq-line-changed"' : ''}>
        <td>${name}</td>
        <td>${billing === 'annual' ? '年付' : '一次性'}</td>
        <td>${qty} 店${change ? ` <span class="oq-line-change">${change > 0 ? '+' : '−'}${Math.abs(change)}</span>` : ''}</td>
        <td>${money(cents)}</td>
      </tr>`;
    }).join('');
    return `<div class="oq-table-scroll">
        <table class="oq-document-table">
          <thead><tr><th scope="col">项目</th><th scope="col">周期</th><th scope="col">数量</th><th scope="col">折前小计</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">选配一项产品，即可生成报价。</td></tr>'}</tbody>
        </table>
      </div>
      <dl class="oq-document-costs">
        <div><dt>订阅优惠 / 年</dt><dd>${state.discount}% <span>−${money(totals.saving)}</span></dd></div>
        <div><dt>优惠后订阅 / 年</dt><dd>${money(totals.yearly)}</dd></div>
        <div><dt>一次性服务</dt><dd>${money(totals.once)}</dd></div>
        <div><dt>首年费用</dt><dd>${money(totals.firstYear)}</dd></div>
        ${state.years > 1 ? `<div><dt>第 2 年起 / 年</dt><dd>${money(totals.yearly)}</dd></div>` : ''}
      </dl>
      ${reference ? '' : documentTotal(state, totals)}
      <p class="oq-document-note">订阅优惠按年计算，一次性服务仅计入首年。客户及价格均为示例。</p>`;
  }

  function documentMarkup(state, totals, headingLevel = 'h1') {
    return documentHeader(headingLevel) + documentMeta(state) + documentItems(state, totals);
  }

  const portableStyle = `
    body { color: #25211d; background: #fff; font: 16px/1.5 system-ui, sans-serif; margin: 0; }
    .oq-print-document { width: min(100%, 790px); margin: 0 auto; padding: 40px 28px; box-sizing: border-box; }
    .oq-document-head, .oq-document-meta, .oq-document-costs > div, .oq-document-total { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; }
    h1 { margin: 4px 0 .5em; font-size: 35px; font-family: "Songti SC", "Noto Serif SC", serif; }
    .oq-document-label { font: 650 10px/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .15em; }
    .oq-document-flag, .oq-document-note { color: #4d5f54; font-size: 13px; }
    .oq-document-meta { border-top: 1px solid #b7c1b1; padding: 12px 0 6px; }
    .oq-document-meta dd, .oq-document-costs dd { margin: 0; }
    .oq-document-meta dt { color: #4d5f54; font-size: 13px; }
    .oq-document-meta dd { font-weight: 650; overflow-wrap: anywhere; }
    .oq-document-table { border-collapse: collapse; width: 100%; margin-top: 15px; }
    .oq-document-table th, .oq-document-table td { padding: 7px 4px; text-align: left; border-bottom: 1px solid #bbc4b7; }
    .oq-document-table tr > :last-child { text-align: right; }
    .oq-document-costs { display: grid; gap: 4px; margin: 15px 0; }
    .oq-document-total { padding: 12px 0; border-block: 1px solid #25211d; color: #a13a2b; }
    .oq-document-total strong { font-size: 27px; }
    @media print { @page { margin: 14mm; } .oq-print-document { padding: 0; } }
  `;

  function portableQuote(state, totals) {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>销售报价单</title><style>${portableStyle}</style></head><body><main class="oq-print-document">${documentMarkup(state, totals, 'h1')}</main></body></html>`;
  }

  function downloadQuote(state, totals) {
    const blob = new Blob([portableQuote(state, totals)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '销售报价单-当前版本.html';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printQuote(state, totals) {
    const sheet = document.createElement('section');
    sheet.className = 'oq-print-sheet';
    sheet.innerHTML = `<style media="print">
      ${portableStyle}
      body.oq-printing { color-scheme: light; color: #25211d !important; background: #fff !important; }
      body.oq-printing > :not(.oq-print-sheet) { display: none !important; }
      body.oq-printing .oq-print-sheet { display: block !important; }
      </style><main class="oq-print-document">${documentMarkup(state, totals, 'h1')}</main>`;
    function cleanup() {
      sheet.remove();
      document.body.classList.remove('oq-printing');
    }
    document.body.append(sheet);
    document.body.classList.add('oq-printing');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }

  function mountQuote(root) {
    if (!root || root.dataset.quoteMounted) return;
    root.dataset.quoteMounted = 'true';
    let state = initialState(1);
    let baseline = null;

    root.innerHTML = `
      <div class="oq-layout">
        <div class="oq-stage">
          <section class="oq-preview" aria-labelledby="oq-live-title">
            <h3 id="oq-live-title" class="oq-sr-only">实时报价</h3>
            <article class="oq-document" data-quote-document tabindex="-1">
              ${documentHeader('h3')}
              <div class="oq-document-fields">
                <div data-quote-document-meta></div>
                <div class="oq-inline-edit">
                  <span class="oq-inline-label">门店数量</span>
                  <div class="oq-quick-stepper" role="group" aria-label="调整门店数量">
                    <button type="button" data-quote-action="reduce" aria-label="减少一家门店">−</button>
                    <span class="oq-store-reading"><strong data-quote-stores></strong><span>店</span></span>
                    <button type="button" data-quote-action="expand" aria-label="模拟新增一家店">+</button>
                  </div>
                </div>
              </div>
              <div class="oq-document-total-slot" data-quote-document-total></div>
              <div class="oq-impact">
                <div class="oq-impact-main"><span data-quote-quick-reference-label>报价差额</span><strong data-quote-quick-delta></strong></div>
                <div class="oq-impact-detail" data-quote-impact-detail hidden>
                  <span><span data-quote-software-label>合同软件费</span> <b data-quote-software-delta></b></span>
                  <span>一次性费用 <b data-quote-service-delta></b></span>
                </div>
                <div class="oq-quick-forecast" data-quote-next></div>
              </div>
              <div data-quote-document-items></div>
              <p class="oq-sr-only" data-quote-status role="status"></p>
            </article>
            <div class="oq-output-actions">
              <button type="button" class="oq-text oq-edit-link" data-quote-action="open-config">调整明细</button>
              <button type="button" class="oq-text" data-quote-action="print">打印</button>
              <button type="button" class="oq-button oq-download" data-quote-action="download">下载报价单</button>
            </div>
          </section>
        </div>

        <details class="oq-config">
          <summary id="oq-config-title">逐项配置</summary>
          <div class="oq-config-body">
          <header class="oq-section-header"><h3>方案与报价条件</h3><button type="button" class="oq-text" data-quote-action="reset">重置方案</button></header>
          <div class="oq-presets" role="group" aria-label="模拟客户场景">
            ${presets.map(({ name }, index) => `<button type="button" data-quote-preset="${index}" aria-pressed="false">${name}</button>`).join('')}
          </div>
          <div class="oq-fields">
            <label>客户名称<input data-quote-client maxlength="60" autocomplete="off"></label>
            <label>合同期限<select data-quote-years><option value="1">1 年</option><option value="2">2 年</option><option value="3">3 年</option></select></label>
            <label>订阅优惠<span class="oq-discount-input"><input data-quote-discount type="number" min="0" max="100" step="1" inputmode="numeric" aria-label="订阅优惠百分比" aria-describedby="oq-discount-help"><span aria-hidden="true">%</span></span></label>
          </div>
          <p id="oq-discount-help" class="oq-muted">订阅优惠只作用于每年软件费。</p>
          <div class="oq-products">${productRows()}</div>
          <p id="oq-quantity-help" class="oq-sr-only">填写 0 至 99 的整数。数量为 0 时不计费。</p>
          <p class="oq-validation" data-quote-validation role="status" hidden></p>
          </div>
        </details>

        <section class="oq-compare" aria-labelledby="oq-compare-title">
          <header class="oq-compare-bar">
            <div><h3 id="oq-compare-title">版本对比</h3><p data-quote-compare-help></p></div>
            <div class="oq-compare-actions">
              <button type="button" class="oq-text" data-quote-action="clear" hidden>清除基准</button>
              <button type="button" class="oq-button oq-save" data-quote-action="save">保存基准</button>
            </div>
          </header>
          <div class="oq-compare-body" data-quote-compare-body hidden>
            <dl class="oq-compare-totals">
              <div><dt>基准合同总额</dt><dd data-quote-baseline-total></dd></div>
              <div><dt>当前合同总额</dt><dd data-quote-current-total></dd></div>
              <div><dt>合同总额变化</dt><dd data-quote-delta></dd></div>
              <div><dt>首年费用变化</dt><dd data-quote-first-year-delta></dd></div>
            </dl>
            <ul class="oq-changes" data-quote-changes></ul>
          </div>
        </section>
      </div>`;

    const find = (selector) => root.querySelector(selector);
    const client = find('[data-quote-client]');
    const years = find('[data-quote-years]');
    const discount = find('[data-quote-discount]');
    const validation = find('[data-quote-validation]');
    const compareBody = find('[data-quote-compare-body]');
    const compareHelp = find('[data-quote-compare-help]');
    const status = find('[data-quote-status]');
    const config = find('.oq-config');
    const action = (name) => find(`[data-quote-action="${name}"]`);
    const count = (id) => find(`[data-quote-count="${id}"]`);
    let renderedTotals;

    function renderComparison() {
      const hasBaseline = baseline !== null;
      compareBody.hidden = !hasBaseline;
      action('clear').hidden = !hasBaseline;
      action('save').textContent = hasBaseline ? '以当前报价更新基准' : '保存基准';
      if (!baseline) {
        compareHelp.textContent = '保存当前报价再调整，或直接模拟扩店并比较。';
        return;
      }

      const diff = compareVersions(baseline, state, renderedTotals);
      compareHelp.textContent = diff.changes.length === 0
        ? '当前报价与基准一致。'
        : '对比仅在工作台显示，下载或打印时使用当前报价。';
      find('[data-quote-baseline-total]').textContent = money(diff.baselineTotal);
      find('[data-quote-current-total]').textContent = money(renderedTotals.total);
      find('[data-quote-delta]').textContent = moneyDelta(diff.delta);
      find('[data-quote-first-year-delta]').textContent = moneyDelta(diff.firstYearDelta);
      const entries = diff.changes.map(({ label, from, to }) => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        const value = document.createElement('strong');
        name.textContent = label;
        value.textContent = `${from} → ${to}`;
        row.append(name, value);
        return row;
      });
      find('[data-quote-changes]').replaceChildren(...entries);
    }

    function renderQuickQuote(canQuote) {
      const storeCount = Math.max(0, ...renderedTotals.lines.map(({ qty }) => qty));
      const reference = baseline ?? initialState(state.preset);
      const diff = compareVersions(reference, state, renderedTotals);
      const canExpand = canQuote && storeCount < 99;
      find('[data-quote-stores]').textContent = storeCount;
      find('[data-quote-quick-reference-label]').textContent = diff.delta === 0 ? '报价差额' : `相比 ${money(diff.baselineTotal)}`;
      const delta = find('[data-quote-quick-delta]');
      delta.textContent = moneyDelta(diff.delta);
      delta.classList.toggle('oq-delta-active', diff.delta !== 0);
      const detail = find('[data-quote-impact-detail]');
      detail.hidden = !diff.softwareDelta && !diff.serviceDelta;
      find('[data-quote-software-label]').textContent = reference.years === state.years ? `${state.years} 年软件费` : '合同软件费';
      find('[data-quote-software-delta]').textContent = moneyDelta(diff.softwareDelta);
      find('[data-quote-service-delta]').textContent = moneyDelta(diff.serviceDelta);
      action('expand').disabled = !canExpand;
      action('reduce').disabled = !canQuote || storeCount < 2;
      const forecast = find('[data-quote-next]');
      forecast.hidden = !canExpand;
      if (canExpand) {
        const nextTotal = calculate(adjustMatchingStores(state, 1)).total;
        forecast.textContent = `从 ${storeCount} 到 ${storeCount + 1} 店 · 合同总额 ${moneyDelta(nextTotal - renderedTotals.total)}`;
      }
    }

    function render() {
      renderedTotals = calculate(state);
      find('[data-quote-document-meta]').innerHTML = documentMeta(state);
      find('[data-quote-document-total]').innerHTML = documentTotal(state, renderedTotals, true);
      find('[data-quote-document-items]').innerHTML = documentItems(state, renderedTotals, baseline ?? initialState(state.preset));
      const invalid = find('[aria-invalid="true"]');
      const canQuote = !invalid && renderedTotals.lines.length > 0;
      validation.hidden = !invalid;
      validation.textContent = invalid
        ? `${invalid.getAttribute('aria-label')}请输入 ${invalid.min} 至 ${invalid.max} 的整数，报价暂按上一有效输入显示。`
        : '';
      ['download', 'print', 'save'].forEach((name) => { action(name).disabled = !canQuote; });
      products.forEach(({ id }) => {
        const row = find(`[data-quote-product="${id}"]`);
        const qty = state.quantities[id] || 0;
        row.classList.toggle('oq-product-empty', qty === 0);
        row.querySelector('[data-quote-step="-1"]').disabled = qty === 0;
        row.querySelector('[data-quote-step="1"]').disabled = qty === 99;
      });
      renderQuickQuote(canQuote);
      renderComparison();
    }

    function writeFields() {
      find('[data-quote-validation]').hidden = true;
      client.value = state.client;
      years.value = state.years;
      discount.value = state.discount;
      discount.removeAttribute('aria-invalid');
      products.forEach(({ id }) => {
        count(id).value = state.quantities[id] || 0;
        count(id).removeAttribute('aria-invalid');
      });
      root.querySelectorAll('[data-quote-preset]').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.quotePreset) === state.preset));
      });
    }

    root.addEventListener('input', (event) => {
      const input = event.target;
      if (input === client) state.client = input.value;
      if (input === years) state.years = Number(input.value);
      if (input === discount || input.hasAttribute('data-quote-count')) {
        const value = input.valueAsNumber;
        const valid = Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max);
        if (valid) {
          input.removeAttribute('aria-invalid');
          if (input === discount) state.discount = value;
          else state.quantities[input.dataset.quoteCount] = value;
        } else {
          input.setAttribute('aria-invalid', 'true');
        }
      }
      render();
    });

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-quote-preset')) {
        state = initialState(Number(button.dataset.quotePreset));
        writeFields();
        render();
        return;
      }
      if (button.hasAttribute('data-quote-step')) {
        const id = button.dataset.product;
        state.quantities[id] = (state.quantities[id] || 0) + Number(button.dataset.quoteStep);
        count(id).value = state.quantities[id];
        count(id).removeAttribute('aria-invalid');
        render();
        return;
      }
      const selectedAction = button.dataset.quoteAction;
      switch (selectedAction) {
        case 'reset':
          state = initialState(state.preset);
          writeFields();
          break;
        case 'save':
          baseline = saveVersion(state);
          status.textContent = '当前报价已保存为基准。';
          break;
        case 'clear':
          baseline = null;
          status.textContent = '基准已清除。';
          action('save').focus();
          break;
        case 'expand':
        case 'reduce': {
          if (!baseline) baseline = saveVersion(state);
          state = adjustMatchingStores(state, selectedAction === 'expand' ? 1 : -1);
          writeFields();
          break;
        }
        case 'open-config':
          config.open = true;
          config.querySelector('summary').focus();
          return;
        case 'download':
          return downloadQuote(state, renderedTotals);
        case 'print':
          return printQuote(state, renderedTotals);
      }
      render();
      if (selectedAction === 'expand' || selectedAction === 'reduce') {
        const count = find('[data-quote-stores]').textContent;
        const delta = find('[data-quote-quick-delta]').textContent;
        status.textContent = `${count} 家店，合同总额 ${money(renderedTotals.total)}，差额 ${delta}。`;
      }
    });

    writeFields();
    render();
  }

  window.mountQuote = mountQuote;
  window.quotePreview = (index) => {
    if (!Number.isInteger(index) || !presets[index]) return null;
    const state = initialState(index);
    const totals = calculate(state);
    return { name: presetLabels[index], years: state.years, yearly: money(totals.yearly),
      setup: money(totals.once), total: money(totals.total) };
  };
}());
