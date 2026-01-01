import { options, getAllSettings, getSetting } from "./settings.js";

const root = document.getElementById("root");

for (const item of options) {
  const group = document.createElement("div");
  group.className = "setting-group";
  group.id = `group-${item.key}`;
  createWidget(group, item);
  root.appendChild(group);
}

await refreshUI();

browser.storage.local.onChanged.addListener(refreshUI);

async function refreshUI() {
  const settings = await getAllSettings();

  for (const item of options) {
    updateWidgetValue(item, settings);
  }

  for (const item of options) {
    const group = document.getElementById(`group-${item.key}`);
    if (group && item.condition) {
      const parentValue = settings[item.condition.key];
      const shouldBeVisible = parentValue === item.condition.value;
      group.classList.toggle("hidden", !shouldBeVisible);
    }
  }

  const extSpan = document.getElementById("custom-filename-ext");
  if (extSpan) {
    const type = settings["defaultFileType"];
    extSpan.textContent = type === "jpeg" ? ".jpg" : ".png";
  }
}

function updateWidgetValue(item, settings) {
  const el = document.getElementById(item.key);
  if (!el) return;

  const value = settings[item.key];

  switch (item.type) {
    case "checkbox":
      el.checked = value;
      break;

    case "select":
      if (el.value !== value) el.value = value;
      break;

    case "range":
      if (document.activeElement !== el) {
        el.value = value;
      }
      const rangeLabel = document.getElementById(`range-val-${item.key}`);
      if (rangeLabel) rangeLabel.textContent = value + (item.unit || "");
      break;

    case "customInputWithButton":
      if (document.activeElement !== el) {
        el.value = value || "";
      }

      const btn = document.getElementById(`btn-${item.key}`);
      if (btn) {
        const currentText = String(el.value).trim();
        const savedText = String(value || "").trim();
        btn.disabled = !currentText || currentText === savedText;
      }
      break;
  }
}

function createWidget(container, item) {
  switch (item.type) {
    case "checkbox":
      createCheckbox(container, item);
      break;
    case "select":
      createSelect(container, item);
      break;
    case "customInputWithButton":
      createCustomInput(container, item);
      break;
    case "range":
      createRange(container, item);
      break;
  }
}

function createCheckbox(container, item) {
  const label = document.createElement("label");
  label.className = "checkbox-wrapper";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = item.key;
  input.addEventListener("change", async (e) => {
    await browser.storage.local.set({ [item.key]: e.target.checked });
  });

  const text = document.createElement("span");
  text.textContent = browser.i18n.getMessage(item.l10nLabel) || item.key;

  label.append(input, text);
  container.appendChild(label);
}

function createSelect(container, item) {
  container.classList.add("inline-row");

  const label = document.createElement("label");
  label.className = "setting-label";
  label.textContent = browser.i18n.getMessage(item.l10nLabel) || item.key;
  label.htmlFor = item.key;

  const select = document.createElement("select");
  select.id = item.key;

  item.options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.l10nId
      ? browser.i18n.getMessage(opt.l10nId)
      : opt.text;
    select.appendChild(option);
  });

  select.addEventListener("change", async (e) => {
    const newValue = e.target.value;

    if (item.key === "defaultFilename" && newValue === "custom") {
      const inputOption = options.find(
        (o) => o.type === "customInputWithButton"
      );
      const savedText = inputOption ? await getSetting(inputOption.key) : "";

      if (savedText && savedText.trim().length > 0) {
        const inputGroup = document.getElementById(`group-${inputOption.key}`);
        if (inputGroup) inputGroup.classList.remove("hidden");

        await browser.storage.local.set({ [item.key]: newValue });

        const inputEl = document.getElementById(inputOption.key);
        if (inputEl) inputEl.focus();
      } else {
        const inputGroup = document.getElementById(`group-${inputOption.key}`);
        if (inputGroup) inputGroup.classList.remove("hidden");

        const inputEl = document.getElementById(inputOption.key);
        if (inputEl) inputEl.focus();
      }
    } else {
      await browser.storage.local.set({ [item.key]: newValue });
    }
  });

  container.append(label, select);
}

function createCustomInput(container, item) {
  const label = document.createElement("label");
  label.className = "setting-label block-label";
  label.textContent = browser.i18n.getMessage(item.l10nLabel) || item.key;
  label.htmlFor = item.key;

  const inputGroup = document.createElement("div");
  inputGroup.className = "input-group";

  const inputWrapper = document.createElement("div");
  inputWrapper.className = "text-input-wrapper";

  const input = document.createElement("input");
  input.type = "text";
  input.id = item.key;
  input.placeholder = browser.i18n.getMessage(item.placeholderL10n);
  input.autocomplete = "off";
  input.spellcheck = false;

  const extensionSpan = document.createElement("span");
  extensionSpan.id = "custom-filename-ext";
  extensionSpan.className = "filename-extension";

  const button = document.createElement("button");
  button.textContent = browser.i18n.getMessage(item.buttonL10n);
  button.className = "save-button";
  button.id = `btn-${item.key}`;

  const saveInput = async () => {
    let val = input.value.trim();

    val = val.replace(/\.(png|jpg)$/i, "");
    val = val.trim();

    if (val) {
      if (input.value !== val) {
        input.value = val;
      }

      await browser.storage.local.set({ [item.key]: val });
      await browser.storage.local.set({ defaultFilename: "custom" });
      button.disabled = true;
      input.blur();
    }
  };

  input.addEventListener("input", (e) => {
    button.disabled = !e.target.value.trim();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveInput();
    }
  });

  button.addEventListener("click", saveInput);

  inputWrapper.append(input, extensionSpan);
  inputGroup.append(inputWrapper, button);
  container.append(label, inputGroup);
}

function createRange(container, item) {
  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.justifyContent = "space-between";
  topRow.style.marginBottom = "5px";

  const label = document.createElement("label");
  label.className = "setting-label block-label";
  label.style.marginBottom = "0";
  label.textContent = browser.i18n.getMessage(item.l10nLabel) || item.key;

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "range-value";
  valueDisplay.id = `range-val-${item.key}`;

  topRow.append(label, valueDisplay);

  const sliderContainer = document.createElement("div");
  sliderContainer.className = "slider-container";

  const input = document.createElement("input");
  input.type = "range";
  input.id = item.key;
  input.min = item.min;
  input.max = item.max;
  input.step = item.step;

  const datalistId = `ticks-${item.key}`;
  const datalist = document.createElement("datalist");
  datalist.id = datalistId;

  const range = item.max - item.min;
  const tickStep = range > 0 ? range / 5 : 10;
  for (let i = item.min; i <= item.max; i += tickStep) {
    const option = document.createElement("option");
    option.value = i;
    datalist.appendChild(option);
  }
  input.setAttribute("list", datalistId);

  input.addEventListener("input", async (e) => {
    const val = parseInt(e.target.value, 10);
    valueDisplay.textContent = val + (item.unit || "");
    await browser.storage.local.set({ [item.key]: val });
  });

  sliderContainer.append(input, datalist);
  container.append(topRow, sliderContainer);
}
