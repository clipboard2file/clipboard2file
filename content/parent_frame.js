browser.runtime.onMessage.addListener((data) => {
  if (data.type === "spawn_popup") {
    const port = browser.runtime.connect({ name: "parent_frame" });

    const host = document.createElement(data.tagName);
    const shadow = host.attachShadow({ mode: "closed" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = browser.runtime.getURL("content/shadow.css");

    const dialog = document.createElement("dialog");
    const iframe = document.createElement("iframe");

    link.onload = () => {
      dialog.showModal();
      const popupUrl = browser.runtime.getURL(`content/popup.html`);
      iframe.contentWindow.location.replace(popupUrl);
    };

    shadow.appendChild(link);
    dialog.appendChild(iframe);
    shadow.appendChild(dialog);

    document.documentElement.appendChild(host);

    window.addEventListener("pagehide", console.log);

    port.onDisconnect.addListener(() => {
      dialog.close();
      host.remove();
    });
  }
  return false;
});
