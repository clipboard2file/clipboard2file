let clientX;
let clientY;

async function handleClick(e) {
  if (e.target.matches("input[type=file]:not([webkitdirectory])")) {
    e.preventDefault();

    // Fall back to default behavior (inscure context, user forgot to set dom.events.asyncClipboard.clipboardItem to true in about:config, etc.)
    if (!navigator.clipboard?.read) return e.target.showPicker();

    const clipboardItems = await navigator.clipboard.read();

    // At some point we should handle multiple images being in the clipboard, which is possible apparently
    const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

    if (clipboardImageItem) {
      const aside = document.createElement("aside");
      const shadow = aside.attachShadow({ mode: "closed", delegatesFocus: true });
      const clipboardImage = await clipboardImageItem.getType("image/png");
      const settings = await browser.storage.local.get(["showFilenameBox", "clearOnPaste", "defaultFilename"]);
      const frameRequest = await fetch(browser.runtime.getURL(`content_script/frame.html`));
      const styleRequest = await fetch(browser.runtime.getURL(`content_script/frame.css`));
      const frameFragment = document.createRange().createContextualFragment(await frameRequest.text());

      const styleElem = document.createElement("style");
      styleElem.textContent = await styleRequest.text();
      shadow.appendChild(styleElem);
      shadow.append(frameFragment);
      const root = shadow.getElementById("root");
      const preview = shadow.getElementById("preview");
      const selectAll = shadow.getElementById("selectAll");
      const filenameInput = shadow.getElementById("filename");

      let defaultFilename;
      if (settings.defaultFilename === "unix") defaultFilename = String(Date.now());
      else if (settings.defaultFilename === "unknown") defaultFilename = "unknown";
      else defaultFilename = generateFilename();

      filenameInput.value = `${defaultFilename}.png`;
      filenameInput.setAttribute("placeholder", `${defaultFilename}.png`);
      filenameInput.setSelectionRange(0, defaultFilename.length);

      if (!settings.showFilenameBox) filenameInput.style.display = "none";

      aside.setAttribute("tabindex", -1);

      root.style.setProperty("--devicePixelRatio", window.devicePixelRatio);

      const img = new Image();
      img.src = URL.createObjectURL(clipboardImage);
      await img.decode();
      preview.style.backgroundImage = `url(${img.src})`;

      // this sucks a LOT and is a terrible hack. At some point I should refactor the entire extension to use iframes.
      for (const key in aside) {
        if (/^on/.test(key)) {
          const eventType = key.substring(2);
          aside.addEventListener(eventType, (e) => e.stopPropagation());
        }
      }

      aside.addEventListener(
        "focusout",
        (e) => {
          aside.remove();
          exportFunction(HTMLElement.prototype.blur, HTMLElement.prototype, { defineAs: "blur" });
          exportFunction(HTMLElement.prototype.focus, HTMLElement.prototype, { defineAs: "focus" });
        },
        { once: true }
      );

      aside.addEventListener("keydown", (e) => {
        if (e.key === "Escape") aside.dispatchEvent(new Event("focusout"));
      });

      filenameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") preview.dispatchEvent(new Event("click"));
      });

      preview.addEventListener(
        "click",
        async (event) => {
          aside.dispatchEvent(new Event("focusout"));
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
          aside.dispatchEvent(new Event("focusout"));
          e.target.showPicker();
        },
        { once: true }
      );

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

      // temporarily stop the page from being able to change focus
      // see https://github.com/vord1080/clipboard2file/issues/3#issuecomment-1024479980
      exportFunction(() => {}, HTMLElement.prototype, { defineAs: "blur" });
      exportFunction(() => {}, HTMLElement.prototype, { defineAs: "focus" });

      aside.isPopup = true;
      document.documentElement.appendChild(aside);
      aside.focus({ preventScroll: true });

      if (settings.showFilenameBox) filenameInput.focus();
    } else {
      e.target.showPicker();
    }
  }
}

window.addEventListener("click", handleClick);
document.addEventListener("pointerup", (e) => ((clientX = e.clientX), (clientY = e.clientY)), { passive: true });

// fix for extension not working on tinypng.com or any other website that stops propagation of input events. i hope this doesn't break anything.
exportFunction(
  function () {
    if (!this.target.isPopup) this.stopPropagation();
    if (this.type === "click") handleClick(this);
  },
  Event.prototype,
  { defineAs: "stopPropagation" }
);

// fix for extension not working on neo-lms.com
exportFunction(
  function () {
    if (!this.target.isPopup) this.stopImmediatePropagation();
  },
  Event.prototype,
  { defineAs: "stopImmediatePropagation" }
);

// fix for extension not working on neo-lms.com
exportFunction(
  function () {
    if (!this.target.isPopup) this.preventDefault();
  },
  Event.prototype,
  { defineAs: "preventDefault" }
);

function generateFilename() {
  const date = new Date(Date.now());
  const currentDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
  const filenameDate = currentDateTime.substring(0, 10);
  const filenameTime = currentDateTime.substring(11, 19).replace(/:/g, "-");

  return `img-${filenameDate}-${filenameTime}`;
}
