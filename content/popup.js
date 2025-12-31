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

const clamp = (val, min, max) => Math.max(min, Math.min(val, max));

async function calculatePickerPosition(anchor, mousePromise, pickerWidth, pickerHeight, screenMargin) {
  const winWidth = window.visualViewport.width;
  const winHeight = window.visualViewport.height;

  const maxX = winWidth - pickerWidth - screenMargin;
  const maxY = winHeight - pickerHeight - screenMargin;

  let posX, posY;

  if (anchor && (anchor.width > 0 || anchor.height > 0)) {
    const anchorLeft = anchor.x - window.mozInnerScreenX;
    const anchorTop = anchor.y - window.mozInnerScreenY;

    if (anchor.width > pickerWidth || anchor.width < pickerWidth / 2) {
      posX = anchorLeft + (anchor.width - pickerWidth) / 2;
    } else {
      posX = anchorLeft;
    }

    if (anchor.width > pickerWidth && anchor.height > pickerHeight) {
      posY = anchorTop + screenMargin;
    } else {
      const spaceAbove = anchorTop;
      const spaceBelow = winHeight - (anchorTop + anchor.height);
      const useAbove = spaceAbove >= pickerHeight || (spaceAbove > spaceBelow && spaceBelow < pickerHeight);

      posY = useAbove ? anchorTop - pickerHeight : anchorTop + anchor.height;
    }
  } else {
    const mouse = await mousePromise;
    posX = mouse.clientX;

    const spaceBelow = winHeight - mouse.clientY;

    if (spaceBelow >= pickerHeight + screenMargin) {
      posY = mouse.clientY;
    } else {
      posY = mouse.clientY - pickerHeight;
    }
  }

  return {
    posX: clamp(posX, screenMargin, maxX),
    posY: clamp(posY, screenMargin, maxY),
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

const [initData, settings] = await Promise.all([
  browser.runtime.sendMessage({ type: "initPopup" }),
  getSettings(),
  waitforStableLayout(),
]);

if (!initData) {
  browser.runtime.sendMessage({ type: "cancel" });
} else {
  const { clipboardImage, inputAttributes, anchor, backgroundDevicePixelRatio } = initData;

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

  const dpr = window.devicePixelRatio / backgroundDevicePixelRatio;
  document.body.style.setProperty("--devicePixelRatio", dpr);

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
  } else {
    document.body.tabIndex = -1;
    document.body.focus();
  }

  const modalWidth = (PICKER_WIDTH * backgroundDevicePixelRatio) / window.devicePixelRatio;
  const modalHeight = (PICKER_HEIGHT * backgroundDevicePixelRatio) / window.devicePixelRatio;

  const { posX, posY } = await calculatePickerPosition(anchor, mouseoverPromise, modalWidth, modalHeight, SCREEN_MARGIN);

  root.style.position = "fixed";
  root.style.left = `${posX}px`;
  root.style.top = `${posY}px`;
  root.style.margin = "0";
  root.style.opacity = "1";

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
