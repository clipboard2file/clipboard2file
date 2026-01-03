import { getSetting } from "../settings/settings.js";

const pendingSessions = new Map();
const activeSessions = new Map();

browser.runtime.onMessage.addListener((data, sender) => {
  const tabId = sender.tab?.id;

  const actions = {
    initPopup: function () {
      const session = activeSessions.get(tabId);
      if (session) {
        return Promise.resolve({
          ...session.data,
          backgroundDevicePixelRatio: window.devicePixelRatio,
        });
      }
      return Promise.resolve();
    },
    files: async function () {
      const session = activeSessions.get(tabId);
      if (session) {
        try {
          session.inputPort.postMessage({
            type: "files",
            files: data.files,
          });
          if (await getSetting("clearOnPaste")) {
            await navigator.clipboard.writeText("");
          }
        } catch (e) {}
        cleanupSession(tabId);
      }
      return;
    },
    showPicker: function () {
      const session = activeSessions.get(tabId);
      if (session) {
        try {
          session.inputPort.postMessage({ type: "showPicker" });
        } catch (e) {}
        cleanupSession(tabId);
      }
      return Promise.resolve();
    },
    cancel: function () {
      const session = activeSessions.get(tabId);
      if (session) {
        try {
          session.inputPort.postMessage({ type: "cancel" });
        } catch (e) {}
        cleanupSession(tabId);
      }
      return Promise.resolve();
    },
  };

  if (actions[data.type]) return actions[data.type]();
  return false;
});

browser.runtime.onConnect.addListener(port => {
  const tabId = port.sender?.tab?.id;

  if (!tabId) return;

  if (port.name === "input") {
    if (activeSessions.has(tabId) || pendingSessions.has(tabId)) {
      port.disconnect();
      return;
    }

    port.onMessage.addListener(async msg => {
      if (msg.type === "openPopup") {
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
            inputAttributes: msg.inputAttributes,
            clipboardImage: blob,
            positionData: msg.positionData,
          },
          tagName: tagName,
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
    });

    port.onDisconnect.addListener(() => cleanupSession(tabId));
  } else if (port.name === "parent") {
    const pending = pendingSessions.get(tabId);

    if (!pending) {
      port.disconnect();
      return;
    }

    const session = {
      ...pending,
      parentPort: port,
    };

    activeSessions.set(tabId, session);
    pendingSessions.delete(tabId);

    port.onDisconnect.addListener(() => cleanupSession(tabId));
  } else if (port.name === "popup") {
    const session = activeSessions.get(tabId);
    if (session) {
      session.popupPort = port;
      port.onDisconnect.addListener(() => cleanupSession(tabId));
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
