function getAnchor(input, event) {
  const useEventDelta = event?.isTrusted && (event.screenX !== 0 || event.clientX !== 0);
  const offsetX = useEventDelta ? event.screenX - event.clientX : window.mozInnerScreenX;
  const offsetY = useEventDelta ? event.screenY - event.clientY : window.mozInnerScreenY;

  const toScreenRect = (rect) => ({
    x: rect.left + offsetX,
    y: rect.top + offsetY,
    width: rect.width,
    height: rect.height,
  });

  if (event) {
    const target = event.currentTarget instanceof Element ? event.currentTarget : event.explicitOriginalTarget;

    if (target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return toScreenRect(rect);
      }
    }
  }

  const inputRect = input.getBoundingClientRect();
  if (inputRect.width > 0 || inputRect.height > 0) {
    return toScreenRect(inputRect);
  }

  if (event) {
    return {
      x: event.clientX + offsetX,
      y: event.clientY + offsetY,
      width: 0,
      height: 0,
    };
  }

  return null;
}

function handleInputElement(input, event, method) {
  if (!navigator.userActivation.isActive) {
    try {
      switch (method) {
        case "click":
          return input.click();
        case "showPicker":
          return input.showPicker();
        case "dispatchEvent":
          return input.dispatchEvent(event);
        default:
          return;
      }
    } catch (e) {
      throw new window.DOMException(e.message, e.name);
    }
  }

  const port = browser.runtime.connect({ name: "all_frames" });

  port.onMessage.addListener((data) => {
    if (data.type === "showPicker") {
      input.showPicker();
      port.disconnect();
      return;
    }
    if (data.type === "fileChanged") {
      input.files = structuredClone(data.files);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      port.disconnect();
    }
  });

  const anchor = getAnchor(input, event);

  const inputAttributes = {};
  for (const attr of input.attributes) inputAttributes[attr.name] = attr.value;

  port.postMessage({
    type: "openModal",
    inputAttributes,
    anchor,
  });
}

window.addEventListener("click", (event) => {
  let target;
  if (event.target.matches("input[type=file]:not([webkitdirectory])")) {
    target = event.target;
  } else {
    try {
      if (event.originalTarget.matches("input[type=file]:not([webkitdirectory])")) {
        target = event.originalTarget;
      }
    } catch {}
  }

  if (target) {
    if (navigator.userActivation.isActive) {
      event.preventDefault();
      handleInputElement(target, event, "globalListener");
    }
  }
});

exportFunction(
  function () {
    this.stopPropagation();
    if (this.type === "click" && this.target.matches("input[type=file]:not([webkitdirectory])")) {
      if (navigator.userActivation.isActive) {
        this.preventDefault();
        handleInputElement(this.target, this, "globalListener");
      }
    }
  },
  MouseEvent.prototype,
  { defineAs: "stopPropagation" }
);

exportFunction(
  function () {
    if (!this.isConnected && this.matches("[type=file]:not([webkitdirectory])")) {
      return handleInputElement(this, null, "click");
    } else {
      return this.click();
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "click" }
);

exportFunction(
  function () {
    if (this.matches("[type=file]:not([webkitdirectory])")) {
      return handleInputElement(this, null, "showPicker");
    } else {
      return this.showPicker();
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "showPicker" }
);

exportFunction(
  function (event) {
    if (event.type === "click" && this.matches("[type=file]:not([webkitdirectory])")) {
      const result = handleInputElement(this, event, "dispatchEvent");
      return result === undefined ? true : result;
    } else {
      return this.dispatchEvent(event);
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "dispatchEvent" }
);
