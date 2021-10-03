let clientX;
let clientY;

async function handleClick(e) {
  if (e.target.matches("input[type=file]:not([webkitdirectory], [directory])")) {
    e.preventDefault();

    const clipboardItems = await navigator.clipboard.read();
    const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

    if (clipboardImageItem) {
      const aside = document.createElement("aside");

      aside.style.all = "unset";
      aside.setAttribute("tabindex", -1);

      const shadow = aside.attachShadow({ mode: "closed", delegatesFocus: true });
      const theImage = await clipboardImageItem.getType("image/png");
      const frameRequest = await fetch(browser.runtime.getURL(`content_script/frame.html`));
      const frameFragment = document.createRange().createContextualFragment(await frameRequest.text());

      shadow.append(frameFragment);

      const preview = shadow.getElementById("preview");
      const root = shadow.getElementById("root");
      const selectAll = shadow.getElementById("selectAll");

      preview.style.backgroundImage = `url(${URL.createObjectURL(theImage)})`;

      root.style.left = (clientX + 250 > window.visualViewport.width + window.visualViewport.pageLeft ? clientX - 250 : clientX) + "px";
      root.style.top = (clientY - 200 < 0 ? clientY + window.visualViewport.pageTop : clientY + window.visualViewport.pageTop - 200) + "px";

      preview.addEventListener(
        "click",
        () => {
          aside.remove();
          const dataTransfer = new DataTransfer();

          const date = new Date(Date.now());
          const currentDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
          const filenameDate = currentDateTime.substring(0, 10);
          const filenameTime = currentDateTime.substring(11, 19).replace(/:/g, "-");

          dataTransfer.items.add(new File([theImage], `img-${filenameDate}-${filenameTime}.png`, { type: "image/png" }));
          e.target.files = dataTransfer.files;
          e.target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        },
        { once: true }
      );
      selectAll.addEventListener(
        "click",
        () => {
          aside.remove();
          replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);
        },
        { once: true }
      );

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
document.addEventListener("pointerdown", (e) => ((clientX = e.clientX), (clientY = e.clientY)), { passive: true });

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
