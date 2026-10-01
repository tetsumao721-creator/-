'use strict';
// 計算層はDOMから独立。将来の輸送・外気温などの評価もここに追加できます。
const MikanCalculator = (() => {
  const limits = { fruit: [-10, 50], air: [-10, 50], humidity: [1, 100] };
  const defaults = { fruit: 10, air: 20, humidity: 70 };
  function valid(values) {
    return Object.entries(limits).every(([key, [min, max]]) =>
      typeof values?.[key] === 'number' && Number.isFinite(values[key]) && values[key] >= min && values[key] <= max);
  }
  function dewPoint(air, humidity) {
    // Magnus式（水に対する露点）：γ = ln(RH/100) + aT/(b+T)
    // Td = bγ/(a−γ)。T、Tdは℃、RHは％。a=17.625、b=243.04℃。
    // FAA AEDT技術資料にも記載された係数を使用。氷に対する霜点は計算しません。
    // 100％ではTd=T。厳密な境界判定のためこの恒等式を直接返します。
    if (humidity === 100) return air;
    const a = 17.625, b = 243.04;
    const gamma = Math.log(humidity / 100) + a * air / (b + air);
    return b * gamma / (a - gamma);
  }
  function evaluate(values) {
    if (!valid(values)) throw new RangeError('測定値が入力範囲外です');
    const dew = dewPoint(values.air, values.humidity);
    const difference = values.fruit - dew;
    // 判定は表示用の丸めを行う前の値で実施。差が2℃ちょうどなら「低」。
    const risk = difference <= 0 ? 'high' : difference < 2 ? 'caution' : 'low';
    const target = dew + 2;
    // 必要な昇温量は0.1℃単位で切り上げ、表示値で不足しないようにします。
    const warming = Math.ceil(Math.max(0, target - values.fruit) * 10) / 10;
    return { dew, difference, risk, target, warming };
  }
  return { limits, defaults, valid, dewPoint, evaluate };
})();
if (typeof module !== 'undefined') module.exports = MikanCalculator;
if (typeof document !== 'undefined') {
  const storageKey = 'mikan-condensation-v1';
  const fields = Object.fromEntries(Object.keys(MikanCalculator.limits).map(key => [key, document.getElementById(key)]));
  const el = id => document.getElementById(id);
  const descriptions = {
    high: ['高', '!', '果実表面に結露する可能性があります。急激な温度変化を避けてください。'],
    caution: ['注意', '!', '条件の変化で結露する可能性があります。湿度や果実温度を確認してください。'],
    low: ['低', '✓', '現在の条件では結露リスクは比較的低いです。']
  };
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (MikanCalculator.valid(saved)) Object.keys(fields).forEach(key => { fields[key].value = saved[key]; });
  } catch { storageAvailable = false; }
  const fixed = value => (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
  function read() {
    const values = {};
    let valid = true;
    for (const [key, input] of Object.entries(fields)) {
      const [min, max] = MikanCalculator.limits[key];
      const value = input.valueAsNumber;
      const okay = input.value.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
      values[key] = value;
      input.setAttribute('aria-invalid', String(!okay));
      el(key + '-error').textContent = okay ? '' : `${min}〜${max}${key === 'humidity' ? '％' : '℃'}の数値を入力してください。`;
      valid = valid && okay;
      document.querySelectorAll(`[data-field="${key}"]`).forEach(button => {
        button.disabled = okay && (Number(button.dataset.direction) < 0 ? value <= min : value >= max);
      });
    }
    return valid ? values : null;
  }
  function update() {
    const values = read();
    el('result-content').hidden = !values;
    el('invalid-result').hidden = !!values;
    if (!values) { el('result').dataset.risk = 'invalid'; el('result-status').textContent = '入力を確認'; return; }
    const result = MikanCalculator.evaluate(values);
    const [label, symbol, description] = descriptions[result.risk];
    el('result').dataset.risk = result.risk;
    el('result-status').textContent = '現在の測定値';
    el('risk-name').textContent = label; el('risk-symbol').textContent = symbol;
    el('explanation').textContent = description;
    el('dew').textContent = fixed(result.dew); el('fruit-result').textContent = fixed(values.fruit);
    el('difference').textContent = (result.difference > 0 ? '+' : '') + fixed(result.difference);
    el('warming-text').replaceChildren();
    if (result.warming === 0) el('warming-text').textContent = '現在、低リスクの範囲です';
    else {
      el('warming-text').append('果実温度をあと ');
      const number = document.createElement('b'); number.textContent = result.warming.toFixed(1);
      el('warming-text').append(number, ' ℃上げる');
    }
    const target = (Math.ceil(result.target * 10) / 10).toFixed(1);
    el('target').textContent = `目標果実温度 ${target}℃以上（露点＋2℃）` + (result.target > 50 ? '。現在の条件では入力上限50℃を超えます。空気の温湿度を見直してください。' : '。室温と湿度が変わらない場合の目安です。');
    try { localStorage.setItem(storageKey, JSON.stringify(values)); storageAvailable = true; } catch { storageAvailable = false; }
    el('save-status').textContent = storageAvailable ? '入力値はこの端末に保存されます' : 'このブラウザでは入力値を保存できません';
  }
  Object.values(fields).forEach(input => input.addEventListener('input', update));
  document.querySelectorAll('[data-field]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.field, [min, max] = MikanCalculator.limits[key];
    const current = Number.isFinite(fields[key].valueAsNumber) ? fields[key].valueAsNumber : MikanCalculator.defaults[key];
    const step = key === 'humidity' ? 1 : 0.5;
    fields[key].value = Math.round(Math.min(max, Math.max(min, current + Number(button.dataset.direction) * step)) * 10) / 10;
    update();
  }));
  el('checker').addEventListener('submit', event => {
    event.preventDefault(); update();
    const invalid = Object.values(fields).find(input => input.getAttribute('aria-invalid') === 'true');
    if (invalid) invalid.focus(); else el('result').scrollIntoView({ behavior: 'auto', block: 'start' });
  });
  update();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./service-worker.js').then(() => navigator.serviceWorker.ready).then(() => {
      const connection = () => { el('offline-status').textContent = navigator.onLine ? 'オフラインでも利用可能' : 'オフラインで利用中'; };
      connection(); window.addEventListener('online', connection); window.addEventListener('offline', connection);
    }).catch(() => { el('offline-status').textContent = 'オフライン準備に失敗・再読み込みしてください'; });
  } else el('offline-status').textContent = 'オフライン利用にはHTTPSで開いてください';
}
