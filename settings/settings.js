if (!("randomUUID" in crypto))
  // https://stackoverflow.com/a/2117523/2800218
  // LICENSE: https://creativecommons.org/licenses/by-sa/4.0/legalcode
  crypto.randomUUID = function randomUUID() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  };

window.addEventListener("DOMContentLoaded", async () => {
  const settings = {
    clearOnPaste: {
      question: "Clear clipboard on paste?",
      answers: [
        {
          diplayValue: "Yes",
          value: true,
        },
        {
          diplayValue: "No",
          value: false,
          default: true,
        },
      ],
    },
    showFilenameBox: {
      question: "Show text box for editing file name?",
      answers: [
        {
          diplayValue: "Yes",
          value: true,
        },
        {
          diplayValue: "No",
          value: false,
          default: true,
        },
      ],
    },
    defaultFilename: {
      question: "What should the default file name be?",
      answers: [
        {
          diplayValue: "Formatted Time",
          value: "formatted",
          default: true,
        },
        {
          diplayValue: "UNIX Timestamp",
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
