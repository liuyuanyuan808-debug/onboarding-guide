const guideSteps = [
  {
    target: "sync",
    title: "双控同步操作",
    body: "开启双控后，模式、韵律及开始、暂停、继续和结束操作会同步。",
  },
  {
    target: "single",
    title: "单独管理设备",
    body: "解除 Sync 后，选中左侧奶碗，即可单独调节该设备的模式、韵律及开始、暂停、继续和结束状态。",
  },
  {
    target: "levels",
    title: "档位独立调节",
    body: "无论是否开启双控，左右档位都可独立调节。\n如需同时调节，请选择Both.",
  },
  {
    target: "light",
    title: "选择亮灯模式",
    body: "亮灯支持手动和 AUTO 两种模式。选择AUTO后，暂停吸乳时自动亮灯，可在设置中调整亮灯时长。",
  },
  {
    target: "duration",
    title: "设置夜灯时长",
    body: "选择 10 秒、20 秒、30 秒，或用滚轮自定义时长。暂停吸乳时，自动开启的夜灯会按设定时长关闭。",
  },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sides = ["L", "R"];
const storageKey = "m5-ultra-night-light";
const guideLayer = $("#guideLayer");
const guideControls = $$("[data-guide-control]", guideLayer);
const controlScreen = $("#controlScreen");
const settingsScreen = $("#settingsScreen");
const durationPicker = $("#durationPicker");
const customDurationButton = $("#customDurationButton");
const minuteWheel = $("#durationMinutes");
const secondWheel = $("#durationSeconds");
const maxMinutes = 5;
const secondStep = 30;

for (const [wheel, values, unit] of [
  [minuteWheel, Array.from({ length: maxMinutes }, (_, index) => index + 1), "分"],
  [secondWheel, [0, secondStep], "秒"],
]) {
  wheel.setAttribute("aria-valuemin", values[0]);
  wheel.setAttribute("aria-valuemax", values.at(-1));
  for (const value of values) {
    const row = document.createElement("span");
    row.className = "duration-option";
    row.dataset.value = value;
    row.setAttribute("aria-hidden", "true");
    row.textContent = `${value} ${unit}`;
    wheel.append(row);
  }
}

function readLightSettings() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

const savedSettings = readLightSettings();
const validDuration = Number.isInteger(savedSettings.duration) &&
  savedSettings.duration >= 1 && savedSettings.duration <= maxMinutes * 60;
const requestedStep = Number(new URLSearchParams(location.search).get("step"));
const state = {
  guideStep: Number.isInteger(requestedStep) ? Math.max(0, Math.min(guideSteps.length - 1, requestedStep - 1)) : 0,
  guiding: true,
  settingsOpen: false,
  scenario: "ready",
  sync: false,
  selectedSide: "L",
  modes: { L: "Stimulation", R: "Stimulation" },
  levels: { L: 5, R: 6 },
  lights: { L: 0, R: 0 },
  remembered: { L: 25, R: 25 },
  autoLight: savedSettings.autoLight !== false,
  duration: validDuration ? savedSettings.duration : 30,
  durationIsCustom: validDuration && savedSettings.durationIsCustom === true,
  pumping: false,
  paused: false,
  autoLitSides: new Set(),
  autoStartedAt: null,
  autoTimer: null,
};

let toastTimeout;
let finishTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function updateGuide() {
  const step = state.guiding ? guideSteps[state.guideStep] : null;
  const target = step?.target;
  guideLayer.classList.toggle("is-guiding", state.guiding);
  guideLayer.dataset.step = target || "none";
  if (step) {
    guideLayer.setAttribute("role", "dialog");
    guideLayer.setAttribute("aria-modal", "true");
    guideLayer.setAttribute("aria-labelledby", "guideTitle");
    guideLayer.setAttribute("aria-describedby", "guideBody");
    $("#guideCount").textContent = `${state.guideStep + 1}/${guideSteps.length}`;
    $("#guideTitle").textContent = step.title;
    $("#guideBody").textContent = step.body;
    $("#nextGuide").textContent = state.guideStep === guideSteps.length - 1 ? "Done" : "Next";
  } else {
    for (const attribute of ["role", "aria-modal", "aria-labelledby", "aria-describedby"]) {
      guideLayer.removeAttribute(attribute);
    }
  }
  for (const control of guideControls) {
    const isTarget = control.dataset.guideControl === target;
    control.inert = state.guiding && !isTarget;
    control.classList.toggle("is-guide-target", isTarget);
  }
  controlScreen.hidden = state.settingsOpen;
  settingsScreen.hidden = !state.settingsOpen;
}

function enterGuideStep() {
  const target = guideSteps[state.guideStep].target;
  state.settingsOpen = target === "duration";
  if (!durationPicker.hidden) closeDurationPicker(false);
  if (target === "single") state.sync = false;
  if (target === "light" && !state.pumping) {
    state.pumping = true;
    state.paused = true;
    startAutoLight();
  }
  updateGuide();
  render();
}

function openGuide() {
  state.guiding = true;
  state.guideStep = 0;
  enterGuideStep();
}

function closeGuide(completed) {
  state.guiding = false;
  state.settingsOpen = false;
  if (!durationPicker.hidden) closeDurationPicker(false);
  updateGuide();
  if (completed) showToast("引导已完成，可点按 Guide 重新查看。");
}

function activeSides() {
  return state.sync ? sides : [state.selectedSide];
}

function currentLight(side) {
  return state.autoLitSides.has(side) ? state.remembered[side] : state.lights[side];
}

function setSwitch(element, on) {
  element.classList.toggle("is-on", on);
  element.setAttribute("aria-checked", String(on));
}

function setBrightness(value) {
  for (const side of activeSides()) {
    state.autoLitSides.delete(side);
    state.lights[side] = value;
    if (value > 0) state.remembered[side] = value;
  }
  if (!state.autoLitSides.size) stopAutoLight();
  render();
}

function toggleLight() {
  const on = activeSides().some((side) => currentLight(side) > 0);
  setBrightness(on ? 0 : state.remembered[state.selectedSide]);
}

function toggleSync() {
  if (state.sync) {
    state.sync = false;
    render();
    return;
  }
  if (state.scenario !== "ready") {
    showToast(state.scenario === "offline" ? "请连接两台设备后开启同步。" : "请将两台设备更新至相同固件版本后再开启同步。");
    return;
  }
  const source = state.selectedSide;
  const other = source === "L" ? "R" : "L";
  state.sync = true;
  for (const values of [state.modes, state.levels, state.lights, state.remembered]) {
    values[other] = values[source];
  }
  if (state.paused && state.autoLitSides.size > 0) {
    if (state.autoLitSides.has(source)) state.autoLitSides.add(other);
    else state.autoLitSides.delete(other);
  }
  render();
}

function setScenario(scenario) {
  state.scenario = scenario;
  if (scenario !== "ready") state.sync = false;
  if (scenario === "offline" && state.selectedSide === "R") state.selectedSide = "L";
  $$(".segment-item").forEach((button) => button.classList.toggle("is-active", button.dataset.scenario === scenario));
  render();
}

function setMode(mode) {
  activeSides().forEach((side) => { state.modes[side] = mode; });
  render();
}

function stopAutoLight() {
  clearTimeout(state.autoTimer);
  state.autoLitSides.clear();
  state.autoStartedAt = null;
  state.autoTimer = null;
}

function scheduleAutoOff() {
  clearTimeout(state.autoTimer);
  if (!state.autoLitSides.size) return;
  const remaining = state.duration * 1000 - (Date.now() - state.autoStartedAt);
  if (remaining <= 0) {
    stopAutoLight();
    render();
    return;
  }
  state.autoTimer = setTimeout(() => {
    stopAutoLight();
    render();
    showToast("自动夜灯已关闭。");
  }, remaining);
}

function startAutoLight() {
  stopAutoLight();
  if (!state.autoLight) return;
  state.autoLitSides = new Set(activeSides().filter((side) => state.lights[side] === 0));
  if (!state.autoLitSides.size) return;
  state.autoStartedAt = Date.now();
  scheduleAutoOff();
}

function saveLightSettings() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      duration: state.duration,
      durationIsCustom: state.durationIsCustom,
      autoLight: state.autoLight,
    }));
  } catch {
    // Settings still apply for the current demo session.
  }
}

function setDuration(seconds, isCustom) {
  state.duration = seconds;
  state.durationIsCustom = isCustom;
  saveLightSettings();
  scheduleAutoOff();
  render();
}

function render() {
  $("#syncButton").setAttribute("aria-pressed", String(state.sync));
  $("#guideRightBattery").textContent = state.scenario === "offline" ? "—" : state.sync ? "100" : "80";
  $("#guideRightTime").textContent = state.scenario === "offline" ? "离线" : state.sync ? "13:50" : "12:45";

  for (const button of $$(".guide-device")) {
    const side = button.dataset.side;
    button.disabled = side === "R" && state.scenario === "offline";
    button.setAttribute("aria-pressed", String(!state.sync && side === state.selectedSide));
  }

  const mode = state.modes[state.selectedSide];
  const boost = mode === "Milk Boost";
  $("#boostButton").setAttribute("aria-pressed", String(boost));
  $("#programTitle").textContent = boost ? "Milk Boost" : "Manual";
  $(".guide-mode").classList.toggle("is-boost", boost);
  $("#programTime").hidden = !boost;
  $("#programTrack").hidden = !boost;
  $("#modeTabs").hidden = boost;
  $$("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));

  for (const [side, name] of [["L", "left"], ["R", "right"]]) {
    const level = state.levels[side];
    const input = $(`#${name}LevelInput`);
    input.value = level;
    input.disabled = side === "R" && state.scenario === "offline";
    const display = $(`#${name}Level`);
    display.textContent = level;
    display.style.setProperty("--level-position", `${(9 - level) * 12.5}%`);
  }

  const brightness = Math.max(...activeSides().map(currentLight));
  $("#brightness").value = brightness;
  $("#brightnessText").textContent = `${brightness}%`;
  $(".guide-light").style.setProperty("--brightness", `${brightness}%`);
  setSwitch($("#lightSwitch"), brightness > 0);
  setSwitch($("#autoSwitch"), state.autoLight);
  $("#autoPill").hidden = !state.autoLight;

  $$("[data-duration]").forEach((button) => {
    button.setAttribute("aria-pressed", String(!state.durationIsCustom && Number(button.dataset.duration) === state.duration));
  });
  customDurationButton.setAttribute("aria-pressed", String(state.durationIsCustom));
  const minutes = Math.floor(state.duration / 60);
  const seconds = state.duration % 60;
  const durationText = [minutes && `${minutes} 分`, seconds && `${seconds} 秒`].filter(Boolean).join(" ");
  customDurationButton.textContent = state.durationIsCustom ? `自定义 · ${durationText}` : "自定义";

  $("#startPumping").hidden = state.pumping;
  $("#pumpActions").hidden = !state.pumping;
  $("#pausePumping").classList.toggle("is-paused", state.paused);
  $("#pausePumping").setAttribute("aria-label", state.paused ? "继续吸乳" : "暂停吸乳");
}

$("#nextGuide").addEventListener("click", () => {
  if (state.guideStep === guideSteps.length - 1) closeGuide(true);
  else {
    state.guideStep += 1;
    enterGuideStep();
  }
});
$("#skipGuide").addEventListener("click", () => closeGuide(false));
$("#replayGuide").addEventListener("click", openGuide);
$("#navHelp").addEventListener("click", openGuide);

guideLayer.addEventListener("keydown", (event) => {
  const pickerOpen = !durationPicker.hidden;
  if (pickerOpen && event.key === "Escape") {
    event.preventDefault();
    closeDurationPicker();
    return;
  }
  if ((!state.guiding && !pickerOpen) || event.key !== "Tab") return;
  const root = pickerOpen ? durationPicker : guideLayer;
  const controls = $$("button, input, [tabindex='0']", root).filter((element) =>
    !element.disabled && !element.closest("[inert]") && element.getClientRects().length > 0
  );
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

$$(".guide-device").forEach((button) => button.addEventListener("click", () => {
  if (state.sync) return;
  state.selectedSide = button.dataset.side;
  render();
}));
$("#syncButton").addEventListener("click", toggleSync);
$("#lightSwitch").addEventListener("click", toggleLight);
$("#brightness").addEventListener("input", (event) => setBrightness(Number(event.target.value)));

$$("[data-level-side]").forEach((input) => input.addEventListener("input", () => {
  state.levels[input.dataset.levelSide] = Number(input.value);
  render();
}));
$$("[data-level-delta]").forEach((button) => button.addEventListener("click", () => {
  const availableSides = state.scenario === "offline" ? ["L"] : sides;
  for (const side of availableSides) {
    state.levels[side] = Math.max(1, Math.min(9, state.levels[side] + Number(button.dataset.levelDelta)));
  }
  render();
}));

$$("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("#boostButton").addEventListener("click", () => setMode(state.modes[state.selectedSide] === "Milk Boost" ? "Stimulation" : "Milk Boost"));
$$(".segment-item").forEach((button) => button.addEventListener("click", () => setScenario(button.dataset.scenario)));

$("#startPumping").addEventListener("click", () => {
  state.pumping = true;
  state.paused = false;
  render();
});
$("#pausePumping").addEventListener("click", () => {
  state.paused = !state.paused;
  if (state.paused) startAutoLight();
  else stopAutoLight();
  render();
});
const finishButton = $("#finishPumping");
function finishPumping() {
  state.pumping = false;
  state.paused = false;
  stopAutoLight();
  render();
}
finishButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  finishButton.setPointerCapture(event.pointerId);
  finishTimer = setTimeout(finishPumping, 500);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  finishButton.addEventListener(type, () => clearTimeout(finishTimer));
}
finishButton.addEventListener("click", (event) => {
  if (event.detail === 0) finishPumping();
});

$("#openSettings").addEventListener("click", () => {
  state.settingsOpen = true;
  updateGuide();
});
$("#closeSettings").addEventListener("click", () => {
  state.settingsOpen = false;
  updateGuide();
  $("#openSettings").focus({ preventScroll: true });
});
$("#autoSwitch").addEventListener("click", () => {
  state.autoLight = !state.autoLight;
  if (!state.autoLight) stopAutoLight();
  else if (state.paused) startAutoLight();
  saveLightSettings();
  render();
});
$$("[data-duration]").forEach((button) => button.addEventListener("click", () => setDuration(Number(button.dataset.duration), false)));

function wheelIndex(wheel) {
  const rowHeight = wheel.firstElementChild.offsetHeight;
  if (!rowHeight) return 0;
  return Math.min(wheel.children.length - 1, Math.max(0, Math.round(wheel.scrollTop / rowHeight)));
}

function scrollToWheelRow(wheel, index) {
  const rowHeight = wheel.firstElementChild.offsetHeight;
  wheel.scrollTop = index * rowHeight;
}

function updateWheelSelection(wheel) {
  const index = wheelIndex(wheel);
  const row = wheel.children[index];
  wheel.setAttribute("aria-valuenow", row.dataset.value);
  wheel.setAttribute("aria-valuetext", row.textContent);
  Array.from(wheel.children).forEach((option, optionIndex) => {
    option.dataset.distance = Math.abs(optionIndex - index);
  });
  return Number(row.dataset.value);
}

function updateDurationWheels() {
  const minutes = updateWheelSelection(minuteWheel);
  const atLimit = minutes === maxMinutes;
  secondWheel.lastElementChild.hidden = atLimit;
  secondWheel.setAttribute("aria-valuemax", atLimit ? 0 : secondStep);
  if (atLimit) scrollToWheelRow(secondWheel, 0);
  return minutes * 60 + updateWheelSelection(secondWheel);
}

function closeDurationPicker(restoreFocus = true) {
  durationPicker.hidden = true;
  settingsScreen.inert = false;
  if (restoreFocus) customDurationButton.focus({ preventScroll: true });
}

customDurationButton.addEventListener("click", () => {
  const duration = Math.max(60, Math.round(state.duration / secondStep) * secondStep);
  durationPicker.hidden = false;
  settingsScreen.inert = true;
  scrollToWheelRow(minuteWheel, Math.floor(duration / 60) - 1);
  updateDurationWheels();
  scrollToWheelRow(secondWheel, (duration % 60) / secondStep);
  updateDurationWheels();
  $("#closeDurationPicker").focus({ preventScroll: true });
});
$("#closeDurationPicker").addEventListener("click", () => closeDurationPicker());
$("#confirmDuration").addEventListener("click", () => {
  setDuration(updateDurationWheels(), true);
  closeDurationPicker();
});

for (const wheel of [minuteWheel, secondWheel]) {
  wheel.addEventListener("scroll", () => {
    if (!durationPicker.hidden) updateDurationWheels();
  });
  wheel.addEventListener("click", (event) => {
    if (!event.target.classList.contains("duration-option")) return;
    scrollToWheelRow(wheel, Array.from(wheel.children).indexOf(event.target));
    updateDurationWheels();
  });
  wheel.addEventListener("keydown", (event) => {
    const index = wheelIndex(wheel);
    const last = wheel.lastElementChild.hidden ? 0 : wheel.children.length - 1;
    const destinations = {
      ArrowUp: Math.min(last, index + 1), ArrowDown: Math.max(0, index - 1), Home: 0, End: last,
    };
    if (!Object.hasOwn(destinations, event.key)) return;
    event.preventDefault();
    scrollToWheelRow(wheel, destinations[event.key]);
    updateDurationWheels();
  });
}

$("#resetDemo").addEventListener("click", () => {
  stopAutoLight();
  Object.assign(state, {
    sync: false, selectedSide: "L", levels: { L: 5, R: 6 },
    modes: { L: "Stimulation", R: "Stimulation" },
    lights: { L: 0, R: 0 }, remembered: { L: 25, R: 25 },
    autoLight: true, duration: 30, durationIsCustom: false,
    pumping: false, paused: false,
  });
  saveLightSettings();
  setScenario("ready");
  openGuide();
});

enterGuideStep();
