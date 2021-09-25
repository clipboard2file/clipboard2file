let clientX;
let clientY;
let currentAside;

(async () => {
  async function handleClick(e) {
    if (e.target.matches("input[type=file]:not([webkitdirectory], [directory])")) {
      e.preventDefault();

      const clipboardItems = await navigator.clipboard.read();

      const clipboardImageItem = clipboardItems.find((item) => item.types.includes("image/png"));

      if (clipboardImageItem) {
        if (currentAside?.remove) currentAside.remove();

        const aside = document.createElement("aside");
        const shadow = aside.attachShadow({ mode: "closed", delegatesFocus: true });
        const theImage = await clipboardImageItem.getType("image/png");
        const frameRequest = await fetch(browser.runtime.getURL(`content_script/frame.html`));

        shadow.innerHTML = await frameRequest.text();

        const preview = shadow.getElementById("preview");
        const root = shadow.getElementById("root");
        const selectAll = shadow.getElementById("selectAll");

        preview.src = URL.createObjectURL(theImage);
        root.style.left = (clientX < 0 ? 0 : clientX + document.documentElement.scrollLeft) + "px";
        root.style.top = (clientY - 200 < 0 ? clientY + document.documentElement.scrollTop : clientY + document.documentElement.scrollTop - 200) + "px";

        preview.addEventListener(
          "click",
          () => {
            aside.remove();
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(new File([theImage], `${window.performance.now()}.png`));
            e.target.files = dataTransfer.files;
            e.target.dispatchEvent(new Event("change", { bubbles: true }));
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

        document.documentElement.append(aside);
        currentAside = aside;
      } else {
        replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);
      }
    }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener(
    "pointerdown",
    (e) => {
      clientX = e.clientX;
      clientY = e.clientY;

      if (e.target.isEqualNode(currentAside) === false && currentAside?.remove) currentAside.remove();
    },
    { passive: true }
  );
  window.addEventListener(
    "resize",
    (e) => {
      if (currentAside?.remove) currentAside.remove();
    },
    { passive: true }
  );
  window.addEventListener(
    "blur",
    (e) => {
      if (currentAside?.remove) currentAside.remove();
    },
    { passive: true }
  );
})();

function replaceFilesOnInputWithFilesFromFakeInputAndYeah(e) {
  const newInput = document.createElement("input");
  for (attr of e.target.attributes) newInput.setAttribute(attr.name, attr.value);
  newInput.click();
  newInput.addEventListener(
    "change",
    () => {
      e.target.files = newInput.files;
      e.target.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { once: true }
  );
}
