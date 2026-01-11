function handleInputElement(input, event) {
  const port = browser.runtime.connect({ name: "input" });

  const listener = data => {
    if (data.type === "showPicker") {
      input.showPicker();
      port.disconnect();
      return;
    }

    if (data.type === "files") {
      input.files = structuredClone(data.files);

      input.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      );
      input.dispatchEvent(
        new Event("change", { bubbles: true, composed: false })
      );
      port.disconnect();
    }

    if (data.type === "cancel") {
      input.dispatchEvent(
        new Event("cancel", { bubbles: true, composed: false })
      );
      port.disconnect();
    }
  };

  const cleanup = () => {
    port.onMessage.removeListener(listener);
    port.onDisconnect.removeListener(cleanup);
  };

  port.onMessage.addListener(listener);
  port.onDisconnect.addListener(cleanup);

  const inputAttributes = {};
  for (const attr of ["accept", "capture", "multiple"]) {
    if (input.hasAttribute(attr)) {
      inputAttributes[attr] = input.getAttribute(attr);
    }
  }

  const positionData = collectAnchorRects(input, event);

  port.postMessage({
    type: "inputClicked",
    inputAttributes,
    positionData,
  });
}

window.addEventListener(
  "click",
  event => {
    if (
      event.originalTarget.matches("input[type=file]:not([webkitdirectory])") &&
      navigator.userActivation.isActive &&
      event instanceof MouseEvent &&
      !event.defaultPreventedByPage
    ) {
      handleInputElement(event.originalTarget, event);
      event.defaultPreventedByExtension = true;
      event.preventDefault();
    }
  },
  { capture: true }
);

const isTopFrame = browser.runtime.getFrameId(window) === 0;

const overrides = {
  preventDefault() {
    try {
      Event.prototype.preventDefault.call(this);
      this.defaultPreventedByPage = true;
      return;
    } catch (error) {
      throw createPageError(error);
    }
  },

  get defaultPrevented() {
    try {
      let defaultPrevented = Reflect.get(
        Event.prototype,
        "defaultPrevented",
        this
      );

      if (this.cancelable) {
        if (this.defaultPreventedByPage) {
          return true;
        }

        if (this.defaultPreventedByExtension) {
          return false;
        }
      }

      return defaultPrevented;
    } catch (error) {
      throw createPageError(error);
    }
  },

  get returnValue() {
    try {
      let returnValue = Reflect.get(Event.prototype, "returnValue", this);

      if (this.cancelable) {
        if (this.defaultPreventedByPage) {
          return false;
        }

        if (this.defaultPreventedByExtension) {
          return true;
        }
      }

      return returnValue;
    } catch (error) {
      throw createPageError(error);
    }
  },

  set returnValue(value) {
    try {
      let returnValue = Reflect.set(
        Event.prototype,
        "returnValue",
        value,
        this
      );

      if (!value) {
        this.defaultPreventedByPage = true;
      }

      return returnValue;
    } catch (error) {
      throw createPageError(error);
    }
  },

  dispatchEvent(event) {
    if (
      event?.type === "click" &&
      event instanceof MouseEvent &&
      this instanceof HTMLInputElement &&
      !this.disabled &&
      navigator.userActivation.isActive &&
      this.matches("[type=file]:not([webkitdirectory])")
    ) {
      if (!event.cancelable) {
        handleInputElement(this, event);
        return true;
      }

      if (
        (!event.composed && this.getRootNode() instanceof ShadowRoot) ||
        !this.isConnected
      ) {
        handleInputElement(this, event);
        event.defaultPreventedByExtension = true;
        event.preventDefault();
      }

      const dispatched = this.dispatchEvent(event);

      if (event.defaultPreventedByExtension && !event.defaultPreventedByPage) {
        return true;
      }

      return dispatched;
    }

    if (isTopFrame) {
      const dialog = currentDialog?.deref();

      if (
        dialog?.isConnected &&
        this instanceof HTMLButtonElement &&
        event instanceof Event &&
        this.hasAttribute("command")
      ) {
        dialog.close();
        let dispatched = this.dispatchEvent(event);
        dialog.showModal();
        return dispatched;
      }
    }

    try {
      return EventTarget.prototype.dispatchEvent.call(this, event);
    } catch (error) {
      throw createPageError(error);
    }
  },

  click() {
    if (
      !this?.isConnected &&
      !this?.disabled &&
      navigator.userActivation.isActive &&
      this instanceof HTMLInputElement &&
      this.matches("[type=file]:not([webkitdirectory])")
    ) {
      let event = new PointerEvent("click", {
        bubbles: true,
        composed: true,
        cancelable: true,
      });

      handleInputElement(this, event);

      event.defaultPreventedByExtension = true;
      event.preventDefault();
      this.dispatchEvent(event);
      return;
    }

    if (isTopFrame) {
      const dialog = currentDialog?.deref();

      if (
        dialog?.isConnected &&
        this instanceof HTMLButtonElement &&
        this.hasAttribute("command")
      ) {
        dialog.close();
        this.click();
        dialog.showModal();
        return;
      }
    }

    try {
      return HTMLElement.prototype.click.call(this);
    } catch (error) {
      throw createPageError(error);
    }
  },

  showPicker() {
    if (
      this instanceof HTMLInputElement &&
      !this.disabled &&
      navigator.userActivation.isActive &&
      this.matches("[type=file]:not([webkitdirectory])")
    ) {
      handleInputElement(this, new PointerEvent("click"));
      return;
    }

    try {
      return HTMLInputElement.prototype.showPicker.call(this);
    } catch (error) {
      throw createPageError(error);
    }
  },
};

Object.defineProperty(
  window.wrappedJSObject.Event.prototype,
  "preventDefault",
  {
    value: exportFunction(function preventDefault() {
      if (new.target) {
        throw new window.TypeError(
          "Event.prototype.preventDefault is not a constructor"
        );
      }
      return overrides.preventDefault.call(this);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);

Object.defineProperty(
  window.wrappedJSObject.Event.prototype,
  "defaultPrevented",
  {
    get: exportFunction(
      Object.getOwnPropertyDescriptor(overrides, "defaultPrevented").get,
      window
    ),
    enumerable: true,
    configurable: true,
  }
);

Object.defineProperty(window.wrappedJSObject.Event.prototype, "returnValue", {
  get: exportFunction(
    Object.getOwnPropertyDescriptor(overrides, "returnValue").get,
    window
  ),
  set: exportFunction(
    Object.getOwnPropertyDescriptor(overrides, "returnValue").set,
    window
  ),
  enumerable: true,
  configurable: true,
});

Object.defineProperty(
  window.wrappedJSObject.EventTarget.prototype,
  "dispatchEvent",
  {
    value: exportFunction(function dispatchEvent(event) {
      if (new.target) {
        throw new window.TypeError(
          "EventTarget.prototype.dispatchEvent is not a constructor"
        );
      }
      return overrides.dispatchEvent.call(this, event);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);

Object.defineProperty(window.wrappedJSObject.HTMLElement.prototype, "click", {
  value: exportFunction(function click() {
    if (new.target) {
      throw new window.TypeError(
        "HTMLElement.prototype.click is not a constructor"
      );
    }
    return overrides.click.call(this);
  }, window),
  writable: true,
  enumerable: true,
  configurable: true,
});

Object.defineProperty(
  window.wrappedJSObject.HTMLInputElement.prototype,
  "showPicker",
  {
    value: exportFunction(function showPicker() {
      if (new.target) {
        throw new window.TypeError(
          "HTMLInputElement.prototype.showPicker is not a constructor"
        );
      }
      return overrides.showPicker.call(this);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);

function createPageError(error) {
  if (error instanceof DOMException) {
    return new window.DOMException(error.message, error.name);
  }

  const className = error.constructor.name;
  const ErrorConstructor = window[className] || window.Error;
  return new ErrorConstructor(error.message);
}

function collectAnchorRects(input, event) {
  let positionData = {
    win: {
      mozInnerScreenX: window.mozInnerScreenX,
      mozInnerScreenY: window.mozInnerScreenY,
    },
  };

  const inputRect = input.getBoundingClientRect();

  positionData.inputRect = {
    left: inputRect.left,
    top: inputRect.top,
    width: inputRect.width,
    height: inputRect.height,
  };

  positionData.event = {
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
  };

  let target = event.explicitOriginalTarget;

  if (target) {
    if (!(target instanceof Element) && target.parentElement) {
      target = target.parentElement;
    }

    if (target.control) {
      const controlRect = target.control.getBoundingClientRect();
      positionData.event.controlRect = {
        left: controlRect.left,
        top: controlRect.top,
        width: controlRect.width,
        height: controlRect.height,
      };
    }

    if (target.openOrClosedShadowRoot && event.originalTarget) {
      target = event.originalTarget;
    }

    const targetRect = target.getBoundingClientRect();
    positionData.event.targetRect = {
      left: targetRect.left,
      top: targetRect.top,
      width: targetRect.width,
      height: targetRect.height,
    };
  }

  return positionData;
}
