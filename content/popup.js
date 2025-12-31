import { getSettings } from "../settings/settings.js";

const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 250;
const SCREEN_MARGIN = 8;
const ANIMATION_DURATION = 270;

async function convertToJpeg(blob, quality) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("bitmaprenderer", { alpha: false });
  ctx.transferFromImageBitmap(bitmap);
  return await canvas.convertToBlob({
    type: "image/jpeg",
    quality: quality,
  });
}

function selectBaseName(element) {
  if (!element.firstChild) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

function resolveAnchor(data) {
  const { inputRect, win, event } = data;
  const { width: vw, height: vh } = window.visualViewport;

  const isVisible = (r) => {
    return r.top < vh && r.top + r.height > 0 && r.left < vw && r.left + r.width > 0;
  };

  const hasValidCoords = event && (event.screenX !== 0 || event.clientX !== 0);
  const offsetX = hasValidCoords ? event.screenX - event.clientX : win.mozInnerScreenX;
  const offsetY = hasValidCoords ? event.screenY - event.clientY : win.mozInnerScreenY;

  const toScreenRect = (rect) => ({
    x: rect.left + offsetX,
    y: rect.top + offsetY,
    width: rect.width,
    height: rect.height,
  });

  const isHuge = (w, h) => w > vw * 0.8 && h > vh * 0.8;

  if (event?.targetRect?.width > 0 && isVisible(event.targetRect) && !isHuge(event.targetRect.width, event.targetRect.height)) {
    return toScreenRect(event.targetRect);
  }

  if ((inputRect.width > 0 || inputRect.height > 0) && isVisible(inputRect) && !isHuge(inputRect.width, inputRect.height)) {
    return toScreenRect(inputRect);
  }

  if (event && event.clientX !== 0 && event.clientY !== 0) {
    return {
      x: event.clientX + offsetX,
      y: event.clientY + offsetY,
      width: 0,
      height: 0,
    };
  }

  return null;
}

async function calculatePickerPosition(anchor, mousePromise, pickerWidth, pickerHeight, screenMargin) {
  const viewport = window.visualViewport;

  let targetRect = null;

  if (anchor) {
    targetRect = {
      left: anchor.x - window.mozInnerScreenX,
      top: anchor.y - window.mozInnerScreenY,
      width: anchor.width,
      height: anchor.height,
    };
  } else {
    const mouse = await Promise.race([mousePromise, new Promise((resolve) => setTimeout(resolve, 200))]);

    if (mouse) {
      targetRect = { left: mouse.clientX, top: mouse.clientY, width: 0, height: 0 };
    }
  }

  if (!targetRect) {
    return {
      posX: (viewport.width - pickerWidth) / 2,
      posY: (viewport.height - pickerHeight) / 2,
    };
  }

  let posX = targetRect.left;

  if (targetRect.width > 0) {
    const shouldCenter = targetRect.width > pickerWidth || targetRect.width < pickerWidth / 2;
    if (shouldCenter) {
      posX = targetRect.left + (targetRect.width - pickerWidth) / 2;
    }
  }

  let posY;

  const isSubstantiallyLarger = targetRect.width > pickerWidth * 2 && targetRect.height > pickerHeight * 2;

  if (isSubstantiallyLarger) {
    posY = targetRect.top + screenMargin;
  } else {
    const spaceAbove = targetRect.top;
    const spaceBelow = viewport.height - (targetRect.top + targetRect.height);

    const placeBelow = spaceBelow >= pickerHeight || spaceBelow > spaceAbove;

    posY = placeBelow ? targetRect.top + targetRect.height : targetRect.top - pickerHeight;
  }

  return {
    posX: clamp(posX, screenMargin, viewport.width - pickerWidth - screenMargin),
    posY: clamp(posY, screenMargin, viewport.height - pickerHeight - screenMargin),
  };
}

function showPicker(inputAttributes) {
  const decoyInput = document.createElement("input");
  for (const attrName of ["accept", "capture", "multiple", "type", "webkitdirectory"]) {
    if (inputAttributes[attrName]) decoyInput.setAttribute(attrName, inputAttributes[attrName]);
  }

  decoyInput.addEventListener(
    "change",
    (e) => {
      browser.runtime.sendMessage({ type: "file", files: e.target.files });
    },
    { once: true }
  );

  decoyInput.showPicker();
}

function generateDefaultFilename() {
  const now = Temporal.Now.plainDateTimeISO();
  return `img-${now.toString({ fractionalSecondDigits: 0 }).replace(/[:T]/g, "-")}`;
}

function waitforStableLayout() {
  if (window.visualViewport.width >= PICKER_WIDTH) {
    return;
  }

  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    const onResize = () => {
      if (window.visualViewport.width >= PICKER_WIDTH) {
        controller.abort();
        resolve();
      }
    };
    window.visualViewport.addEventListener("resize", onResize, { signal });
  });
}

const mouseoverPromise = new Promise((resolve) => document.addEventListener("mouseover", resolve, { once: true }));

window.addEventListener("pageshow", ({ persisted }) => {
  if (persisted) {
    browser.runtime.sendMessage({ type: "cancel" });
  }
});

const [initData, settings] = await Promise.all([
  browser.runtime.sendMessage({ type: "initPopup" }),
  getSettings(),
  waitforStableLayout(),
]);

if (!initData) {
  browser.runtime.sendMessage({ type: "cancel" });
} else {
  const { clipboardImage, inputAttributes, positionData, backgroundDevicePixelRatio } = initData;

  const root = document.getElementById("root");
  const filenameContainer = document.getElementById("filenameContainer");
  const filenameDiv = document.getElementById("filenameBase");
  const filenameExt = document.getElementById("filenameExt");
  const formatToggle = document.getElementById("formatToggle");
  const preview = document.getElementById("preview");
  const selectAll = document.getElementById("selectAll");

  let currentBlob = clipboardImage;
  let previewUrl = null;

  let defaultFilename;
  if (settings.defaultFilename === "unix") {
    defaultFilename = String(Date.now());
  } else if (settings.defaultFilename === "unknown") {
    defaultFilename = "unknown";
  } else if (settings.defaultFilename === "custom") {
    defaultFilename = settings.customFilenameText || "image";
  } else {
    defaultFilename = generateDefaultFilename();
  }

  const jpegQuality = settings.jpegQuality / 100;

  filenameDiv.textContent = defaultFilename;
  filenameDiv.dataset.placeholder = defaultFilename;

  const updateEmptyState = () => {
    filenameDiv.classList.toggle("empty", filenameDiv.textContent === "");
  };
  filenameDiv.addEventListener("input", updateEmptyState);
  updateEmptyState();

  if (!settings.showFilenameBox) {
    filenameContainer.style.display = "none";
  }

  const setFileType = async (type, saveToStorage = false) => {
    let newBlob;

    if (type === "jpeg") {
      try {
        newBlob = await convertToJpeg(clipboardImage, jpegQuality);
        filenameExt.textContent = ".jpg";
        formatToggle.textContent = "JPG";
      } catch (e) {
        console.error("JPG conversion failed", e);
        return setFileType("png", saveToStorage);
      }
    } else {
      newBlob = clipboardImage;
      filenameExt.textContent = ".png";
      formatToggle.textContent = "PNG";
    }

    currentBlob = newBlob;
    settings.defaultFileType = type;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(currentBlob);
    preview.style.backgroundImage = `url(${previewUrl})`;

    const currentText = filenameDiv.textContent;
    let newText = currentText;

    if (type === "jpeg") {
      newText = currentText.replace(/\.png$/i, "");
    } else {
      newText = currentText.replace(/\.jpg$/i, "");
    }

    if (newText !== currentText) {
      const isFocused = document.activeElement === filenameDiv;
      let caretPos = 0;

      if (isFocused) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (range.startContainer.nodeType === Node.TEXT_NODE) {
            caretPos = range.startOffset;
          } else {
            caretPos = 0;
          }
        }
      }

      filenameDiv.textContent = newText;

      if (isFocused) {
        const textNode = filenameDiv.firstChild;
        if (textNode) {
          const range = document.createRange();
          const safePos = Math.min(caretPos, textNode.length);
          range.setStart(textNode, safePos);
          range.setEnd(textNode, safePos);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          filenameDiv.focus();
        }
      }
    }

    updateEmptyState();

    if (saveToStorage) {
      browser.storage.local.set({ defaultFileType: type });
    }
  };

  await setFileType(settings.defaultFileType, false);

  selectAll.textContent = browser.i18n.getMessage("showAllFiles");

  const updateDPR = () => {
    const dpr = window.devicePixelRatio / backgroundDevicePixelRatio;
    document.body.style.setProperty("--devicePixelRatio", dpr);
  };

  updateDPR();

  window.addEventListener("resize", updateDPR);

  formatToggle.addEventListener("pointerdown", async (e) => {
    if (e.button === 2) return;
    e.preventDefault();

    if (formatToggle.disabled) return;
    formatToggle.disabled = true;

    const newType = settings.defaultFileType === "jpeg" ? "png" : "jpeg";
    await setFileType(newType, true);

    formatToggle.disabled = false;
  });

  preview.addEventListener("click", () => {
    if (settings.clearOnPaste) browser.runtime.sendMessage({ type: "clearClipboard" });
    const dataTransfer = new DataTransfer();

    let base = filenameDiv.textContent.trim();
    if (base.length === 0) base = defaultFilename;

    const isPng = currentBlob.type === "image/png";
    const ext = isPng ? ".png" : ".jpg";

    if (base.toLowerCase().endsWith(ext)) {
      base = base.substring(0, base.length - 4);
    }

    const filename = base + ext;

    dataTransfer.items.add(
      new File([currentBlob], filename, {
        type: currentBlob.type,
      })
    );
    browser.runtime.sendMessage({ type: "file", files: dataTransfer.files });
  });

  selectAll.addEventListener("click", () => {
    showPicker(inputAttributes);
  });

  filenameContainer.addEventListener("click", () => {
    filenameDiv.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      browser.runtime.sendMessage({ type: "cancel" });
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.target === document.body) {
      browser.runtime.sendMessage({ type: "cancel" });
    }
  });

  filenameDiv.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      preview.click();
    }
  });

  if (settings.showFilenameBox) {
    filenameDiv.focus();
    selectBaseName(filenameDiv);
  }

  const modalWidth = (PICKER_WIDTH * backgroundDevicePixelRatio) / window.devicePixelRatio;
  const modalHeight = (PICKER_HEIGHT * backgroundDevicePixelRatio) / window.devicePixelRatio;

  const anchor = resolveAnchor(positionData);
  const { posX, posY } = await calculatePickerPosition(anchor, mouseoverPromise, modalWidth, modalHeight, SCREEN_MARGIN);

  root.style.left = `${(posX / window.visualViewport.width) * 100}%`;
  root.style.top = `${(posY / window.visualViewport.height) * 100}%`;

  const { matches: prefersReducedMotion } = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!prefersReducedMotion) {
    root.animate(
      [
        { transform: "skew(2deg, 1deg) scale(0.95)", opacity: "0" },
        { opacity: "1", transform: "none" },
      ],
      {
        duration: ANIMATION_DURATION,
        easing: "cubic-bezier(.07, .95, 0, 1)",
        fill: "forwards",
      }
    );
  } else {
    root.style.opacity = "1";
  }
}
