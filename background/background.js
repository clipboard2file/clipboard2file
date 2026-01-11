import { getSetting } from "../settings/settings.js";

const pendingSessions = new Map();
const activeSessions = new Map();

browser.runtime.onMessage.addListener(async (message, sender) => {
  const tabId = sender.tab?.id;

  if (!tabId) {
    return;
  }

  const session = activeSessions.get(tabId);

  if (message.type === "initPopup") {
    if (session) {
      return {
        ...session.data,
        backgroundDevicePixelRatio: window.devicePixelRatio,
        backgroundPrefersDark: window.matchMedia("(prefers-color-scheme: dark)")
          .matches,
      };
    }
    return null;
  }

  if (!session) {
    return;
  }

  switch (message.type) {
    case "files": {
      try {
        session.inputPort.postMessage({
          type: "files",
          files: message.files,
        });

        if (message.isClipboardImage && (await getSetting("clearOnPaste"))) {
          navigator.clipboard.writeText("");
        }
      } catch (e) {}
      cleanupSession(tabId);
      break;
    }
    case "showPicker": {
      try {
        session.inputPort.postMessage({ type: "showPicker" });
      } catch (e) {}
      cleanupSession(tabId);
      break;
    }
    case "cancel": {
      try {
        session.inputPort.postMessage({ type: "cancel" });
      } catch (e) {}
      cleanupSession(tabId);
      break;
    }
  }
});

browser.runtime.onConnect.addListener(port => {
  const tabId = port.sender.tab?.id;

  if (!tabId) {
    return;
  }

  const addDisconnectListener = messageListener => {
    const listener = () => {
      port.onDisconnect.removeListener(listener);

      if (messageListener) {
        port.onMessage.removeListener(messageListener);
      }

      cleanupSession(tabId);
    };
    port.onDisconnect.addListener(listener);
  };

  switch (port.name) {
    case "input": {
      if (activeSessions.has(tabId) || pendingSessions.has(tabId)) {
        port.disconnect();
        return;
      }

      const listener = async message => {
        if (message.type === "inputClicked") {
          const items = await navigator.clipboard.read();
          const img = items.find(i => i.types.includes("image/png"));
          let blob = img ? await img.getType("image/png") : null;

          if (!blob) {
            port.postMessage({ type: "showPicker" });
            port.disconnect();
            return;
          }

          if (activeSessions.has(tabId) || pendingSessions.has(tabId)) {
            port.disconnect();
            return;
          }

          const tagName = generateElementName();

          const context = {
            inputPort: port,
            data: {
              isTopFrame: port.sender.frameId === 0,
              inputAttributes: message.inputAttributes,
              clipboardImage: blob,
              positionData: message.positionData,
            },
            cssCode: `${tagName},
                      ${tagName}::before,
                      ${tagName}::after {
                        all: unset !important;
                      }`,
          };

          pendingSessions.set(tabId, context);

          try {
            await browser.tabs.insertCSS(tabId, {
              code: context.cssCode,
              cssOrigin: "user",
            });
          } catch (e) {
            console.error("Failed to inject user CSS", e);
          }

          browser.tabs.sendMessage(
            tabId,
            { type: "spawn_popup", tagName },
            { frameId: 0 }
          );
        }
      };

      port.onMessage.addListener(listener);
      addDisconnectListener(listener);
      break;
    }
    case "parent": {
      const pendingSession = pendingSessions.get(tabId);

      if (!pendingSession) {
        port.disconnect();
        return;
      }

      const activeSession = {
        ...pendingSession,
        parentPort: port,
      };

      activeSessions.set(tabId, activeSession);
      pendingSessions.delete(tabId);

      addDisconnectListener();
      break;
    }
    case "popup": {
      const activeSession = activeSessions.get(tabId);

      if (!activeSession) {
        port.disconnect();
        return;
      }

      activeSession.popupPort = port;
      addDisconnectListener();
      break;
    }
  }
});

function cleanupSession(tabId) {
  const active = activeSessions.get(tabId);
  const pending = pendingSessions.get(tabId);

  if (active) {
    activeSessions.delete(tabId);
    browser.tabs
      .removeCSS(tabId, { code: active.cssCode, cssOrigin: "user" })
      .catch(() => {});

    try {
      active.inputPort.disconnect();
    } catch (e) {}
    try {
      active.parentPort.disconnect();
    } catch (e) {}
    try {
      active.popupPort?.disconnect();
    } catch (e) {}
    return;
  }

  if (pending) {
    pendingSessions.delete(tabId);
    browser.tabs
      .removeCSS(tabId, { code: pending.cssCode, cssOrigin: "user" })
      .catch(() => {});
    try {
      pending.inputPort.disconnect();
    } catch (e) {}
  }
}

function generateElementName(length = 10) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  function rand(set) {
    const buf = new Uint8Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  }
  const result = new Array(length);
  result[0] = rand(letters);
  const dashIndex =
    1 + (crypto.getRandomValues(new Uint8Array(1))[0] % (length - 2));
  result[dashIndex] = "-";
  for (let i = 1; i < length; i++) {
    if (result[i] === "-") continue;
    result[i] = rand(chars);
  }
  return result.join("");
}

browser.runtime.onUpdateAvailable.addListener(() => {});
