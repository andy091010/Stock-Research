const state = {
  dashboard: null,
  live: null,
  recordsMonth: null,
  volumeContract: null
};
const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 0) => Number(value ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: digits });
const monthLabel = (yyyymm) => yyyymm ? `${yyyymm.slice(0,4)}.${yyyymm.slice(4)}` : "—";

function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

function setSignalLabel(value) {
  const element = $("signalLabel");
  element.replaceChildren();
  value.split("｜").forEach((line, index) => {
    if (index) element.append(document.createElement("br"));
    element.append(document.createTextNode(line));
  });
}

class CanvasChart {
  constructor(canvas, tooltip, type = "line") {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.type = type;
    this.series = [];
    this.labels = [];
    this.annotations = [];
    this.mouse = null;
    this.canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.draw();
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.mouse = null;
      if (this.tooltip) this.tooltip.style.display = "none";
      this.draw();
    });
    new ResizeObserver(() => this.draw()).observe(canvas);
  }
  setData(labels, series, annotations = []) {
    this.labels = labels;
    this.series = series;
    this.annotations = annotations;
    this.draw();
  }
  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = this.canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height, pad = { l: 48, r: 14, t: 12, b: 30 };
    const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    const values = this.series.flatMap(s => s.values).filter(Number.isFinite);
    if (!values.length) return;
    let min = Math.min(...values), max = Math.max(...values);
    if (this.type === "bar") {
      min = 0;
      max = max > 0 ? max * 1.12 : 1;
    } else {
      if (min === max) { min -= 1; max += 1; }
      const gap = (max - min) * .12; min -= gap; max += gap;
    }
    const x = (i) => pad.l + (i / Math.max(1, this.labels.length - 1)) * plotW;
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * plotH;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(151,166,199,.13)"; ctx.lineWidth = 1;
    ctx.fillStyle = "#70809b"; ctx.font = "10px IBM Plex Mono";
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w-pad.r, gy); ctx.stroke();
      const label = max - (max-min) * i/4;
      ctx.fillText(fmt(label, Math.abs(max-min) < 10 ? 1 : 0), 2, gy+3);
    }
    const visibleLabelCount = Math.max(6, Math.floor(w / 120));
    const step = Math.max(1, Math.ceil(this.labels.length / visibleLabelCount));
    this.labels.forEach((label, i) => {
      if (i % step === 0 || i === this.labels.length-1) ctx.fillText(label.slice(5), x(i)-15, h-8);
    });
    this.series.forEach((serie, si) => {
      ctx.strokeStyle = serie.color; ctx.fillStyle = serie.color; ctx.lineWidth = serie.width || 2;
      if (this.type === "bar" && si === 0) {
        const bw = Math.max(2, plotW / this.labels.length * .56);
        serie.values.forEach((v, i) => {
          ctx.fillStyle = serie.colors?.[i] || serie.color;
          ctx.fillRect(x(i)-bw/2, y(v), bw, y(0)-y(v));
        });
      } else {
        ctx.beginPath();
        serie.values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
        ctx.stroke();
      }
    });
    this.annotations.forEach(annotation => {
      const px = x(annotation.index);
      ctx.strokeStyle = annotation.color || "#ffbd59";
      ctx.fillStyle = annotation.color || "#ffbd59";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "600 10px IBM Plex Mono";
      ctx.fillText(annotation.label, Math.max(pad.l, px - 30), pad.t + 11);
    });
    if (this.mouse && this.labels.length) {
      const idx = Math.max(0, Math.min(this.labels.length-1, Math.round((this.mouse.x-pad.l)/plotW*(this.labels.length-1))));
      const px = x(idx);
      ctx.strokeStyle = "rgba(151,166,199,.42)"; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(px,pad.t); ctx.lineTo(px,pad.t+plotH); ctx.stroke(); ctx.setLineDash([]);
      if (this.tooltip) {
        const rows = this.series.map(s => `${s.name}: ${fmt(s.values[idx], s.digits || 0)}`).join("<br>");
        this.tooltip.innerHTML = `${this.labels[idx]}<br>${rows}`;
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${Math.min(w-155, Math.max(0, px+8))}px`;
        this.tooltip.style.top = "18px";
      }
    }
  }
}

const spreadChart = new CanvasChart($("spreadChart"), $("spreadTooltip"));
const volumeChart = new CanvasChart($("volumeChart"), $("volumeTooltip"), "bar");
const liveChart = new CanvasChart($("liveChart"), null);

function prepareScrollableChart(scrollId, trackId, pointCount) {
  const scroll = $(scrollId);
  const track = $(trackId);
  const width = Math.max(scroll.clientWidth, pointCount * 18);
  track.style.width = `${width}px`;
  requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });
}

function enableHorizontalDrag(element) {
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  element.addEventListener("pointerdown", event => {
    dragging = true;
    startX = event.clientX;
    startScroll = element.scrollLeft;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", event => {
    if (!dragging) return;
    element.scrollLeft = startScroll - (event.clientX - startX);
  });
  const stop = () => { dragging = false; };
  element.addEventListener("pointerup", stop);
  element.addEventListener("pointercancel", stop);
}

function renderRecords() {
  const history = state.dashboard?.history || [];
  const contract = state.recordsMonth;
  const rows = history.filter(item => item.nearContract === contract).reverse();
  $("recordsBody").innerHTML = rows.length ? rows.map(d => `
    <tr><td>${d.date}</td><td>${fmt(d.spread,1)}</td><td>${fmt(d.spreadVolume)}</td>
    <td>${fmt(d.derivedSpread,1)}</td></tr>`).join("")
    : `<tr><td colspan="4">此合約區間沒有可用資料</td></tr>`;
}

function setupRecordsMonth(history, year) {
  const select = $("recordsMonth");
  const contracts = [...new Set(
    history.map(item => item.nearContract).filter(contract => contract?.startsWith(String(year)))
  )].sort().reverse();
  const previous = state.recordsMonth;
  select.innerHTML = contracts.map(contract =>
    `<option value="${contract}">${contract.slice(0,4)} 年 ${contract.slice(4)} 月</option>`
  ).join("");
  state.recordsMonth = contracts.includes(previous) ? previous : contracts[0];
  if (state.recordsMonth) select.value = state.recordsMonth;
  renderRecords();
}

function renderVolumeChart() {
  const history = state.dashboard?.history || [];
  const contract = state.volumeContract;
  const rows = history.filter(item => item.nearContract === contract);
  const labels = rows.map(item => item.date);
  prepareScrollableChart("volumeScroll", "volumeTrack", rows.length);
  const settlements = rows
    .map((item, index) => item.isSettlement ? {
      index,
      label: `結算 ${item.date.slice(5)}`,
      color: "#ffbd59"
    } : null)
    .filter(Boolean);
  volumeChart.setData(
    labels,
    [{
      name: "價差口數",
      values: rows.map(item => item.spreadVolume),
      color: "#5b8cff",
      colors: rows.map(item => item.isSettlement ? "#ffbd59" : "#5b8cff")
    }],
    settlements
  );
}

function setupVolumeContract(history, year) {
  const select = $("volumeContract");
  const contracts = [...new Set(
    history.map(item => item.nearContract).filter(contract => contract?.startsWith(String(year)))
  )].sort().reverse();
  const previous = state.volumeContract;
  select.innerHTML = contracts.map(contract =>
    `<option value="${contract}">${contract.slice(0,4)} 年 ${contract.slice(4)} 月合約</option>`
  ).join("");
  state.volumeContract = contracts.includes(previous) ? previous : contracts[0];
  if (state.volumeContract) select.value = state.volumeContract;
  renderVolumeChart();
}

function renderDashboard(data) {
  state.dashboard = data;
  const { contracts, snapshot, signal, history, meta } = data;
  setText("pairLabel", `TX ${contracts.pair}`);
  setText("nearMonth", monthLabel(contracts.near));
  setText("farMonth", monthLabel(contracts.far));
  setText("nearPrice", fmt(snapshot.nearClose));
  setText("farPrice", fmt(snapshot.farClose));
  setText("derivedSpreadPrice", `${snapshot.derivedSpread >= 0 ? "+" : ""}${fmt(snapshot.derivedSpread, 1)}`);
  setText("spreadPrice", `${snapshot.spread >= 0 ? "+" : ""}${fmt(snapshot.spread, 1)}`);
  const previous = history.at(-2)?.spread ?? snapshot.spread;
  const delta = snapshot.spread - previous;
  setText("spreadChange", `較前日 ${delta >= 0 ? "+" : ""}${fmt(delta, 1)} 點`);
  setText("spreadVolume", fmt(snapshot.spreadVolume));
  setText("daysLeft", `${contracts.tradingDaysToExpiry} 日`);
  setText("zscore", fmt(snapshot.zscore20, 2));
  setText("volumeRatio", `${fmt(snapshot.volumeRatio20, 2)}×`);
  setSignalLabel(signal.label);
  setText("signalKicker", signal.code.toUpperCase());
  setText("signalReason", signal.reason);
  document.querySelector(".signal-card").dataset.tone = signal.tone;
  const [, expiryMonth, expiryDay] = contracts.expiry.split("-");
  document.querySelector(".hover-tip").dataset.tooltip =
    `${Number(contracts.near.slice(4))}月合約結算日為${expiryMonth}.${expiryDay}`;
  setText("lastUpdated", `${meta.latestTradeDate} / ${new Date(meta.fetchedAt).toLocaleTimeString("zh-TW", {hour:"2-digit",minute:"2-digit"})}`);
  setText("marketState", `${contracts.near} × ${contracts.far} 已連線`);

  const labels = history.map(d => d.date);
  prepareScrollableChart("spreadScroll", "spreadTrack", history.length);
  const allSettlements = history
    .map((item, index) => item.isSettlement ? {
      index,
      label: `結算 ${item.date.slice(5)}`,
      color: "#ffbd59"
    } : null)
    .filter(Boolean);
  spreadChart.setData(labels, [
    { name: "價差成交", values: history.map(d => d.spread), color: "#9d6dff", width: 2.5, digits: 1 },
    { name: "衍生價差", values: history.map(d => d.derivedSpread), color: "#67758e", width: 1, digits: 1 }
  ], allSettlements);
  setupVolumeContract(history, Number(contracts.near.slice(0, 4)));
  setupRecordsMonth(history, Number(contracts.near.slice(0, 4)));
}

function renderLive(data) {
  state.live = data;
  setText("liveQuote", fmt(data.quote));
  setText("liveChange", data.change || "—");
  setText("liveScope", data.scope);
  const list = data.futureList || [];
  liveChart.setData(list.map(d => d[0]), [{ name: "近月", values: list.map(d => Number(d[1])), color: "#45d9ff", width: 2 }]);
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "資料讀取失敗");
  return body;
}

async function refreshAll() {
  $("refreshButton").disabled = true;
  setText("marketState", "資料更新中");
  try {
    const [dashboard, live] = await Promise.allSettled([
      getJson("/api/dashboard"),
      getJson("/api/live")
    ]);
    if (dashboard.status === "fulfilled") renderDashboard(dashboard.value);
    else throw dashboard.reason;
    if (live.status === "fulfilled") renderLive(live.value);
    else setText("liveScope", `盤中來源暫時無法連線：${live.reason.message}`);
    setText("dataNoticeTitle", "日結與盤中資料已連線");
    setText("dataNoticeText", "FinMind 日結資料 × 期交所近月盤中行情；歷史序列依各月近／遠月合約接續。");
  } catch (error) {
    setText("marketState", "資料連線失敗");
    $("dataNotice").classList.add("error");
    $("dataNotice").innerHTML = `<strong>目前無法取得資料</strong><span>${error.message}。請確認後端已啟動、網路可連 FinMind，或設定 FINMIND_TOKEN。</span>`;
  } finally {
    $("refreshButton").disabled = false;
  }
}

$("refreshButton").addEventListener("click", refreshAll);
$("recordsMonth").addEventListener("change", event => {
  state.recordsMonth = event.target.value;
  renderRecords();
});
$("volumeContract").addEventListener("change", event => {
  state.volumeContract = event.target.value;
  renderVolumeChart();
});
enableHorizontalDrag($("spreadScroll"));
enableHorizontalDrag($("volumeScroll"));
refreshAll();
setInterval(async () => {
  try { renderLive(await getJson("/api/live")); } catch (_) {}
}, 30000);
setInterval(refreshAll, 60000);
