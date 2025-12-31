const { runtime, tabs } = browser;

const pendingSessions = new Map();
const activeSessions = new Map();

runtime.onMessage.addListener((data, sender) => {
  const tabId = sender.tab?.id;

  const actions = {
    clearClipboard: async function () {
      return navigator.clipboard.writeText("");
    },
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
    file: function () {
      const session = activeSessions.get(tabId);
      if (session) {
        try {
          session.inputPort.postMessage({
            type: "fileChanged",
            files: data.files,
          });
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

runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;

  if (port.name === "all_frames") {
    cleanupSession(tabId);

    port.onMessage.addListener(async (msg) => {
      if (msg.type === "openModal") {
        const items = await navigator.clipboard.read();
        const img = items.find((i) => i.types.includes("image/png"));
        let blob = img ? await img.getType("image/png") : null;

        if (!blob) {
          port.postMessage({ type: "showPicker" });
          port.disconnect();
          return;
        }

        cleanupSession(tabId);

        const tagName = generateElementName();

        const context = {
          inputPort: port,
          data: {
            inputAttributes: msg.inputAttributes,
            clipboardImage: blob,
            positionData: msg.positionData,
          },
          tagName: tagName,
          cssCode: `${tagName} { all: unset !important; }`,
        };

        pendingSessions.set(tabId, context);

        try {
          await tabs.insertCSS(tabId, {
            code: context.cssCode,
            cssOrigin: "user",
          });
        } catch (e) {
          console.error("Failed to inject user CSS", e);
        }

        tabs.sendMessage(tabId, { type: "spawn_popup", tabId, tagName });
      }
    });

    port.onDisconnect.addListener(() => {
      const active = activeSessions.get(tabId);
      const pending = pendingSessions.get(tabId);

      if (active && active.inputPort === port) cleanupSession(tabId);
      else if (pending && pending.inputPort === port) cleanupSession(tabId);
    });
  } else if (port.name === "parent_frame") {
    const pending = pendingSessions.get(tabId);

    if (!pending) {
      port.disconnect();
      return;
    }

    const session = {
      ...pending,
      pickerPort: port,
    };

    activeSessions.set(tabId, session);
    pendingSessions.delete(tabId);

    port.onDisconnect.addListener(() => cleanupSession(tabId));
  }
});

function cleanupSession(tabId) {
  const active = activeSessions.get(tabId);
  const pending = pendingSessions.get(tabId);

  if (active) {
    tabs.removeCSS(tabId, { code: active.cssCode, cssOrigin: "user" }).catch(() => {});
    active.inputPort.disconnect();
    active.pickerPort.disconnect();
    activeSessions.delete(tabId);
    return;
  }

  if (pending) {
    tabs.removeCSS(tabId, { code: pending.cssCode, cssOrigin: "user" }).catch(() => {});
    pending.inputPort.disconnect();
    pendingSessions.delete(tabId);
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
  const dashIndex = 1 + (crypto.getRandomValues(new Uint8Array(1))[0] % (length - 2));
  result[dashIndex] = "-";
  for (let i = 1; i < length; i++) {
    if (result[i] === "-") continue;
    result[i] = rand(chars);
  }
  return result.join("");
}

browser.runtime.onUpdateAvailable.addListener(() => {});
