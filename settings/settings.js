window.addEventListener("DOMContentLoaded", async () => {
  const settings = {
    clearOnPaste: {
      question: browser.i18n.getMessage("clearOnPaste"),
      answers: [
        {
          diplayValue: browser.i18n.getMessage("true"),
          value: true,
        },
        {
          diplayValue: browser.i18n.getMessage("false"),
          value: false,
          default: true,
        },
      ],
    },
    showFilenameBox: {
      question: browser.i18n.getMessage("showFilenameBox"),
      answers: [
        {
          diplayValue: browser.i18n.getMessage("true"),
          value: true,
        },
        {
          diplayValue: browser.i18n.getMessage("false"),
          value: false,
          default: true,
        },
      ],
    },
    defaultFilename: {
      question: browser.i18n.getMessage("defaultFilename"),
      answers: [
        {
          diplayValue: browser.i18n.getMessage("formattedTime"),
          value: "formatted",
          default: true,
        },
        {
          diplayValue: browser.i18n.getMessage("unixTimestamp"),
          value: "unix",
        },
        {
          diplayValue: "unknown.png",
          value: "unknown",
        },
      ],
    },
  };
  const main = document.getElementById("root");

  for (const settingName in settings) {
    const setting = settings[settingName];
    const form = document.createElement("form");
    const question = document.createElement("p");
    question.textContent = setting.question;
    form.appendChild(question);

    for (const answer of setting.answers) {
      const input = document.createElement("input");
      const id = crypto.randomUUID();
      input.setAttribute("type", "radio");
      input.setAttribute("id", id);
      input.setAttribute("name", settingName);
      input.setAttribute("value", answer.value);

      const storedValues = await browser.storage.local.get(settingName);
      const storedValue = storedValues[settingName];

      if (answer.value == storedValue) input.setAttribute("checked", "checked");
      else if (!storedValue && answer.default) input.setAttribute("checked", "checked");

      input.addEventListener("change", (e) => {
        browser.storage.local.set({ [settingName]: answer.value });
      });

      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = answer.diplayValue;

      form.appendChild(input);
      form.appendChild(label);
    }

    main.appendChild(form);
  }
});
