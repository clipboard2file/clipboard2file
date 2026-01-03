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

    currentDialog = new WeakRef(dialog);

    dialog.appendChild(iframe);
    shadow.appendChild(dialog);

    fetch(browser.runtime.getURL("content/shadow.css"), { signal })
      .then(r => r.text())
      .then(cssText => {
        if (signal.aborted) return;

        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        shadow.wrappedJSObject.adoptedStyleSheets = new window.Array(sheet);

        document.documentElement.appendChild(host);

        const params = new URLSearchParams();
        params.set("scale", window.visualViewport.scale);
        params.set("offsetLeft", window.visualViewport.offsetLeft);
        params.set("offsetTop", window.visualViewport.offsetTop);
        params.set("width", window.visualViewport.width);
        params.set("height", window.visualViewport.height);

        const popupUrl = browser.runtime.getURL(
          `content/popup.html?${params.toString()}`
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
    };

    port.onDisconnect.addListener(cleanup);
  }

  return false;
});

exportFunction(
  function () {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return this.showModal(...arguments);
    } catch (e) {
      throw new window.DOMException(e.message, e.name);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },
  HTMLDialogElement.prototype,
  { defineAs: "showModal" }
);

exportFunction(
  function () {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return this.showPopover(...arguments);
    } catch (e) {
      throw new window.DOMException(e.message, e.name);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },
  HTMLElement.prototype,
  { defineAs: "showPopover" }
);

exportFunction(
  function () {
    const dialog = currentDialog?.deref();

    if (dialog) {
      dialog.close();
    }

    try {
      return this.togglePopover(...arguments);
    } catch (e) {
      throw new window.DOMException(e.message, e.name);
    } finally {
      if (dialog?.isConnected) {
        dialog.showModal();
      }
    }
  },
  HTMLElement.prototype,
  { defineAs: "togglePopover" }
);

exportFunction(
  function () {
    const dialog = currentDialog?.deref();

    if (!dialog) {
      return this.click();
    }

    if (this.hasAttribute("command") && dialog.isConnected) {
      dialog.close();
      this.click();
      dialog.showModal();
    } else {
      this.click();
    }
  },
  HTMLButtonElement.prototype,
  { defineAs: "click" }
);

exportFunction(
  function (event) {
    const dialog = currentDialog?.deref();

    if (!dialog) {
      return this.dispatchEvent(event);
    }

    if (this.hasAttribute("command") && dialog.isConnected) {
      dialog.close();
      let dispatched = this.dispatchEvent(event);
      dialog.showModal();
      return dispatched;
    } else {
      return this.dispatchEvent(event);
    }
  },
  HTMLButtonElement.prototype,
  { defineAs: "dispatchEvent" }
);
