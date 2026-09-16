const state = {
  guideStep: Math.max(0, Math.min(3, Number(new URLSearchParams(location.search).get("step") || 1) - 1)),
  scenario: "ready",
  sync: true,
  selectedSide: "L",
  levels: { L: 4, R: 4 },
  lights: { L: 50, R: 50 },
  remembered: { L: 50, R: 50 },
  autoLight: true,
  duration: 10,
  pumping: false,
  paused: false,
  autoTimer: null,
};

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
    body: "无论是否开启双控，左右档位都可独立调节。如需同时调节，请选择 Both。",
  },
  {
    target: "auto",
    title: "选择亮灯模式",
    body: "亮灯支持手动和 AUTO 两种模式。选择 AUTO 后，暂停吸乳时自动亮灯，可在设置中调整亮灯时长。",
  },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const phone = $(".phone");
const guideLayer = $("#guideLayer");
let toastTimeout;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function updateGuide() {
  const step = guideSteps[state.guideStep];
  const target = $(`[data-guide-target="${step.target}"]`);
  const appScroll = $(".app-scroll");
  const desiredTop = step.target === "auto" ? 330 : step.target === "levels" ? 285 : 8;
  appScroll.scrollTop = Math.max(0, target.offsetTop - desiredTop);

  $("#guideCount").textContent = `${state.guideStep + 1} / ${guideSteps.length}`;
  $("#guideProgress").style.width = `${((state.guideStep + 1) / guideSteps.length) * 100}%`;
  $("#guideTitle").textContent = step.title;
  $("#guideBody").textContent = step.body;
  const referenceAuto = $(".reference-auto");
  const showAuto = step.target === "auto";
  referenceAuto.classList.toggle("is-guide-hidden", !showAuto);
  referenceAuto.classList.toggle("is-guide-emphasis", showAuto);
  $(".reference-stage").classList.toggle("is-single-step", step.target === "single");
  $("#prevGuide").disabled = state.guideStep === 0;
  $("#nextGuide").textContent = state.guideStep === guideSteps.length - 1 ? "完成" : "下一步";

  requestAnimationFrame(() => {
    const currentStep = guideSteps[state.guideStep];
    const currentTarget = $(`[data-guide-target="${currentStep.target}"]`);
    const phoneRect = phone.getBoundingClientRect();
    const rect = currentTarget.getBoundingClientRect();
    const focus = $("#guideFocus");
    const margin = ["sync", "single"].includes(currentStep.target) ? 4 : currentStep.target === "auto" ? 8 : 6;
    focus.classList.toggle("is-auto-target", currentStep.target === "auto");

    focus.style.left = `${rect.left - phoneRect.left - margin}px`;
    focus.style.top = `${rect.top - phoneRect.top - margin}px`;
    focus.style.width = `${rect.width + margin * 2}px`;
    focus.style.height = `${rect.height + margin * 2}px`;

    const center = rect.left - phoneRect.left + rect.width / 2;
    const coach = $("#coachmark");
    const placeAbove = !["sync", "single"].includes(currentStep.target);
    coach.classList.toggle("is-above-target", placeAbove);
    coach.style.top = placeAbove ? "100px" : "auto";
    coach.style.bottom = placeAbove ? "auto" : "16px";
    coach.style.setProperty("--pointer-x", `${Math.max(28, Math.min(326, center - 18))}px`);
  });
}

function openGuide() {
  state.guideStep = 0;
  guideLayer.classList.add("is-visible");
  requestAnimationFrame(updateGuide);
}

function closeGuide(completed = false) {
  guideLayer.classList.remove("is-visible");
  $(".reference-auto").classList.remove("is-guide-hidden", "is-guide-emphasis");
  $(".reference-stage").classList.remove("is-single-step");
  if (completed) showToast("引导已完成，可随时从 Guide 重新查看");
}

function setSwitch(element, on) {
  element.classList.toggle("is-on", on);
  element.setAttribute("aria-checked", String(on));
}

function activeSides() {
  return state.sync ? ["L", "R"] : [state.selectedSide];
}

function setBrightness(value, fromSlider = false) {
  const next = Number(value);
  activeSides().forEach((side) => {
    state.lights[side] = next;
    if (next > 0) state.remembered[side] = next;
  });
  if (fromSlider && next === 0) showToast("亮度为 0%，灯光已关闭");
  render();
}

function toggleLight() {
  const sides = activeSides();
  const anyOn = sides.some((side) => state.lights[side] > 0);
  sides.forEach((side) => {
    state.lights[side] = anyOn ? 0 : (state.remembered[side] || 50);
  });
  render();
}

function toggleSync() {
  if (state.sync) {
    state.sync = false;
    showToast("双控已关闭，设备保留当前设置");
    render();
    return;
  }
  if (state.scenario === "offline") {
    showToast("无法开启同步，请连接两台设备后重试。");
    return;
  }
  if (state.scenario === "firmware") {
    showToast("无法开启同步，请将两台设备更新至相同固件版本后重试。");
    return;
  }
  state.sync = true;
  state.lights.R = state.lights[state.selectedSide];
  state.remembered.R = state.remembered[state.selectedSide];
  showToast("双控已开启，方案及运行状态即将同步。");
  render();
}

function setScenario(scenario) {
  state.scenario = scenario;
  if (scenario !== "ready") state.sync = false;
  $$(".segment-item").forEach((button) => button.classList.toggle("is-active", button.dataset.scenario === scenario));
  render();
}

function render() {
  const syncButton = $("#syncButton");
  syncButton.classList.toggle("is-on", state.sync);
  syncButton.classList.toggle("is-disabled", !state.sync && state.scenario !== "ready");
  syncButton.setAttribute("aria-pressed", String(state.sync));

  $$(".pump-card").forEach((card) => {
    const side = card.dataset.side;
    const offline = side === "R" && state.scenario === "offline";
    card.classList.toggle("is-selected", state.selectedSide === side);
    card.classList.toggle("light-on", state.lights[side] > 0 && !offline);
    card.disabled = offline;
    const stateLabel = $(".pump-state b", card);
    const stateDot = $(".pump-state i", card);
    stateLabel.textContent = offline ? "Not connected" : state.scenario === "firmware" && side === "R" ? "Update needed" : "Connected";
    stateDot.style.background = offline ? "#aaa3a7" : state.scenario === "firmware" && side === "R" ? "#c27828" : "#168257";
    $(".pump-meta", card).textContent = offline ? "--" : `${state.lights[side]}% light · ${state.pumping ? "08:42" : "00:00"}`;
    $(".light-glow", card).style.opacity = state.lights[side] > 0 && !offline ? String(.18 + state.lights[side] / 140) : "0";
  });

  $("#leftLevel").textContent = state.levels.L;
  $("#rightLevel").textContent = state.levels.R;
  const shownSide = state.selectedSide;
  const shownBrightness = state.sync ? state.lights.L : state.lights[shownSide];
  $("#brightness").value = shownBrightness;
  $("#brightnessText").textContent = `${shownBrightness}%`;
  $("#lightScope").textContent = state.sync ? "Both" : shownSide === "L" ? "Left" : "Right";
  setSwitch($("#lightSwitch"), shownBrightness > 0);
  setSwitch($("#autoSwitch"), state.autoLight);
  $("#autoPill").classList.toggle("is-hidden", !state.autoLight);

  const action = $("#pumpAction");
  action.classList.toggle("is-running", state.pumping);
  $(".action-icon", action).textContent = !state.pumping ? "▶" : state.paused ? "▶" : "Ⅱ";
  $("span:last-child", action).textContent = !state.pumping ? "Start Pumping" : state.paused ? "Resume Pumping" : "Pause Pumping";
}

$("#nextGuide").addEventListener("click", () => {
  if (state.guideStep === guideSteps.length - 1) closeGuide(true);
  else { state.guideStep += 1; updateGuide(); }
});
$("#prevGuide").addEventListener("click", () => {
  if (state.guideStep > 0) { state.guideStep -= 1; updateGuide(); }
});
$("#skipGuide").addEventListener("click", () => closeGuide(false));
$("#closeGuide").addEventListener("click", () => closeGuide(false));
$("#replayGuide").addEventListener("click", openGuide);
$("#navHelp").addEventListener("click", openGuide);
window.addEventListener("resize", () => guideLayer.classList.contains("is-visible") && updateGuide());

$$(".pump-card").forEach((card) => card.addEventListener("click", () => {
  state.selectedSide = card.dataset.side;
  render();
}));
$("#syncButton").addEventListener("click", toggleSync);
$("#lightSwitch").addEventListener("click", toggleLight);
$("#brightness").addEventListener("input", (event) => setBrightness(event.target.value, true));

$$("[data-level-side]").forEach((button) => button.addEventListener("click", () => {
  const side = button.dataset.levelSide;
  state.levels[side] = Math.max(1, Math.min(9, state.levels[side] + Number(button.dataset.levelDelta)));
  render();
}));

$$(".mode-tab").forEach((button) => button.addEventListener("click", () => {
  $$(".mode-tab").forEach((item) => item.classList.toggle("is-active", item === button));
  if (state.sync) showToast(`${button.textContent} 已应用到左右设备`);
}));

$$(".segment-item").forEach((button) => button.addEventListener("click", () => setScenario(button.dataset.scenario)));

$("#pumpAction").addEventListener("click", () => {
  if (!state.pumping) {
    state.pumping = true;
    state.paused = false;
  } else if (!state.paused) {
    state.paused = true;
    if (state.autoLight && activeSides().every((side) => state.lights[side] === 0)) {
      activeSides().forEach((side) => { state.lights[side] = state.remembered[side] || 50; });
      showToast(`已暂停，将亮灯 ${state.duration} 秒`);
      clearTimeout(state.autoTimer);
      state.autoTimer = setTimeout(() => {
        activeSides().forEach((side) => { state.lights[side] = 0; });
        render();
        showToast("自动亮灯已到时关闭");
      }, state.duration * 1000);
    }
  } else {
    state.paused = false;
    clearTimeout(state.autoTimer);
    activeSides().forEach((side) => { state.lights[side] = 0; });
  }
  render();
});

function openSettings() {
  $("#settingsLayer").classList.add("is-visible");
  $("#settingsLayer").setAttribute("aria-hidden", "false");
}
function closeSettings() {
  $("#settingsLayer").classList.remove("is-visible");
  $("#settingsLayer").setAttribute("aria-hidden", "true");
}
$("#openSettings").addEventListener("click", openSettings);
$(".reference-auto").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", closeSettings);
$("#settingsDone").addEventListener("click", closeSettings);
$("#autoSwitch").addEventListener("click", () => {
  state.autoLight = !state.autoLight;
  render();
  if (state.autoLight) showToast("自动亮灯已开启，暂停吸乳时会自动亮灯。");
});
$$("[data-duration]").forEach((button) => button.addEventListener("click", () => {
  state.duration = Number(button.dataset.duration);
  $$("[data-duration]").forEach((item) => item.classList.toggle("is-active", item === button));
}));

$("#resetDemo").addEventListener("click", () => {
  Object.assign(state, {
    scenario: "ready", sync: true, selectedSide: "L", levels: { L: 4, R: 4 },
    lights: { L: 50, R: 50 }, remembered: { L: 50, R: 50 }, autoLight: true,
    duration: 10, pumping: false, paused: false,
  });
  setScenario("ready");
  openGuide();
});

render();
requestAnimationFrame(updateGuide);
