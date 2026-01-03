export const options = [
  {
    key: "clearOnPaste",
    type: "checkbox",
    default: false,
    l10nLabel: "clearOnPaste",
  },
  {
    key: "showFilenameBox",
    type: "checkbox",
    default: false,
    l10nLabel: "showFilenameBox",
  },
  {
    key: "defaultFilename",
    type: "select",
    default: "formatted",
    l10nLabel: "defaultFilename",
    options: [
      { value: "formatted", l10nId: "formattedTime" },
      { value: "unix", l10nId: "unixTimestamp" },
      { value: "unknown", text: "unknown.png" },
      { value: "custom", l10nId: "custom" },
    ],
  },
  {
    key: "customFilenameText",
    type: "customInputWithButton",
    l10nLabel: "customFilenameLabel",
    placeholderL10n: "customPlaceholder",
    buttonL10n: "save",
    default: "",
    condition: {
      key: "defaultFilename",
      value: "custom",
    },
  },
  {
    key: "defaultFileType",
    type: "select",
    default: "png",
    l10nLabel: "defaultFileType",
    options: [
      { value: "png", text: "PNG" },
      { value: "jpeg", text: "JPG" },
    ],
  },
  {
    key: "jpegQuality",
    type: "range",
    default: 80,
    min: 50,
    max: 100,
    step: 1,
    unit: "%",
    l10nLabel: "jpegQuality",
    condition: {
      key: "defaultFileType",
      value: "jpeg",
    },
  },
];

export async function getAllSettings() {
  const defaults = options.reduce((acc, curr) => {
    acc[curr.key] = curr.default;
    return acc;
  }, {});

  const stored = await browser.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...stored };
}

export async function getSetting(key) {
  const option = options.find(o => o.key === key);
  if (!option) return null;
  const stored = await browser.storage.local.get(key);
  return stored[key] !== undefined ? stored[key] : option.default;
}
