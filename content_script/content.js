let clientX = 0;
let clientY = 0;

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
      fetch(browser.runtime.getURL(`content_script/shadow.css`)),
      fetch(browser.runtime.getURL(`content_script/popup.html`)),
      fetch(browser.runtime.getURL(`content_script/popup.css`)),
      browser.storage.local.get(["showFilenameBox", "clearOnPaste", "defaultFilename"]),
    ]);

    const aside = document.createElement("aside");
    const iframe = document.createElement("iframe");
    const root = document.createElement("div");
    const shadow = aside.attachShadow({ mode: "closed" });

    const shadowStyleElement = document.createElement("style");
    shadowStyleElement.textContent = await shadowStyleRequest.text();

    shadow.appendChild(shadowStyleElement);
    shadow.append(root);

    iframe.srcdoc = await iframeRequest.text();
    root.appendChild(iframe);

    const modalWidth = 250 / window.devicePixelRatio;
    const modalHeight = 200 / window.devicePixelRatio;

    if (clientX + window.visualViewport.pageLeft < window.visualViewport.width * window.visualViewport.scale + window.visualViewport.pageLeft - modalWidth) {
      root.style.setProperty("--posX", `${(100 * clientX) / (window.visualViewport.width * window.visualViewport.scale)}%`);
    } else {
      root.style.setProperty(
        "--posX",
        `${(100 * (window.visualViewport.width * window.visualViewport.scale - modalWidth)) / (window.visualViewport.width * window.visualViewport.scale)}%`
      );
    }

    if (clientY + window.visualViewport.pageTop < window.visualViewport.height * window.visualViewport.scale + window.visualViewport.pageTop - modalHeight) {
      root.style.setProperty("--posY", `${(100 * clientY) / (window.visualViewport.height * window.visualViewport.scale)}%`);
    } else {
      root.style.setProperty("--posY", `${(100 * (clientY - modalHeight)) / (window.visualViewport.height * window.visualViewport.scale)}%`);
    }

    // <dialog> elements appear on top of everything else in the web page,
    // regardless of the z-index of other elements,
    // so to keep the popup visible, we append it to the dialog instead of the root.
    const closestDialog = e.target.closest("dialog[open]");

    if (closestDialog) closestDialog.appendChild(aside);
    else document.documentElement.appendChild(aside);

    await new Promise((resolve) => iframe.contentWindow.addEventListener("DOMContentLoaded", resolve, { once: true }));

    const iframeStyleElement = iframe.contentDocument.createElement("style");
    iframeStyleElement.textContent = await iframeStyleRequest.text();
    iframe.contentDocument.body.appendChild(iframeStyleElement);

    const preview = iframe.contentDocument.getElementById("preview");
    const selectAll = iframe.contentDocument.getElementById("selectAll");
    const filenameInput = iframe.contentDocument.getElementById("filename");

    let defaultFilename;
    if (settings.defaultFilename === "unix") defaultFilename = String(Date.now());
    else if (settings.defaultFilename === "unknown") defaultFilename = "unknown";
    else defaultFilename = generateFilename();

    if (settings.showFilenameBox) {
      filenameInput.setAttribute("placeholder", `${defaultFilename}.png`);
      filenameInput.value = `${defaultFilename}.png`;
      filenameInput.setSelectionRange(0, defaultFilename.length);
    } else {
      filenameInput.style.display = "none";
    }

    const previewImage = new iframe.contentWindow.Image();
    previewImage.src = URL.createObjectURL(clipboardImage);
    preview.style.backgroundImage = `url(${previewImage.src})`;

    iframe.contentDocument.body.style.setProperty("--devicePixelRatio", iframe.contentWindow.devicePixelRatio);
    root.style.setProperty("--devicePixelRatio", window.devicePixelRatio);

    const controller = new AbortController();
    const signal = controller.signal;

    iframe.contentDocument.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") iframe.contentDocument.dispatchEvent(new FocusEvent("blur"));
      },
      { signal }
    );

    filenameInput.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") preview.dispatchEvent(new Event("click"));
      },
      { signal }
    );

    preview.addEventListener(
      "click",
      async () => {
        iframe.contentDocument.dispatchEvent(new FocusEvent("blur"));
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
      { signal, once: true }
    );

    selectAll.addEventListener(
      "click",
      () => {
        iframe.contentDocument.dispatchEvent(new FocusEvent("blur"));
        e.target.showPicker();
      },
      { signal, once: true }
    );

    window.addEventListener(
      "resize",
      () => {
        console.log("resized");
        iframe.contentDocument.body.style.setProperty("--devicePixelRatio", iframe.contentWindow.devicePixelRatio);
        root.style.setProperty("--devicePixelRatio", window.devicePixelRatio);
      },
      { signal }
    );

    exportFunction(() => {}, HTMLElement.prototype, { defineAs: "blur" });
    exportFunction(() => {}, HTMLElement.prototype, { defineAs: "focus" });

    await previewImage.decode();

    iframe.contentDocument.addEventListener(
      "blur",
      (e) => {
        controller.abort();
        aside.remove();
        exportFunction(HTMLElement.prototype.blur, HTMLElement.prototype, { defineAs: "blur" });
        exportFunction(HTMLElement.prototype.focus, HTMLElement.prototype, { defineAs: "focus" });
      },
      { signal, once: true }
    );

    if (settings.showFilenameBox) filenameInput.focus();
    else iframe.contentDocument.body.focus({ preventScroll: true });

    root.animate([{ transform: "translateY(calc(-20px / var(--devicePixelRatio)))" }, { opacity: "1", pointerEvents: "initial" }], {
      duration: 140,
      fill: "forwards",
      easing: "cubic-bezier(0, 0, 0, 1)",
    });
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
