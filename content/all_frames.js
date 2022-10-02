let token;
let clicked;

async function handleClick(event) {
  if (event.target.matches("input[type=file]:not([webkitdirectory])")) {
    event.preventDefault();

    // Fall back to default behavior (inscure context, user forgot to set dom.events.asyncClipboard.clipboardItem to true in about:config, etc.)
    if (!navigator.clipboard?.read) return e.target.showPicker();

    const clipboardItems = await navigator.clipboard.read();
    const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

    if (!clipboardImageItem) return event.target.showPicker();

    token = crypto.randomUUID();
    clicked = event.target;

    const clipboardImage = await clipboardImageItem.getType("image/png");

    const inputAttributes = {};

    for (attr of event.target.attributes) {
      inputAttributes[attr.name] = { name: attr.name, value: attr.value };
    }

    return browser.runtime.sendMessage({ type: "click", token, inputAttributes, clipboardImage });
  }
}

window.addEventListener("click", handleClick);

browser.runtime.onMessage.addListener((data, sender) => {
  if (data.type === "fileChanged") {
    if (token === data.token) {
      clicked.files = structuredClone(data.files);
      clicked.dispatchEvent(new Event("input", { bubbles: true }));
      clicked.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  return false;
});

// Let the extension work on pages that stop propagation of input events (tinypng.com, etc.)
exportFunction(
  function () {
    this.stopPropagation();
    if (this.type === "click") handleClick(this);
  },
  Event.prototype,
  { defineAs: "stopPropagation" }
);
