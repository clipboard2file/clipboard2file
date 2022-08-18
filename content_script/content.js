let clientX;
let clientY;

async function handleClick(e) {
  if (e.target.matches("input[type=file]:not([webkitdirectory])")) {
    e.preventDefault();

    // Fall back to default behavior (inscure context, user forgot to set dom.events.asyncClipboard.clipboardItem to true in about:config, etc.)
    if (!navigator.clipboard?.read) return e.target.showPicker();

    const clipboardItems = await navigator.clipboard.read();

    // At some point we should handle multiple images being in the clipboard, which is possible.
    const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

    if (!clipboardImageItem) return e.target.showPicker();

    const [clipboardImage, shadowStyleRequest, iframeRequest, iframeStyleRequest, settings] = await Promise.all([
      clipboardImageItem.getType("image/png"),
      fetch(browser.runtime.getURL(`content_script/frame.css`)),
      fetch(browser.runtime.getURL(`content_script/iframe.html`)),
      fetch(browser.runtime.getURL(`content_script/iframe.css`)),
      browser.storage.local.get(["showFilenameBox", "clearOnPaste", "defaultFilename"]),
    ]);

    const aside = document.createElement("aside");
    const iframe = document.createElement("iframe");
    const shadow = aside.attachShadow({ mode: "closed" });

    const shadowStyleElement = document.createElement("style");
    const iframeStyleElement = document.createElement("style");

    const root = document.createElement("div");

    shadowStyleElement.textContent = await shadowStyleRequest.text();
    iframeStyleElement.textContent = await iframeStyleRequest.text();
    iframe.srcdoc = await iframeRequest.text();
    shadow.appendChild(shadowStyleElement);
    shadow.append(root);
    root.appendChild(iframe);

    const modalWidth = 250 / window.devicePixelRatio;
    const modalHeight = 200 / window.devicePixelRatio;

    if (clientX + window.visualViewport.pageLeft < window.visualViewport.width + window.visualViewport.pageLeft - modalWidth) {
      root.style.left = clientX + window.visualViewport.pageLeft + "px";
    } else {
      root.style.left = window.visualViewport.width + window.visualViewport.pageLeft - modalWidth + "px";
    }

    if (clientY + window.visualViewport.pageTop < window.visualViewport.height + window.visualViewport.pageTop - modalHeight) {
      root.style.top = clientY + window.visualViewport.pageTop + "px";
    } else {
      root.style.top = clientY + window.visualViewport.pageTop - modalHeight + "px";
    }

    document.documentElement.appendChild(aside);

    await new Promise((resolve) => iframe.contentWindow.addEventListener("DOMContentLoaded", resolve, { once: true }));

    iframe.contentDocument.body.appendChild(iframeStyleElement);

    const preview = iframe.contentDocument.getElementById("preview");
    const selectAll = iframe.contentDocument.getElementById("selectAll");
    const filenameInput = iframe.contentDocument.getElementById("filename");

    let defaultFilename;
    if (settings.defaultFilename === "unix") defaultFilename = String(Date.now());
    else if (settings.defaultFilename === "unknown") defaultFilename = "unknown";
    else defaultFilename = generateFilename();

    filenameInput.value = `${defaultFilename}.png`;
    filenameInput.setAttribute("placeholder", `${defaultFilename}.png`);
    filenameInput.setSelectionRange(0, defaultFilename.length);

    if (!settings.showFilenameBox) filenameInput.style.display = "none";

    const previewImage = new iframe.contentWindow.Image();
    previewImage.src = URL.createObjectURL(clipboardImage);
    preview.style.backgroundImage = `url(${previewImage.src})`;

    iframe.contentDocument.body.style.setProperty("--devicePixelRatio", window.devicePixelRatio);
    root.style.setProperty("--devicePixelRatio", window.devicePixelRatio);

    iframe.contentDocument.addEventListener("keydown", (e) => {
      if (e.key === "Escape") iframe.contentDocument.dispatchEvent(new Event("blur"));
    });

    filenameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") preview.dispatchEvent(new Event("click"));
    });

    preview.addEventListener(
      "click",
      async () => {
        iframe.contentDocument.dispatchEvent(new Event("blur"));
        if (settings.clearOnPaste) await navigator.clipboard.writeText("");

        const dataTransfer = new DataTransfer();

        let filename;
        if (filenameInput.value === `${defaultFilename}.png` || filenameInput.value.length === 0) filename = `${defaultFilename}.png`;
        else filename = filenameInput.value;

        dataTransfer.items.add(new File([clipboardImage], filename, { type: "image/png" }));

        e.target.files = dataTransfer.files;
        e.target.dispatchEvent(new Event("input", { bubbles: true }));
        e.target.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { once: true }
    );

    selectAll.addEventListener(
      "click",
      () => {
        iframe.contentDocument.dispatchEvent(new Event("blur"));
        e.target.showPicker();
      },
      { once: true }
    );

    exportFunction(() => {}, HTMLElement.prototype, { defineAs: "blur" });
    exportFunction(() => {}, HTMLElement.prototype, { defineAs: "focus" });

    if (settings.showFilenameBox) filenameInput.focus();
    else iframe.contentDocument.body.focus({ preventScroll: true });

    iframe.contentDocument.addEventListener("blur", () => {
      aside.remove();
      exportFunction(HTMLElement.prototype.blur, HTMLElement.prototype, { defineAs: "blur" });
      exportFunction(HTMLElement.prototype.focus, HTMLElement.prototype, { defineAs: "focus" });
    });

    await previewImage.decode();

    root.style.animationName = "finished";
  }
}

window.addEventListener("click", handleClick);
document.addEventListener("pointerup", (e) => ((clientX = e.clientX), (clientY = e.clientY)), { passive: true });

// fix for extension not working on tinypng.com or any other website that stops propagation of input events.
exportFunction(
  function () {
    this.stopPropagation();
    if (this.type === "click") handleClick(this);
  },
  Event.prototype,
  { defineAs: "stopPropagation" }
);

function generateFilename() {
  const date = new Date(Date.now());
  const currentDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
  const filenameDate = currentDateTime.substring(0, 10);
  const filenameTime = currentDateTime.substring(11, 19).replace(/:/g, "-");

  return `img-${filenameDate}-${filenameTime}`;
}
