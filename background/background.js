const { runtime, tabs } = browser;

runtime.onMessage.addListener((data, sender) => {
  const actions = {
    click: function () {
      return tabs.sendMessage(sender.tab.id, {
        type: "modal",
        frameId: sender.frameId,
        tabId: sender.tab.id,
        inputAttributes: data.inputAttributes,
        token: data.token,
        clipboardImage: data.clipboardImage,
      });
    },
    clipboardImage: async function () {
      // User forgot to set dom.events.asyncClipboard.clipboardItem to true in about:config
      if (!navigator.clipboard?.read) return null;

      const clipboardItems = await navigator.clipboard.read();
      const imageItem = clipboardItems.find((item) => item.types.includes("image/png"));

      if (!imageItem) return null;

      return await imageItem.getType("image/png");
    },
    randomUUID: function () {
      return crypto.randomUUID();
    },
    clearClipboard: async function () {
      // User forgot to set dom.events.asyncClipboard.clipboardItem to true in about:config
      if (!navigator.clipboard?.writeText) return null;
      return await navigator.clipboard.writeText("");
    },
    file: function () {
      return tabs.sendMessage(sender.tab.id, { type: "fileChanged", token: data.token, files: data.files }, { frameId: data.frameId });
    },
  };

  if (actions[data.type]) return actions[data.type]();

  return false;
});
