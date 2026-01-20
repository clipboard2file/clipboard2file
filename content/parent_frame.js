let currentDialog = null;

browser.runtime.onMessage.addListener(data => {
  if (data.type === "spawn_popup") {
    const port = browser.runtime.connect({ name: "parent" });

    const controller = new AbortController();
    const { signal } = controller;

    const host = document.createElement(data.tagName);
    const shadow = host.attachShadow({ mode: "closed" });
    const dialog = document.createElement("dialog");
    const iframe = document.createElement("iframe");

    dialog.tabIndex = -1;
    dialog.closedBy = "none";

    currentDialog = new WeakRef(dialog);

    dialog.appendChild(iframe);
    shadow.appendChild(dialog);

    fetch(browser.runtime.getURL("content/shadow.css"), { signal })
      .then(r => r.text())
      .then(cssText => {
        if (signal.aborted) {
          return;
        }

        const style = document.createElement("style");
        style.textContent = cssText;
        shadow.appendChild(style);

        document.documentElement.appendChild(host);

        const params = new URLSearchParams();
        params.set("scale", window.visualViewport.scale);
        params.set("offsetLeft", window.visualViewport.offsetLeft);
        params.set("offsetTop", window.visualViewport.offsetTop);
        params.set("width", window.visualViewport.width);
        params.set("height", window.visualViewport.height);

        const popupUrl = browser.runtime.getURL(
          `popup/popup.html?${params.toString()}`
        );

        iframe.contentWindow.location.replace(popupUrl);

        dialog.showModal();
      })
      .catch(() => {});

    const cleanup = () => {
      controller.abort();
      dialog.close();
      host.remove();
      port.onDisconnect.removeListener(cleanup);
      window.removeEventListener("pagehide", cleanup);
    };

    port.onDisconnect.addListener(cleanup);
    window.addEventListener("pagehide", cleanup, { once: true });
  }

  return false;
});

const parentOverrides = {
  showPopover() {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return HTMLElement.prototype.showPopover.apply(this, arguments);
    } catch (error) {
      throw createPageError(error);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },

  togglePopover() {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return HTMLElement.prototype.togglePopover.apply(this, arguments);
    } catch (error) {
      throw createPageError(error);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },

  showModal() {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return HTMLDialogElement.prototype.showModal.apply(this, arguments);
    } catch (error) {
      throw createPageError(error);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },
};

Object.defineProperty(
  window.wrappedJSObject.HTMLElement.prototype,
  "showPopover",
  {
    value: exportFunction(function showPopover() {
      if (new.target) {
        throw new window.TypeError(
          "HTMLElement.prototype.showPopover is not a constructor"
        );
      }
      return parentOverrides.showPopover.apply(this, arguments);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);

Object.defineProperty(
  window.wrappedJSObject.HTMLElement.prototype,
  "togglePopover",
  {
    value: exportFunction(function togglePopover() {
      if (new.target) {
        throw new window.TypeError(
          "HTMLElement.prototype.togglePopover is not a constructor"
        );
      }
      return parentOverrides.togglePopover.apply(this, arguments);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);

Object.defineProperty(
  window.wrappedJSObject.HTMLDialogElement.prototype,
  "showModal",
  {
    value: exportFunction(function showModal() {
      if (new.target) {
        throw new window.TypeError(
          "HTMLDialogElement.prototype.showModal is not a constructor"
        );
      }
      return parentOverrides.showModal.apply(this, arguments);
    }, window),
    writable: true,
    enumerable: true,
    configurable: true,
  }
);
