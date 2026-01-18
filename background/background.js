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
      session.inputPort.postMessage({
        type: "files",
        files: message.files,
      });

      if (message.isFromClipboard) {
        const setting =
          session.data.clipboardType === "text"
            ? "clearOnPasteText"
            : "clearOnPasteImage";

        if (await getSetting(setting)) {
          navigator.clipboard.writeText("");
        }
      }
      cleanupSession(tabId);
      break;
    }
    case "showPicker": {
      return new Promise(resolve => {
        const listener = message => {
          if (message.type === "showPickerSucceeded") {
            session.inputPort.onMessage.removeListener(listener);
            resolve(message.success);
          }
        };
        session.inputPort.onMessage.addListener(listener);
        session.inputPort.postMessage({ type: "showPicker" });
      });
    }
    case "cancel": {
      session.inputPort.postMessage({ type: "cancel" });
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

          let blob = null;
          let blobType = null;

          const img = items.find(i => i.types.includes("image/png"));

          if (img && (await getSetting("enableImagePaste"))) {
            const imgBlob = await img.getType("image/png");
            if (imgBlob.size > 0) {
              blob = await img.getType("image/png");
              blobType = "image";
            }
          }

          if (!blob) {
            const textItem = items.find(i => i.types.includes("text/plain"));
            if (textItem && (await getSetting("enableTextPaste"))) {
              const textBlob = await textItem.getType("text/plain");
              if (textBlob.size > 0) {
                blob = textBlob;
                blobType = "text";
              }
            }
          }

          if (activeSessions.has(tabId) || pendingSessions.has(tabId)) {
            port.disconnect();
            return;
          }

          if (!blob) {
            port.postMessage({ type: "showPicker" });
            port.disconnect();
            return;
          }

          const tagName = generateElementName();

          const context = {
            inputPort: port,
            data: {
              isTopFrame: port.sender.frameId === 0,
              inputAttributes: message.inputAttributes,
              clipboardBlob: blob,
              clipboardType: blobType,
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
    active.inputPort.disconnect();
    active.parentPort.disconnect();
    active.popupPort?.disconnect();
  }

  if (pending) {
    pendingSessions.delete(tabId);
    browser.tabs
      .removeCSS(tabId, { code: pending.cssCode, cssOrigin: "user" })
      .catch(() => {});
    pending.inputPort.disconnect();
  }
}

function generateElementName(length = 10) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomValues = new Uint32Array(length + 1);
  crypto.getRandomValues(randomValues);
  const result = Array.from({ length }, (_, i) => {
    if (i === 0) return letters[randomValues[i] % letters.length];
    return chars[randomValues[i] % chars.length];
  });
  const dashIndex = 1 + (randomValues[length] % (length - 2));
  result[dashIndex] = "-";
  return result.join("");
}

browser.runtime.onUpdateAvailable.addListener(() => {});
