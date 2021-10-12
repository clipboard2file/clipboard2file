let clientX;
let clientY;

async function handleClick(e) {
  if (e.target.matches("input[type=file]:not([webkitdirectory], [directory])")) {
    e.preventDefault();
    if (!navigator.clipboard.read) return replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);

    const clipboardItems = await navigator.clipboard.read();
    const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

    if (clipboardImageItem) {
      const aside = document.createElement("aside");
      const shadow = aside.attachShadow({ mode: "closed", delegatesFocus: true });
      const clipboardImage = await clipboardImageItem.getType("image/png");
      const frameRequest = await fetch(browser.runtime.getURL(`content_script/frame.html`));
      const frameFragment = document.createRange().createContextualFragment(await frameRequest.text());

      shadow.append(frameFragment);

      const root = shadow.getElementById("root");
      const preview = shadow.getElementById("preview");
      const selectAll = shadow.getElementById("selectAll");

      aside.setAttribute("tabindex", -1);
      root.style.setProperty("--devicePixelRatio", window.devicePixelRatio);

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

      const img = new Image();
      img.src = URL.createObjectURL(clipboardImage);
      await img.decode();

      preview.style.backgroundImage = `url(${img.src})`;

      preview.addEventListener(
        "click",
        () => {
          aside.remove();

          const date = new Date(Date.now());
          const currentDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
          const filenameDate = currentDateTime.substring(0, 10);
          const filenameTime = currentDateTime.substring(11, 19).replace(/:/g, "-");

          const dataTransfer = new DataTransfer();

          dataTransfer.items.add(new File([clipboardImage], `img-${filenameDate}-${filenameTime}.png`, { type: "image/png" }));
          e.target.files = dataTransfer.files;
          e.target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        },
        { once: true }
      );

      selectAll.addEventListener("click", () => replaceFilesOnInputWithFilesFromFakeInputAndYeah(e), { once: true });

      aside.addEventListener("focusout", (e) => aside.remove(), { once: true });
      aside.addEventListener("keydown", (e) => {
        if (e.key === "Escape") aside.remove();
      });

      document.documentElement.append(aside);
      aside.focus({ preventScroll: true });
    } else {
      replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);
    }
  }
}

document.addEventListener("click", handleClick);
document.addEventListener("pointerup", (e) => ((clientX = e.clientX), (clientY = e.clientY)), { passive: true });

function replaceFilesOnInputWithFilesFromFakeInputAndYeah(e) {
  const decoyInput = document.createElement("input");
  for (attr of e.target.attributes) decoyInput.setAttribute(attr.name, attr.value);
  decoyInput.addEventListener(
    "change",
    () => {
      e.target.files = decoyInput.files;
      e.target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    },
    { once: true }
  );
  decoyInput.click();
}
