import { getAllSettings } from "../settings/settings.js";

browser.runtime.connect({ name: "popup" });

const POPUP_WIDTH_PX = 300;
const POPUP_HEIGHT_PX = 250;
const SCREEN_MARGIN_PX = 8;
const ANIMATION_DURATION_MS = 270;

const params = new URLSearchParams(window.location.search);

const parentVisualViewport = {
  scale: parseFloat(params.get("scale")),
  offsetLeft: parseFloat(params.get("offsetLeft")),
  offsetTop: parseFloat(params.get("offsetTop")),
  width: parseFloat(params.get("width")),
  height: parseFloat(params.get("height")),
};

const mouseoverPromise = new Promise(resolve =>
  document.addEventListener("mouseover", resolve, { once: true })
);

window.addEventListener("pageshow", ({ persisted }) => {
  if (persisted) {
    browser.runtime.sendMessage({ type: "cancel" });
  }
});

const [initData, settings] = await Promise.all([
  browser.runtime.sendMessage({ type: "initPopup" }),
  getAllSettings(),
  waitforStableLayout(),
]);

if (!initData) {
  browser.runtime.sendMessage({ type: "cancel" });
} else {
  const {
    clipboardImage,
    positionData,
    backgroundDevicePixelRatio,
    inputAttributes,
    isTopFrame,
  } = initData;

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
    defaultFilename = String(Temporal.Now.instant().epochMilliseconds);
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

    newText = currentText.replace(/\.(png|jpg)$/i, "");

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

  formatToggle.addEventListener("pointerdown", async e => {
    if (e.button === 2) return;
    e.preventDefault();

    if (formatToggle.disabled) return;
    formatToggle.disabled = true;

    const newType = settings.defaultFileType === "jpeg" ? "png" : "jpeg";
    await setFileType(newType, true);

    formatToggle.disabled = false;
  });

  preview.addEventListener("click", () => {
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
    browser.runtime.sendMessage({ type: "files", files: dataTransfer.files });
  });

  selectAll.addEventListener("click", () => {
    root.style.opacity = "0";
    if (isTopFrame) {
      browser.runtime.sendMessage({ type: "showPicker" });
    } else {
      showPicker(inputAttributes);
    }
  });

  filenameContainer.addEventListener("click", () => {
    filenameDiv.focus();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      e.preventDefault();
      browser.runtime.sendMessage({ type: "cancel" });
    }
  });

  document.addEventListener("pointerdown", e => {
    if (e.target === document.body) {
      browser.runtime.sendMessage({ type: "cancel" });
    }
  });

  filenameDiv.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      preview.click();
    }
  });

  if (settings.showFilenameBox) {
    filenameDiv.focus();
    selectBaseName(filenameDiv);
  }

  const popupWidth =
    (POPUP_WIDTH_PX * backgroundDevicePixelRatio) / window.devicePixelRatio;
  const popupHeight =
    (POPUP_HEIGHT_PX * backgroundDevicePixelRatio) / window.devicePixelRatio;

  const anchor = resolveAnchor({ ...positionData, isTopFrame });
  const { posX, posY } = await calculatePopupPosition(
    anchor,
    mouseoverPromise,
    popupWidth,
    popupHeight,
    SCREEN_MARGIN_PX
  );

  root.style.left = `${
    ((posX + parentVisualViewport.offsetLeft) / window.visualViewport.width) *
    100
  }%`;
  root.style.top = `${
    ((posY + parentVisualViewport.offsetTop) / window.visualViewport.height) *
    100
  }%`;

  const { matches: prefersReducedMotion } = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  if (!prefersReducedMotion) {
    let animation = root.animate(
      [
        {
          transform: "skew(2deg, 1deg) scale(0.95)",
          opacity: "0",
        },
        {
          opacity: "1",
          transform: "none",
        },
      ],
      {
        duration: ANIMATION_DURATION_MS,
        easing: "cubic-bezier(.07, .95, 0, 1)",
        fill: "forwards",
      }
    );
    await animation.finished;
    animation.commitStyles();
    animation.cancel();
  } else {
    root.style.opacity = "1";
  }
}

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

function showPicker(inputAttributes) {
  const decoyInput = document.createElement("input");
  for (const attrName of [
    "accept",
    "capture",
    "multiple",
    "type",
    "webkitdirectory",
  ]) {
    if (inputAttributes[attrName])
      decoyInput.setAttribute(attrName, inputAttributes[attrName]);
  }

  decoyInput.addEventListener(
    "change",
    e => {
      browser.runtime.sendMessage({ type: "files", files: e.target.files });
    },
    { once: true }
  );

  decoyInput.addEventListener(
    "cancel",
    e => {
      browser.runtime.sendMessage({ type: "cancel" });
    },
    { once: true }
  );

  decoyInput.showPicker();
}

function selectBaseName(element) {
  if (!element.firstChild) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function resolveAnchor(data) {
  const { inputRect, win, event, isTopFrame } = data;

  const isVisible = r => {
    return (
      r.top < parentVisualViewport.height &&
      r.top + r.height > 0 &&
      r.left < parentVisualViewport.width &&
      r.left + r.width > 0
    );
  };

  const toVisualRect = rect => {
    let visualX, visualY;

    if (isTopFrame) {
      visualX = rect.left - parentVisualViewport.offsetLeft;
      visualY = rect.top - parentVisualViewport.offsetTop;
    } else {
      let frameScreenX, frameScreenY;

      if (event && (event.screenX !== 0 || event.clientX !== 0)) {
        frameScreenX =
          event.screenX - event.clientX * parentVisualViewport.scale;
        frameScreenY =
          event.screenY - event.clientY * parentVisualViewport.scale;
      } else {
        frameScreenX = win.mozInnerScreenX;
        frameScreenY = win.mozInnerScreenY;
      }

      const rectScreenX = rect.left * parentVisualViewport.scale + frameScreenX;
      const rectScreenY = rect.top * parentVisualViewport.scale + frameScreenY;

      visualX =
        (rectScreenX - window.mozInnerScreenX) / parentVisualViewport.scale;
      visualY =
        (rectScreenY - window.mozInnerScreenY) / parentVisualViewport.scale;
    }

    const result = {
      x: visualX,
      y: visualY,
      width: rect.width,
      height: rect.height,
    };

    return result;
  };

  const isHuge = (w, h) =>
    w > parentVisualViewport.width * 0.8 &&
    h > parentVisualViewport.height * 0.8;

  if (
    event?.targetRect?.width > 0 &&
    isVisible(event.targetRect) &&
    !isHuge(event.targetRect.width, event.targetRect.height)
  ) {
    return toVisualRect(event.targetRect);
  }

  if (
    (inputRect.width > 0 || inputRect.height > 0) &&
    isVisible(inputRect) &&
    !isHuge(inputRect.width, inputRect.height)
  ) {
    return toVisualRect(inputRect);
  }

  if (event && event.screenX !== 0 && event.screenY !== 0) {
    const visualX =
      (event.screenX - window.mozInnerScreenX) / parentVisualViewport.scale;
    const visualY =
      (event.screenY - window.mozInnerScreenY) / parentVisualViewport.scale;

    const result = {
      x: visualX,
      y: visualY,
      width: 0,
      height: 0,
    };
    return result;
  }

  return null;
}

async function calculatePopupPosition(
  anchor,
  mousePromise,
  popupWidth,
  popupHeight,
  screenMargin
) {
  let targetRect = null;

  if (anchor) {
    targetRect = {
      left: anchor.x,
      top: anchor.y,
      width: anchor.width,
      height: anchor.height,
    };
  } else {
    const mouse = await Promise.race([
      mousePromise,
      new Promise(resolve => setTimeout(resolve, 150)),
    ]);

    if (mouse) {
      const visualX =
        (mouse.screenX - window.mozInnerScreenX) / parentVisualViewport.scale;
      const visualY =
        (mouse.screenY - window.mozInnerScreenY) / parentVisualViewport.scale;

      targetRect = {
        left: visualX,
        top: visualY,
        width: 0,
        height: 0,
      };
    }
  }

  if (!targetRect) {
    return {
      posX: (parentVisualViewport.width - popupWidth) / 2,
      posY: (parentVisualViewport.height - popupHeight) / 2,
    };
  }

  let posX = targetRect.left;

  if (targetRect.width > 0) {
    const shouldCenter =
      targetRect.width > popupWidth || targetRect.width < popupWidth / 2;
    if (shouldCenter) {
      posX = targetRect.left + (targetRect.width - popupWidth) / 2;
    }
  }

  let posY;

  const isSubstantiallyLarger =
    targetRect.width > popupWidth * 2 && targetRect.height > popupHeight * 2;

  if (isSubstantiallyLarger) {
    posY = targetRect.top + screenMargin;
  } else {
    const spaceAbove = targetRect.top;
    const spaceBelow =
      parentVisualViewport.height - (targetRect.top + targetRect.height);

    const placeBelow = spaceBelow >= popupHeight || spaceBelow > spaceAbove;

    posY = placeBelow
      ? targetRect.top + targetRect.height
      : targetRect.top - popupHeight;
  }

  const result = {
    posX: clamp(
      posX,
      screenMargin,
      parentVisualViewport.width - popupWidth - screenMargin
    ),
    posY: clamp(
      posY,
      screenMargin,
      parentVisualViewport.height - popupHeight - screenMargin
    ),
  };

  return result;
}

function generateDefaultFilename() {
  const now = Temporal.Now.plainDateTimeISO();
  const pad = n => String(n).padStart(2, "0");
  return (
    `img-` +
    `${now.year}-${pad(now.month)}-${pad(now.day)}-` +
    `${pad(now.hour)}-${pad(now.minute)}-${pad(now.second)}`
  );
}

function waitforStableLayout() {
  if (window.visualViewport.width >= POPUP_WIDTH_PX) {
    return;
  }

  return new Promise(resolve => {
    const controller = new AbortController();
    const { signal } = controller;
    const onResize = () => {
      if (window.visualViewport.width >= POPUP_WIDTH_PX) {
        controller.abort();
        resolve();
      }
    };
    window.visualViewport.addEventListener("resize", onResize, {
      signal,
    });
  });
}
