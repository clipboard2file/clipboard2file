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

  let lastSelection = null;
  let currentBlob = clipboardImage;
  let previewUrl = null;

  const jpegQuality = settings.jpegQuality / 100;

  const updateDPR = () => {
    const dpr = window.devicePixelRatio / backgroundDevicePixelRatio;
    document.body.style.setProperty("--devicePixelRatio", dpr);
  };

  const updateEmptyState = () => {
    filenameDiv.classList.toggle("empty", filenameDiv.textContent === "");
  };

  const restoreSelection = () => {
    if (!lastSelection) return;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.setBaseAndExtent(
      lastSelection.anchorNode,
      lastSelection.anchorOffset,
      lastSelection.focusNode,
      lastSelection.focusOffset
    );
  };

  const setFileType = async (type, saveToStorage = false) => {
    let newBlob;

    if (type === "jpeg") {
      try {
        newBlob = await convertToJpeg(clipboardImage, jpegQuality);
        filenameExt.textContent = ".jpg";
        formatToggle.textContent = "JPG";
      } catch (e) {
        console.error("JPG conversion failed", e);
        return setFileType("png", false);
      }
    } else {
      newBlob = clipboardImage;
      filenameExt.textContent = ".png";
      formatToggle.textContent = "PNG";
    }

    currentBlob = newBlob;
    settings.defaultFileType = type;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    previewUrl = URL.createObjectURL(currentBlob);
    preview.style.backgroundImage = `url(${previewUrl})`;

    if (saveToStorage) {
      browser.storage.local.set({ defaultFileType: type });
    }
  };

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

  filenameDiv.textContent = defaultFilename;
  filenameDiv.dataset.placeholder = defaultFilename;
  updateEmptyState();

  if (!settings.showFilenameBox) {
    filenameContainer.style.display = "none";
  }

  selectAll.textContent = browser.i18n.getMessage("showAllFiles");

  await setFileType(settings.defaultFileType, false);

  updateDPR();
  window.addEventListener("resize", updateDPR);

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

  window.addEventListener("blur", e => {
    if (e.target === window && document.activeElement === filenameDiv) {
      restoreSelection();
    }
  });

  filenameDiv.addEventListener("focus", restoreSelection);

  filenameContainer.addEventListener("click", () => {
    filenameDiv.focus();
  });

  filenameDiv.addEventListener("input", updateEmptyState);

  filenameDiv.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      preview.click();
    }
  });

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
    if (base.length === 0) {
      base = defaultFilename;
    }

    base = base.replace(/\.(png|jpg|jpeg)$/i, "");

    const isPng = currentBlob.type === "image/png";
    const ext = isPng ? ".png" : ".jpg";
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

  if (settings.showFilenameBox) {
    filenameDiv.focus();
    selectBaseName(filenameDiv);
  }

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

  root.style.left = `${(popupX / window.visualViewport.width) * 100}%`;
  root.style.top = `${(popupY / window.visualViewport.height) * 100}%`;
  root.style.zoom = scale;

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
  decoyInput.type = "file";
  for (const attrName of ["accept", "capture", "multiple"]) {
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
  if (window.visualViewport.width >= 12) {
    return;
  }

  return new Promise(resolve => {
    const controller = new AbortController();
    const { signal } = controller;
    const onResize = () => {
      if (window.visualViewport.width >= 12) {
        controller.abort();
        resolve();
      }
    };
    window.visualViewport.addEventListener("resize", onResize, {
      signal,
    });
  });
}
