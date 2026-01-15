export const groups = [
  { id: "images", l10nLabel: "imageSettings", toggleKey: "enableImagePaste" },
  { id: "text", l10nLabel: "textSettings", toggleKey: "enableTextPaste" },
];

export const options = [
  {
    key: "theme",
    type: "select",
    default: "auto",
    l10nLabel: "themeLabel",
    options: [
      { value: "auto", l10nId: "themeAuto" },
      { value: "light", l10nId: "themeLight" },
      { value: "dark", l10nId: "themeDark" },
    ],
  },
  {
    key: "enableImagePaste",
    type: "checkbox",
    default: true,
    groupId: "images",
    hidden: true,
    l10nLabel: "enableImagePaste",
  },
  {
    key: "clearOnPasteImage",
    type: "checkbox",
    default: false,
    groupId: "images",
    l10nLabel: "clearOnPasteImage",
  },
  {
    key: "showFormatToggleButton",
    type: "checkbox",
    default: false,
    groupId: "images",
    l10nLabel: "showFormatToggleButton",
  },
  {
    key: "showFilenameBoxImage",
    type: "checkbox",
    default: false,
    groupId: "images",
    l10nLabel: "showFilenameBox",
  },
  {
    key: "defaultFileType",
    type: "select",
    default: "png",
    groupId: "images",
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
    groupId: "images",
    l10nLabel: "jpegQuality",
    condition: {
      key: "defaultFileType",
      value: "jpeg",
    },
  },
  {
    key: "defaultFilenameImage",
    type: "select",
    default: "formatted",
    groupId: "images",
    l10nLabel: "defaultFilename",
    linkedInput: "customFilenameImage",
    options: [
      { value: "formatted", l10nId: "formattedTime" },
      { value: "unix", l10nId: "unixTimestamp" },
      { value: "custom", l10nId: "custom" },
    ],
  },
  {
    key: "customFilenameImage",
    type: "customInputWithButton",
    groupId: "images",
    l10nLabel: "customFilenameLabel",
    placeholderL10n: "customPlaceholder",
    buttonL10n: "save",
    default: "",
    condition: {
      key: "defaultFilenameImage",
      value: "custom",
    },
  },
  {
    key: "enableTextPaste",
    type: "checkbox",
    default: false,
    groupId: "text",
    hidden: true,
    l10nLabel: "enableTextPaste",
  },
  {
    key: "clearOnPasteText",
    type: "checkbox",
    default: false,
    groupId: "text",
    l10nLabel: "clearOnPasteText",
  },
  {
    key: "showFilenameBoxText",
    type: "checkbox",
    default: false,
    groupId: "text",
    l10nLabel: "showFilenameBox",
  },
  {
    key: "defaultFilenameText",
    type: "select",
    default: "formatted",
    groupId: "text",
    l10nLabel: "defaultFilename",
    linkedInput: "customFilenameText",
    options: [
      { value: "formatted", l10nId: "formattedTime" },
      { value: "unix", l10nId: "unixTimestamp" },
      { value: "custom", l10nId: "custom" },
    ],
  },
  {
    key: "customFilenameText",
    type: "customInputWithButton",
    groupId: "text",
    l10nLabel: "customFilenameLabel",
    placeholderL10n: "customPlaceholder",
    buttonL10n: "save",
    default: "",
    condition: {
      key: "defaultFilenameText",
      value: "custom",
    },
  },
  {
    key: "textExtension",
    type: "customInputWithButton",
    groupId: "text",
    l10nLabel: "textExtensionLabel",
    buttonL10n: "save",
    default: "txt",
  },
];

export async function getAllSettings() {
  const stored = await browser.storage.local.get();
  const settings = {};
  for (const option of options) {
    const val = stored[option.key];
    settings[option.key] = val !== undefined ? val : option.default;
  }
  return settings;
}

export async function getSetting(key) {
  const option = options.find(o => o.key === key);
  if (!option) return null;
  const stored = await browser.storage.local.get(key);
  return stored[key] !== undefined ? stored[key] : option.default;
}
