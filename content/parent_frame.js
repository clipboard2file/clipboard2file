browser.runtime.onMessage.addListener((data) => {
  if (data.type === "spawn_popup") {
    const port = browser.runtime.connect({ name: "parent_frame" });

    const controller = new AbortController();
    const { signal } = controller;

    const host = document.createElement(data.tagName);
    const shadow = host.attachShadow({ mode: "closed" });

    const dialog = document.createElement("dialog");
    const iframe = document.createElement("iframe");

    dialog.appendChild(iframe);
    shadow.appendChild(dialog);

    fetch(browser.runtime.getURL("content/shadow.css"), { signal })
      .then((r) => r.text())
      .then((cssText) => {
        if (signal.aborted) return;

        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        shadow.wrappedJSObject.adoptedStyleSheets = new window.Array(sheet);

        document.documentElement.appendChild(host);

        const popupUrl = browser.runtime.getURL(`content/popup.html`);
        iframe.contentWindow.location.replace(popupUrl);

        dialog.showModal();
      })
      .catch(() => {});

    port.onDisconnect.addListener(() => {
      controller.abort();
      dialog.close();
      host.remove();
    });
  }

  return false;
});
