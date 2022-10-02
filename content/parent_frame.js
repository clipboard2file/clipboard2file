browser.runtime.onMessage.addListener((data, sender) => {
  if (data.type === "modal") {
    return (async function () {
      const { popup } = await import(browser.runtime.getURL(`content/popup.js`));

      return popup(data, sender);
    })();
  }

  return false;
});
