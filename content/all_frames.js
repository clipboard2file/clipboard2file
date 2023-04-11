let token;
let clicked;

browser.runtime.onMessage.addListener((data) => {
  if (data.type === "fileChanged" && token === data.token) {
    clicked.files = structuredClone(data.files);
    clicked.dispatchEvent(new Event("input", { bubbles: true }));
    clicked.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return false;
});

window.addEventListener("click", async (event) => {
  let target;

  if (event.target.matches("input[type=file]:not([webkitdirectory])")) {
    target = event.target;
  } else {
    try {
      if (event.originalTarget.matches("input[type=file]:not([webkitdirectory])")) {
        target = event.originalTarget;
      }
    } catch  {
        // permission denied to read "originalTarget" property
    }
  }

  if (target) {
    event.preventDefault();
    handleInputElement(target);
  }
});

// Let the extension work on pages that stop propagation of input events (tinypng.com, etc.)
exportFunction(
  function () {
    this.stopPropagation();

    if (this.type === "click" && this.target.matches("input[type=file]:not([webkitdirectory])")) {
      this.preventDefault();
      handleInputElement(this.target);
    }
  },
  MouseEvent.prototype,
  { defineAs: "stopPropagation" }
);

// Let the extension work on pages with inputs that aren't attached to the page (google.com, etc.)
exportFunction(
  function () {
    if (!this.isConnected && this.matches("[type=file]:not([webkitdirectory])")) {
      handleInputElement(this);
    } else {
      return this.click();
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "click" }
);

// Let the extension work on pages that open the file picker with showPicker
exportFunction(
  function () {
    if (this.matches("[type=file]:not([webkitdirectory])")) {
      handleInputElement(this);
    } else {
      return this.showPicker();
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "showPicker" }
);

// Let the extension work on pages that open the file picker by dispatching an uncancellable click event
exportFunction(
  function (event) {
    if (event.type === "click" && this.matches("[type=file]:not([webkitdirectory])")) {
      handleInputElement(this);
      return true;
    } else {
      return this.dispatchEvent(event);
    }
  },
  HTMLInputElement.prototype,
  { defineAs: "dispatchEvent" }
);

async function handleInputElement(input) {
  // Reading the clipboard via the background page allows the add-on to work in non-secure contexts
  // https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
  const clipboardImage = await browser.runtime.sendMessage({ type: "clipboardImage" });

  if (!clipboardImage) return input.showPicker();

  // Again, non-secure contexts...
  token = await browser.runtime.sendMessage({ type: "randomUUID" });
  clicked = input;

  const inputAttributes = {};

  for (attr of input.attributes) {
    inputAttributes[attr.name] = attr.value;
  }

  browser.runtime.sendMessage({ type: "click", token, inputAttributes, clipboardImage });
}
