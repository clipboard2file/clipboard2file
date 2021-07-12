// Dumb
let clientX;
let clientY;

function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

const pickerID = uuidv4();
const selectImageID = uuidv4();
const selectAllID = uuidv4();
const slideUpID = uuidv4();

const stylesheet = document.createElement("style");
stylesheet.innerHTML = `div[id="${pickerID}"] {
  width: 250px;
  height: 180px;
  background-color: #42414D;
  border-radius: 8px;
  padding: 0.8em;
  font: message-box;
  color: white;
  font-size: 14px;
  display: grid;
  transform: scale(0);
  user-select: none;
  border: 1px #52525e solid;
  position: absolute;
  z-index: 2147483647;
  animation: ${slideUpID} 0.3s ease;
}
button[id="${selectAllID}"] {
  height: 30px;
  align-self: end;
  margin-top: 0.8em;
  background-color: #00ddff;
  font: message-box;
  border: none;
  color: rgb(21, 20, 26);
  text-transform: uppercase;
  border-radius: 3px;
  font-weight: 600;
}
button[id="${selectAllID}"]:hover {
  background-color: rgb(128, 235, 255);
}
button[id="${selectAllID}"]:active {
  background-color: rgb(170, 242, 255);
}
img[id="${selectImageID}"] {
  object-fit: contain;
  width: 100%;
  height: 116px;
  align-self: center;
  justify-self: center;
  border-radius: 4px;
}
img[id="${selectImageID}"]:hover {
  outline: 2px solid #00ddff;
}

img[id="${selectImageID}"]:active {
  outline: 2px solid rgb(128, 235, 255);
}

@keyframes ${slideUpID} {
  0% {
      opacity: 0;
      transform: translateY(20px);
  }
  100% {
      opacity: 1;
      transform: translateY(0);
  }
}
`;

document.documentElement.append(stylesheet);

function replaceFilesOnInputWithFilesFromFakeInputAndYeah(e) {
  const newInput = document.createElement("input");
  newInput.setAttribute("type", "file");
  if (e.target.attributes.multiple) newInput.setAttribute("multiple", e.target.attributes.multiple.value);
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

const handleClick = async function (e) {
  if (e.target.tagName === "INPUT" && e.target.attributes.type?.value === "file") {
    if (!e.target.attributes.webkitdirectory || !e.target.attributes.directory) {
      e.preventDefault();

      const clipboardItems = await navigator.clipboard.read();

      const hasImage = clipboardItems.find((item) => item.types.includes("image/png"));

      if (clipboardItems.length > 0 && hasImage) {
        document.documentElement.insertAdjacentHTML("beforeend", `<div id="${pickerID}"><img id="${selectImageID}" draggable="false" ondragstart="return false;"/><button id="${selectAllID}">Show all files</button></div>`);

        const picker = document.getElementById(pickerID);
        const selectAll = document.getElementById(selectAllID);
        const selectImage = document.getElementById(selectImageID);

        picker.style.left = (clientX < 0 ? 0 : clientX + document.documentElement.scrollLeft) + "px";
        picker.style.top = (clientY - 180 < 0 ? clientY + document.documentElement.scrollTop : clientY + document.documentElement.scrollTop - 180) + "px";

        selectImage.addEventListener("load", () => (picker.style.transform = "scale(1)"), { once: true });

        const pasteable = await hasImage.getType("image/png");

        selectImage.src = URL.createObjectURL(pasteable);

        selectAll.addEventListener(
          "click",
          () => {
            picker.remove();
            replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);
          },
          { once: true }
        );

        selectImage.addEventListener(
          "click",
          () => {
            picker.remove();
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(new File([pasteable], `${window.performance.now()}.png`));
            e.target.files = dataTransfer.files;
            e.target.dispatchEvent(new Event("change", { bubbles: true }));
          },
          { once: true }
        );
      } else {
        replaceFilesOnInputWithFilesFromFakeInputAndYeah(e);
      }
    }
  }
};

document.addEventListener("click", handleClick);
document.addEventListener(
  "click",
  (e) => {
    const possiblePicker = document.getElementById(pickerID);
    if (possiblePicker && !possiblePicker.contains(e.target)) possiblePicker.remove();
  },
  { passive: true }
);
document.addEventListener(
  "pointerdown",
  (e) => {
    (clientX = e.clientX), (clientY = e.clientY);
  },
  { passive: true }
);
window.addEventListener(
  "resize",
  (e) => {
    const possiblePicker = document.getElementById(pickerID);
    if (possiblePicker) possiblePicker.remove();
  },
  { passive: true }
);
