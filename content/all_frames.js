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

  if (target && navigator.userActivation.isActive) {
    event.preventDefault();
    handleInputElement(target, event);
  }
});

exportFunction(
  function () {
    this.stopPropagation();
    if (
      this.type === "click" &&
      this.target.matches("input[type=file]:not([webkitdirectory])") &&
      navigator.userActivation.isActive
    ) {
      this.preventDefault();
      handleInputElement(this.target, this);
    }
  },
  MouseEvent.prototype,
  { defineAs: "stopPropagation" }
);

exportFunction(
  function () {
    if (!this.isConnected && this.matches("[type=file]:not([webkitdirectory])") && navigator.userActivation.isActive) {
      return handleInputElement(this);
    } else {
      return this.click();
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "click" }
);

exportFunction(
  function () {
    if (this.matches("[type=file]:not([webkitdirectory])") && navigator.userActivation.isActive) {
      return handleInputElement(this);
    } else {
      try {
        return this.showPicker();
      } catch (e) {
        throw new window.DOMException(e.message, e.name);
      }
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "showPicker" }
);

exportFunction(
  function (event) {
    if (event.type === "click" && this.matches("[type=file]:not([webkitdirectory])") && navigator.userActivation.isActive) {
      handleInputElement(this, event);
      return true;
    } else {
      return this.dispatchEvent(event);
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "dispatchEvent" }
);

function handleInputElement(input, event) {
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
    if (data.type === "cancel") {
      input.dispatchEvent(new Event("cancel", { bubbles: true }));
      port.disconnect();
    }
  });

  const inputAttributes = {};
  for (const attr of input.attributes) inputAttributes[attr.name] = attr.value;

  const positionData = collectAnchorData(input, event);

  port.postMessage({
    type: "openModal",
    inputAttributes,
    positionData,
  });
}

function collectAnchorData(input, event) {
  const rect = input.getBoundingClientRect();
  const positionData = {
    inputRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    win: {
      mozInnerScreenX: window.mozInnerScreenX,
      mozInnerScreenY: window.mozInnerScreenY,
    },
  };

  if (event) {
    const target = event.currentTarget instanceof Element ? event.currentTarget : event.explicitOriginalTarget;
    let targetRect = null;

    if (target?.getBoundingClientRect) {
      const tr = target.getBoundingClientRect();
      targetRect = {
        left: tr.left,
        top: tr.top,
        width: tr.width,
        height: tr.height,
      };
    }

    positionData.event = {
      isTrusted: event.isTrusted,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      targetRect,
    };
  }

  return positionData;
}
