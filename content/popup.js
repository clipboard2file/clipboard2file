import { getAllSettings } from "../settings/settings.js";

browser.runtime.connect({ name: "popup" });

const POPUP_WIDTH_PX = 300;
const POPUP_HEIGHT_PX = 250;
const SCREEN_MARGIN_PX = 8;
const ANIMATION_DURATION_MS = 230;

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

const [init, settings] = await Promise.all([
  browser.runtime.sendMessage({ type: "initPopup" }),
  getAllSettings(),
  waitforStableLayout(),
]);

const {
  clipboardBlob,
  clipboardType,
  positionData,
  backgroundDevicePixelRatio,
  backgroundPrefersDark,
  inputAttributes,
  isTopFrame,
} = init;

const popup = document.getElementById("popup");
const filenameContainer = document.getElementById("filenameContainer");
const filenameDiv = document.getElementById("basename");
const formatToggle = document.getElementById("formatToggle");
const floatingFormatToggle = document.getElementById("floatingFormatToggle");
const preview = document.getElementById("preview");
const imagePreview = document.getElementById("imagePreview");
const textPreview = document.getElementById("textPreview");
const showAllFiles = document.getElementById("showAllFiles");

const originalBlob = clipboardBlob;
const jpegQuality = settings.jpegQuality / 100;
const textExtension = settings.textExtension;

let currentBlob = clipboardBlob;
let currentFormat = settings.defaultFileType;
let lastSelection = null;

const computeInitialBaseName = () => {
  const isText = clipboardType === "text";
  const mode = isText
    ? settings.defaultFilenameText
    : settings.defaultFilenameImage;

  if (mode === "unix") {
    return String(Temporal.Now.instant().epochMilliseconds);
  }

  if (mode === "custom") {
    const customValue = isText
      ? settings.customFilenameText
      : settings.customFilenameImage;
    return customValue || (isText ? "text" : "image");
  }

  return (isText ? "" : "img-") + getFormattedDate();
};

const defaultFilenameBase = computeInitialBaseName();

const computeFinalFilename = () => {
  const input = filenameDiv.textContent.trim();
  const baseName = input.length > 0 ? input : defaultFilenameBase;

  if (clipboardType === "text") {
    return input.length === 0 ? `${baseName}.${textExtension}` : baseName;
  }

  const ext = currentFormat === "jpeg" ? ".jpg" : ".png";
  return baseName.replace(/\.(png|jpg|jpeg)$/i, "") + ext;
};

const updatePreview = () => {
  if (clipboardType === "text") {
    imagePreview.hidden = true;
    textPreview.hidden = false;

    currentBlob.text().then(text => {
      textPreview.textContent = text;
    });

    return;
  }

  if (clipboardType === "image") {
    textPreview.hidden = true;
    imagePreview.hidden = false;

    if (imagePreview.src) {
      URL.revokeObjectURL(imagePreview.src);
    }
    imagePreview.src = URL.createObjectURL(currentBlob);
  }
};

const setFileType = async (type, saveToStorage = false) => {
  if (clipboardType === "text") {
    updatePreview();
    return;
  }

  if (clipboardType === "image") {
    popup.dataset.format = type;
    currentFormat = type;

    if (type === "jpeg") {
      currentBlob = await convertToJpeg(originalBlob, jpegQuality);
    } else {
      currentBlob = originalBlob;
    }

    updatePreview();

    if (saveToStorage) {
      browser.storage.local.set({ defaultFileType: type });
    }
  }
};

const updateEmptyState = () => {
  filenameDiv.classList.toggle("empty", filenameDiv.textContent === "");
};

const selectBaseName = element => {
  if (!element.firstChild) return;
  const range = document.createRange();

  if (clipboardType === "text") {
    const text = element.textContent;
    const lastDot = text.lastIndexOf(".");
    if (lastDot > 0 && element.firstChild.nodeType === Node.TEXT_NODE) {
      range.setStart(element.firstChild, 0);
      range.setEnd(element.firstChild, lastDot);
    } else {
      range.selectNodeContents(element);
    }
  } else if (clipboardType === "image") {
    range.selectNodeContents(element);
  }

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

if (clipboardType === "text") {
  const full = `${defaultFilenameBase}.${textExtension}`;
  filenameDiv.textContent = full;
  filenameDiv.dataset.placeholder = full;
} else if (clipboardType === "image") {
  filenameDiv.textContent = defaultFilenameBase;
  filenameDiv.dataset.placeholder = defaultFilenameBase;
}

const showFilenameBox =
  clipboardType === "text"
    ? settings.showFilenameBoxText
    : settings.showFilenameBoxImage;

if (showFilenameBox) {
  filenameContainer.hidden = false;
}

if (settings.showFormatToggleButton && clipboardType === "image") {
  if (showFilenameBox) {
    formatToggle.hidden = false;
  } else {
    floatingFormatToggle.hidden = false;
  }
}

showAllFiles.textContent = browser.i18n.getMessage("showAllFiles");

filenameDiv.addEventListener("input", updateEmptyState);
updateEmptyState();

await setFileType(settings.defaultFileType, false);

const updateDPR = () => {
  const dpr = window.devicePixelRatio / backgroundDevicePixelRatio;
  document.body.style.setProperty("--devicePixelRatio", dpr);
};
updateDPR();
window.addEventListener("resize", updateDPR);

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (filenameDiv.contains(range.commonAncestorContainer)) {
      lastSelection = {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focusNode: selection.focusNode,
        focusOffset: selection.focusOffset,
      };
    }
  }
});

const restoreSelection = () => {
  if (!lastSelection) {
    return;
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.setBaseAndExtent(
    lastSelection.anchorNode,
    lastSelection.anchorOffset,
    lastSelection.focusNode,
    lastSelection.focusOffset
  );
};

window.addEventListener("blur", e => {
  if (e.target === window && document.activeElement === filenameDiv) {
    restoreSelection();
  }
});

filenameDiv.addEventListener("focus", restoreSelection);

filenameContainer.addEventListener("click", e => {
  if (e.target !== formatToggle) {
    filenameDiv.focus();
  }
});

const handleEnter = e => {
  if (e.key === "Enter") {
    e.preventDefault();
    preview.click();
  }
};

filenameDiv.addEventListener("keydown", handleEnter);
textPreview.addEventListener("keydown", handleEnter);

const handleFormatToggle = async e => {
  e.preventDefault();
  if (
    e.button === 2 ||
    (e.type === "click" && e.mozInputSource === MouseEvent.MOZ_SOURCE_MOUSE)
  ) {
    return;
  }

  const newType = currentFormat === "jpeg" ? "png" : "jpeg";
  await setFileType(newType, true);
};

if (clipboardType === "image") {
  formatToggle.addEventListener("mousedown", handleFormatToggle);
  floatingFormatToggle.addEventListener("mousedown", handleFormatToggle);
  formatToggle.addEventListener("click", handleFormatToggle);
  floatingFormatToggle.addEventListener("click", handleFormatToggle);
}

preview.addEventListener(
  "click",
  () => {
    const filename = computeFinalFilename();
    const file = new File([currentBlob], filename, { type: currentBlob.type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    browser.runtime.sendMessage({
      type: "files",
      files: dataTransfer.files,
      isFromClipboard: true,
    });
  },
  { once: true }
);

showAllFiles.addEventListener(
  "click",
  async () => {
    popup.style.opacity = "0";
    const succeeded = await browser.runtime.sendMessage({ type: "showPicker" });

    if (!succeeded) {
      showPicker(inputAttributes);
    }
  },
  { once: true }
);

if (showFilenameBox) {
  filenameDiv.focus();
  selectBaseName(filenameDiv);
}

const prefersDark =
  settings.theme === "auto" ? backgroundPrefersDark : settings.theme === "dark";

popup.toggleAttribute("prefersDark", prefersDark);

const popupWidth =
  (POPUP_WIDTH_PX * backgroundDevicePixelRatio) / window.devicePixelRatio;
const popupHeight =
  (POPUP_HEIGHT_PX * backgroundDevicePixelRatio) / window.devicePixelRatio;
const screenMargin =
  (SCREEN_MARGIN_PX * backgroundDevicePixelRatio) /
  window.devicePixelRatio /
  parentVisualViewport.scale;

const anchor = resolveAnchor({ ...positionData, isTopFrame });

const { popupX, popupY, scale } = await calculatePopupPosition(
  anchor,
  mouseoverPromise,
  popupWidth,
  popupHeight,
  screenMargin
);

popup.style.left = `${(popupX / window.visualViewport.width) * 100}%`;
popup.style.top = `${(popupY / window.visualViewport.height) * 100}%`;
popup.style.zoom = scale;

if (clipboardType === "image") {
  try {
    await imagePreview.decode();
  } catch (error) {
    console.error(error);
  }
}

const { matches: prefersReducedMotion } = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

if (prefersReducedMotion) {
  popup.style.opacity = "1";
} else {
  let animation = popup.animate(
    [
      { transform: "skew(2deg, 1deg) scale(0.95)", opacity: "0" },
      { opacity: "1", transform: "none" },
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
}

function getFormattedDate() {
  const now = Temporal.Now.plainDateTimeISO();
  const p = n => String(n).padStart(2, "0");
  return (
    `${now.year}-${p(now.month)}-${p(now.day)}-` +
    `${p(now.hour)}-${p(now.minute)}-${p(now.second)}`
  );
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
  decoyInput.type = "file";
  for (const attrName of ["accept", "capture", "multiple"]) {
    decoyInput.setAttribute(attrName, inputAttributes[attrName]);
  }

  decoyInput.addEventListener("change", e => {
    browser.runtime.sendMessage({ type: "files", files: e.target.files });
  });

  decoyInput.addEventListener("cancel", e => {
    browser.runtime.sendMessage({ type: "cancel" });
  });

  decoyInput.showPicker();
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function resolveAnchor({ inputRect, win, event, isTopFrame }) {
  const toParentVisualRect = rect => {
    let parentVisualViewportRelativeX, parentVisualViewportRelativeY;

    if (isTopFrame) {
      parentVisualViewportRelativeX =
        rect.left - parentVisualViewport.offsetLeft;
      parentVisualViewportRelativeY = rect.top - parentVisualViewport.offsetTop;
    } else {
      let screenRelativeFrameX, screenRelativeFrameY;

      if (event && (event.screenX !== 0 || event.clientX !== 0)) {
        screenRelativeFrameX =
          event.screenX - event.clientX * parentVisualViewport.scale;
        screenRelativeFrameY =
          event.screenY - event.clientY * parentVisualViewport.scale;
      } else {
        screenRelativeFrameX = win.mozInnerScreenX;
        screenRelativeFrameY = win.mozInnerScreenY;
      }

      const screenRelativeRectX =
        rect.left * parentVisualViewport.scale + screenRelativeFrameX;
      const screenRelativeRectY =
        rect.top * parentVisualViewport.scale + screenRelativeFrameY;

      parentVisualViewportRelativeX =
        (screenRelativeRectX - window.mozInnerScreenX) /
        parentVisualViewport.scale;
      parentVisualViewportRelativeY =
        (screenRelativeRectY - window.mozInnerScreenY) /
        parentVisualViewport.scale;
    }

    const clampedParentVisualViewportRelativeLeft = Math.max(
      parentVisualViewportRelativeX,
      0
    );
    const clampedParentVisualViewportRelativeTop = Math.max(
      parentVisualViewportRelativeY,
      0
    );
    const clampedParentVisualViewportRelativeRight = Math.min(
      parentVisualViewportRelativeX + rect.width,
      parentVisualViewport.width
    );
    const clampedParentVisualViewportRelativeBottom = Math.min(
      parentVisualViewportRelativeY + rect.height,
      parentVisualViewport.height
    );

    const clampedParentVisualViewportRelativeWidth = Math.max(
      0,
      clampedParentVisualViewportRelativeRight -
        clampedParentVisualViewportRelativeLeft
    );
    const clampedParentVisualViewportRelativeHeight = Math.max(
      0,
      clampedParentVisualViewportRelativeBottom -
        clampedParentVisualViewportRelativeTop
    );

    return {
      x: clampedParentVisualViewportRelativeLeft,
      y: clampedParentVisualViewportRelativeTop,
      width: clampedParentVisualViewportRelativeWidth,
      height: clampedParentVisualViewportRelativeHeight,
    };
  };

  const isValidAnchor = rect => {
    const isVisible = rect.width > 0 && rect.height > 0;

    const isHuge =
      rect.width > parentVisualViewport.width * 0.6 &&
      rect.height > parentVisualViewport.height * 0.6;

    return isVisible && !isHuge;
  };

  if (event?.targetRect?.width >= 0) {
    const parentVisualRect = toParentVisualRect(event.targetRect);
    if (isValidAnchor(parentVisualRect)) {
      return parentVisualRect;
    }
  }

  if (inputRect.width > 0 || inputRect.height > 0) {
    const parentVisualRect = toParentVisualRect(inputRect);
    if (isValidAnchor(parentVisualRect)) {
      return parentVisualRect;
    }
  }

  if (event && event.screenX !== 0 && event.screenY !== 0) {
    return {
      x: (event.screenX - window.mozInnerScreenX) / parentVisualViewport.scale,
      y: (event.screenY - window.mozInnerScreenY) / parentVisualViewport.scale,
      width: 0,
      height: 0,
    };
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
      top: anchor.y,
      left: anchor.x,
      bottom: anchor.y + anchor.height,
      right: anchor.x + anchor.width,
      width: anchor.width,
      height: anchor.height,
    };
  } else {
    const mouse = await Promise.race([
      mousePromise,
      new Promise(resolve => setTimeout(resolve, 100)),
    ]);

    if (mouse) {
      const parentVisualViewportRelativeMouseX =
        (mouse.screenX - window.mozInnerScreenX) / parentVisualViewport.scale;
      const parentVisualViewportRelativeMouseY =
        (mouse.screenY - window.mozInnerScreenY) / parentVisualViewport.scale;

      targetRect = {
        top: parentVisualViewportRelativeMouseY,
        left: parentVisualViewportRelativeMouseX,
        bottom: parentVisualViewportRelativeMouseY,
        right: parentVisualViewportRelativeMouseX,
        width: 0,
        height: 0,
      };
    }
  }

  const parentVisualViewportAvailableWidth =
    parentVisualViewport.width - 2 * screenMargin;
  const parentVisualViewportAvailableHeight =
    parentVisualViewport.height - 2 * screenMargin;

  if (!targetRect) {
    const scale = Math.min(
      1,
      parentVisualViewportAvailableWidth / popupWidth,
      parentVisualViewportAvailableHeight / popupHeight
    );
    const parentVisualViewportRelativePopupX =
      screenMargin +
      (parentVisualViewportAvailableWidth - popupWidth * scale) / 2;
    const parentVisualViewportRelativePopupY =
      screenMargin +
      (parentVisualViewportAvailableHeight - popupHeight * scale) / 2;
    return {
      scale,
      popupX:
        parentVisualViewportRelativePopupX + parentVisualViewport.offsetLeft,
      popupY:
        parentVisualViewportRelativePopupY + parentVisualViewport.offsetTop,
    };
  }

  let bestSide = null;

  const updateBest = side => {
    if (!bestSide || side.scale > bestSide.scale) {
      bestSide = side;
    }
  };

  const shouldCenter =
    targetRect.width > 0 &&
    (targetRect.width > popupWidth * parentVisualViewport.scale ||
      targetRect.width < (popupWidth * parentVisualViewport.scale) / 2);

  const parentVisualViewportSpaceBelow =
    parentVisualViewport.height - targetRect.bottom - screenMargin;
  if (parentVisualViewportSpaceBelow > 0) {
    const scale = Math.min(
      1,
      parentVisualViewportAvailableWidth / popupWidth,
      parentVisualViewportSpaceBelow / popupHeight
    );
    const unclampedPopupX = shouldCenter
      ? targetRect.left + (targetRect.width - popupWidth * scale) / 2
      : targetRect.left;
    updateBest({
      scale,
      parentVisualViewportRelativePopupX: unclampedPopupX,
      parentVisualViewportRelativePopupY: targetRect.bottom,
    });
  }

  const parentVisualViewportSpaceAbove = targetRect.top - screenMargin;
  if (parentVisualViewportSpaceAbove > 0) {
    const scale = Math.min(
      1,
      parentVisualViewportAvailableWidth / popupWidth,
      parentVisualViewportSpaceAbove / popupHeight
    );
    const unclampedPopupX = shouldCenter
      ? targetRect.left + (targetRect.width - popupWidth * scale) / 2
      : targetRect.left;
    updateBest({
      scale,
      parentVisualViewportRelativePopupX: unclampedPopupX,
      parentVisualViewportRelativePopupY: targetRect.top - popupHeight * scale,
    });
  }

  const parentVisualViewportSpaceRight =
    parentVisualViewport.width - targetRect.right - screenMargin;
  if (parentVisualViewportSpaceRight > 0) {
    const scale = Math.min(
      1,
      parentVisualViewportSpaceRight / popupWidth,
      parentVisualViewportAvailableHeight / popupHeight
    );
    updateBest({
      scale,
      parentVisualViewportRelativePopupX: targetRect.right,
      parentVisualViewportRelativePopupY: targetRect.top,
    });
  }

  const parentVisualViewportSpaceLeft = targetRect.left - screenMargin;
  if (parentVisualViewportSpaceLeft > 0) {
    const scale = Math.min(
      1,
      parentVisualViewportSpaceLeft / popupWidth,
      parentVisualViewportAvailableHeight / popupHeight
    );
    updateBest({
      scale,
      parentVisualViewportRelativePopupX: targetRect.left - popupWidth * scale,
      parentVisualViewportRelativePopupY: targetRect.top,
    });
  }

  const {
    scale,
    parentVisualViewportRelativePopupX,
    parentVisualViewportRelativePopupY,
  } = bestSide;

  const clampedParentVisualX = clamp(
    parentVisualViewportRelativePopupX,
    screenMargin,
    screenMargin + parentVisualViewportAvailableWidth - popupWidth * scale
  );
  const clampedParentVisualY = clamp(
    parentVisualViewportRelativePopupY,
    screenMargin,
    screenMargin + parentVisualViewportAvailableHeight - popupHeight * scale
  );

  return {
    scale,
    popupX: clampedParentVisualX + parentVisualViewport.offsetLeft,
    popupY: clampedParentVisualY + parentVisualViewport.offsetTop,
  };
}

function waitforStableLayout() {
  return new Promise(resolve => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width >= 12) {
          observer.disconnect();
          resolve();
          return;
        }
      }
    });
    observer.observe(document.documentElement);
  });
}
