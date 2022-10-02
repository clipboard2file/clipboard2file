const { runtime, tabs } = browser;

runtime.onMessage.addListener((data, sender) => {
  if (data.type === "click") {
    return tabs.sendMessage(sender.tab.id, {
      type: "modal",
      frameId: sender.frameId,
      tabId: sender.tab.id,
      inputAttributes: data.inputAttributes,
      token: data.token,
      clipboardImage: data.clipboardImage,
    });
  }

  if (data.type === "file") {
    return tabs.sendMessage(sender.tab.id, { type: "fileChanged", token: data.token, files: data.files }, { frameId: data.frameId });
  }

  return false;
});
