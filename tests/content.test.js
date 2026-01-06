import { assert, config } from "chai";

import {
  getTestUrl,
  launchFirefox,
  writeImageToClipboard,
  clearClipboard,
  consumeTransientUserActivation,
} from "./helpers.js";

config.truncateThreshold = 0;

const configs = [
  { label: "Without extension installed", extension: false },
  { label: "With extension installed", extension: true },
];

for (const config of configs) {
  describe(config.label, function () {
    before(async function () {
      this.browser = await launchFirefox({ extension: config.extension });
    });

    after(async function () {
      await this.browser.close();
    });

    beforeEach(async function () {
      this.page = await this.browser.newPage();
      await this.page.goto(getTestUrl("content.html"));

      await writeImageToClipboard(this.page);

      await consumeTransientUserActivation(this.page);

      let isActive = await this.page.evaluate(
        () => navigator.userActivation.isActive
      );
      assert.isFalse(
        isActive,
        "Page should not have transient user activation at the beginning of the test"
      );
    });

    afterEach(async function () {
      await clearClipboard(this.page);
      await this.page.close();
    });

    it("Event.prototype.preventDefault should not have a 'prototype' property", async function () {
      const hasPrototype = await this.page.evaluate(() => {
        return Event.prototype.preventDefault.prototype !== undefined;
      });
      assert.isFalse(
        hasPrototype,
        "Native methods should not have a .prototype property"
      );
    });

    it("Event.prototype.defaultPrevented getter should be named 'get defaultPrevented'", async function () {
      const getterName = await this.page.evaluate(() => {
        return Object.getOwnPropertyDescriptor(
          Event.prototype,
          "defaultPrevented"
        ).get.name;
      });
      assert.equal(
        getterName,
        "get defaultPrevented",
        "Getter name should be 'get defaultPrevented'"
      );
    });

    it("Event.prototype.returnValue getter should be named 'get returnValue'", async function () {
      const getterName = await this.page.evaluate(() => {
        return Object.getOwnPropertyDescriptor(Event.prototype, "returnValue")
          .get.name;
      });
      assert.equal(
        getterName,
        "get returnValue",
        "Getter name should be 'get returnValue'"
      );
    });

    it("Event.prototype.returnValue setter should be named 'set returnValue'", async function () {
      const setterName = await this.page.evaluate(() => {
        return Object.getOwnPropertyDescriptor(Event.prototype, "returnValue")
          .set.name;
      });
      assert.equal(
        setterName,
        "set returnValue",
        "Setter name should be 'set returnValue'"
      );
    });

    it("Event.prototype.preventDefault.toString() should contain '[native code]'", async function () {
      const isFormatted = await this.page.evaluate(() => {
        const str = Event.prototype.preventDefault.toString();
        return str.includes("[native code]");
      });
      assert.isTrue(isFormatted, "toString() should match native formatting");
    });

    it("Event.prototype.preventDefault should not be constructible", async function () {
      const { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.construct(Event.prototype.preventDefault, []);
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.include(
        message,
        "not a constructor",
        "Error message should match native"
      );
    });

    it("Event.prototype.preventDefault called on a plain object should throw TypeError without leaking extension info", async function () {
      const result = await this.page.evaluate(() => {
        try {
          Event.prototype.preventDefault.call({});
          return { status: "" };
        } catch (e) {
          return {
            status: "error",
            name: e.name,
            message: e.message,
            stack: e.stack || "",
            fileName: e.fileName || "",
          };
        }
      });

      assert.equal(
        result.status,
        "error",
        "Should throw error on invalid receiver"
      );
      assert.equal(
        result.name,
        "TypeError",
        "Should throw TypeError on invalid receiver"
      );
      assert.equal(
        result.message,
        "'preventDefault' called on an object that does not implement interface Event.",
        "Error message should match native"
      );
      assert.notInclude(
        result.stack,
        "all_frames.js",
        "Stack trace should not contain extension file"
      );
      assert.notInclude(
        result.stack,
        "moz-extension",
        "Stack trace should not contain extension ID"
      );
      assert.notInclude(
        result.fileName,
        "all_frames.js",
        "Error fileName should not be the extension file"
      );
    });

    it("Event.prototype.defaultPrevented should throw correct TypeError on invalid receiver", async function () {
      let { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.get(Event.prototype, "defaultPrevented", {});
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.equal(
        message,
        `'get defaultPrevented' called on an object that does not implement interface Event.`,
        "Error message should match native"
      );
    });

    it("Event.prototype.returnValue getter should throw correct TypeError on invalid receiver", async function () {
      let { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.get(Event.prototype, "returnValue", {});
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.equal(
        message,
        `'get returnValue' called on an object that does not implement interface Event.`,
        "Error message should match native"
      );
    });

    it("Event.prototype.returnValue setter should throw correct TypeError on invalid receiver", async function () {
      let { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.set(Event.prototype, "returnValue", false, {});
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.equal(
        message,
        `'set returnValue' called on an object that does not implement interface Event.`,
        "Error message should match native"
      );
    });

    it("Clicking a detached file input should report defaultPrevented is false", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            const input = document.createElement("input");
            input.type = "file";
            input.onclick = e => {
              resolve({
                defaultPrevented: e.defaultPrevented,
                returnValue: e.returnValue,
              });
            };
            input.click();
          };
        });
      });

      await this.page.click("#trigger-btn");

      const { defaultPrevented, returnValue } = await promise;
      assert.isFalse(defaultPrevented, "defaultPrevented should be false");
      assert.isTrue(returnValue, "returnValue should be true");
    });

    it("Clicking an attached hidden file input should report defaultPrevented is false", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const input = document.getElementById("hidden-input");
          input.addEventListener(
            "click",
            e => {
              resolve(e.defaultPrevented);
            },
            { once: true }
          );
        });
      });

      await this.page.click("#hidden-input");

      const defaultPrevented = await promise;
      assert.isFalse(defaultPrevented, "defaultPrevented should be false");
    });

    it("Dispatching manual events should not cause recursion errors", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            try {
              const input = document.createElement("input");
              input.type = "file";
              const evt = new MouseEvent("click", {
                cancelable: true,
                bubbles: true,
              });
              input.dispatchEvent(evt);
              resolve("OK");
            } catch (e) {
              resolve(e.message);
            }
          };
        });
      });

      await this.page.click("#trigger-btn");

      const result = await promise;
      assert.equal(
        result,
        "OK",
        "Manual event dispatch should not trigger recursion"
      );
    });

    it("Page preventDefault() should take precedence", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const input = document.getElementById("main-input");
          input.onclick = e => {
            e.preventDefault();
            resolve({
              defaultPrevented: e.defaultPrevented,
              returnValue: e.returnValue,
            });
          };
        });
      });

      await this.page.click("#main-input");

      const { defaultPrevented, returnValue } = await promise;
      assert.isTrue(defaultPrevented, "Page cancellation should be respected");
      assert.isFalse(returnValue, "returnValue should reflect cancellation");
    });

    it("non-input elements should handle preventDefault correctly", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const div = document.getElementById("test-div");
          div.onclick = e => {
            e.preventDefault();
            resolve(e.defaultPrevented);
          };
        });
      });

      await this.page.click("#test-div");

      const defaultPrevented = await promise;
      assert.isTrue(
        defaultPrevented,
        "non-input elements should handle preventDefault normally"
      );
    });

    it("Scripted click() without transient user activation should report defaultPrevented is false", async function () {
      const isActive = await this.page.evaluate(
        () => navigator.userActivation.isActive
      );
      assert.isFalse(
        isActive,
        "Page should not have transient user activation"
      );

      const defaultPrevented = await this.page.evaluate(() => {
        const input = document.createElement("input");
        input.type = "file";
        let p = null;
        input.onclick = e => {
          p = e.defaultPrevented;
        };
        input.click();
        return p;
      });

      assert.isFalse(defaultPrevented, "defaultPrevented should be false");
    });

    it("HTMLDialogElement.prototype.showModal should not have a 'prototype' property", async function () {
      const hasPrototype = await this.page.evaluate(() => {
        return HTMLDialogElement.prototype.showModal.prototype !== undefined;
      });
      assert.isFalse(
        hasPrototype,
        "HTMLDialogElement.prototype.showModal should not have a prototype property"
      );
    });

    it("HTMLDialogElement.prototype.showModal.toString() should contain '[native code]'", async function () {
      const isFormatted = await this.page.evaluate(() => {
        return HTMLDialogElement.prototype.showModal
          .toString()
          .includes("[native code]");
      });
      assert.isTrue(isFormatted, "toString() should match native formatting");
    });

    it("HTMLDialogElement.prototype.showModal should not be constructible", async function () {
      const { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.construct(HTMLDialogElement.prototype.showModal, []);
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.include(
        message,
        "not a constructor",
        "Error message should match native"
      );
    });

    it("HTMLDialogElement.prototype.showModal called on plain object should throw TypeError without leaking extension info", async function () {
      const result = await this.page.evaluate(() => {
        try {
          HTMLDialogElement.prototype.showModal.call({});
          return { status: "" };
        } catch (e) {
          return {
            status: "error",
            name: e.name,
            message: e.message,
            stack: e.stack || "",
            fileName: e.fileName || "",
          };
        }
      });

      assert.equal(result.status, "error", "Should throw error");
      assert.equal(result.name, "TypeError", "Should throw TypeError");
      assert.equal(
        result.message,
        "'showModal' called on an object that does not implement interface HTMLDialogElement.",
        "Error message should match native"
      );
      assert.notInclude(
        result.stack,
        "parent_frame.js",
        "Stack trace should not leak file name"
      );
      assert.notInclude(
        result.stack,
        "moz-extension",
        "Stack trace should not leak extension ID"
      );
    });

    it("HTMLElement.prototype.showPopover should not have a 'prototype' property", async function () {
      const hasPrototype = await this.page.evaluate(() => {
        return HTMLElement.prototype.showPopover.prototype !== undefined;
      });
      assert.isFalse(
        hasPrototype,
        "HTMLElement.prototype.showPopover should not have a prototype property"
      );
    });

    it("HTMLElement.prototype.showPopover.toString() should contain '[native code]'", async function () {
      const isFormatted = await this.page.evaluate(() => {
        return HTMLElement.prototype.showPopover
          .toString()
          .includes("[native code]");
      });
      assert.isTrue(isFormatted, "toString() should match native formatting");
    });

    it("HTMLElement.prototype.showPopover should not be constructible", async function () {
      const { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.construct(HTMLElement.prototype.showPopover, []);
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.include(
        message,
        "not a constructor",
        "Error message should match native"
      );
    });

    it("HTMLElement.prototype.showPopover called on plain object should throw TypeError without leaking extension info", async function () {
      const result = await this.page.evaluate(() => {
        try {
          HTMLElement.prototype.showPopover.call({});
          return { status: "" };
        } catch (e) {
          return {
            status: "error",
            name: e.name,
            message: e.message,
            stack: e.stack || "",
            fileName: e.fileName || "",
          };
        }
      });

      assert.equal(result.status, "error", "Should throw error");
      assert.equal(result.name, "TypeError", "Should throw TypeError");
      assert.equal(
        result.message,
        "'showPopover' called on an object that does not implement interface HTMLElement.",
        "Error message should match native"
      );
      assert.notInclude(
        result.stack,
        "parent_frame.js",
        "Stack trace should not leak file name"
      );
      assert.notInclude(
        result.stack,
        "moz-extension",
        "Stack trace should not leak extension ID"
      );
    });

    it("HTMLElement.prototype.togglePopover should not have a 'prototype' property", async function () {
      const hasPrototype = await this.page.evaluate(() => {
        return HTMLElement.prototype.togglePopover.prototype !== undefined;
      });
      assert.isFalse(
        hasPrototype,
        "HTMLElement.prototype.togglePopover should not have a prototype property"
      );
    });

    it("HTMLElement.prototype.togglePopover.toString() should contain '[native code]'", async function () {
      const isFormatted = await this.page.evaluate(() => {
        return HTMLElement.prototype.togglePopover
          .toString()
          .includes("[native code]");
      });
      assert.isTrue(isFormatted, "toString() should match native formatting");
    });

    it("HTMLElement.prototype.togglePopover should not be constructible", async function () {
      const { name, message } = await this.page.evaluate(() => {
        try {
          Reflect.construct(HTMLElement.prototype.togglePopover, []);
          return { name: "", message: "" };
        } catch (e) {
          return { name: e.name, message: e.message };
        }
      });
      assert.equal(name, "TypeError", "Should throw TypeError");
      assert.include(
        message,
        "not a constructor",
        "Error message should match native"
      );
    });

    it("HTMLElement.prototype.togglePopover called on plain object should throw TypeError without leaking extension info", async function () {
      const result = await this.page.evaluate(() => {
        try {
          HTMLElement.prototype.togglePopover.call({});
          return { status: "" };
        } catch (e) {
          return {
            status: "error",
            name: e.name,
            message: e.message,
            stack: e.stack || "",
            fileName: e.fileName || "",
          };
        }
      });

      assert.equal(result.status, "error", "Should throw error");
      assert.equal(result.name, "TypeError", "Should throw TypeError");
      assert.equal(
        result.message,
        "'togglePopover' called on an object that does not implement interface HTMLElement.",
        "Error message should match native"
      );
      assert.notInclude(
        result.stack,
        "parent_frame.js",
        "Stack trace should not leak file name"
      );
      assert.notInclude(
        result.stack,
        "moz-extension",
        "Stack trace should not leak extension ID"
      );
    });

    it("HTMLDialogElement.showModal() should function correctly", async function () {
      await this.page.evaluate(() => {
        const dlg = document.getElementById("test-dialog");
        dlg.showModal();
      });
      const isOpen = await this.page.evaluate(() => {
        const dlg = document.getElementById("test-dialog");
        return dlg.open;
      });
      assert.isTrue(isOpen, "Dialog should be open after showModal()");
    });

    it("HTMLElement.showPopover() should function correctly", async function () {
      await this.page.evaluate(() => {
        const po = document.getElementById("test-popover");
        po.showPopover();
      });
      const isOpen = await this.page.evaluate(() => {
        const po = document.getElementById("test-popover");
        return po.matches(":popover-open");
      });
      assert.isTrue(isOpen, "Popover should be open after showPopover()");
    });

    it("HTMLElement.togglePopover() should function correctly", async function () {
      await this.page.evaluate(() => {
        const po = document.getElementById("test-popover");
        if (po.matches(":popover-open")) po.hidePopover();
        po.togglePopover();
      });

      const isOpen = await this.page.evaluate(() => {
        const po = document.getElementById("test-popover");
        return po.matches(":popover-open");
      });
      assert.isTrue(isOpen, "Popover should be open after togglePopover()");
    });

    it("Disabled inputs should not fire events when clicked", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            const input = document.getElementById("disabled-input");
            let status = "did not fire";
            input.onclick = () => {
              status = "fired";
            };
            input.click();
            resolve(status);
          };
        });
      });

      await this.page.click("#trigger-btn");

      const result = await promise;
      assert.equal(
        result,
        "did not fire",
        "Clicking a disabled input should not trigger event listeners"
      );
    });

    it("webkitdirectory inputs should work", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            const input = document.getElementById("dir-input");
            input.onclick = e => {
              resolve({
                defaultPrevented: e.defaultPrevented,
                returnValue: e.returnValue,
              });
            };
            input.click();
          };
        });
      });

      await this.page.click("#trigger-btn");

      const { defaultPrevented, returnValue } = await promise;
      assert.isFalse(defaultPrevented, "defaultPrevented should be false");
      assert.isTrue(returnValue, "returnValue should be true");
    });

    it("Non-MouseEvent clicks should behave normally", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            const input = document.getElementById("main-input");
            const evt = new Event("click", {
              bubbles: true,
              cancelable: true,
            });
            input.onclick = e => {
              resolve({
                defaultPrevented: e.defaultPrevented,
                returnValue: e.returnValue,
              });
            };
            input.dispatchEvent(evt);
          };
        });
      });

      await this.page.click("#trigger-btn");

      const { defaultPrevented, returnValue } = await promise;
      assert.isFalse(defaultPrevented, "defaultPrevented should be false");
      assert.isTrue(
        returnValue,
        "returnValue should be true (indicating preventDefault was NOT called)"
      );
    });

    it("showPicker() on a disabled input should throw InvalidStateError", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            try {
              const input = document.getElementById("disabled-input");
              input.showPicker();
              resolve({ status: "success" });
            } catch (e) {
              resolve({ status: "error", name: e.name });
            }
          };
        });
      });

      await this.page.click("#trigger-btn");

      const result = await promise;
      assert.equal(
        result.status,
        "error",
        "showPicker should throw on disabled input"
      );
      assert.equal(
        result.name,
        "InvalidStateError",
        "Should be InvalidStateError"
      );
    });

    it("Setting returnValue to false should cancel the event and set defaultPrevented to true", async function () {
      const promise = this.page.evaluate(() => {
        return new Promise(resolve => {
          const btn = document.getElementById("trigger-btn");
          btn.onclick = () => {
            const input = document.getElementById("main-input");
            input.onclick = e => {
              e.returnValue = false;
              resolve({
                defaultPrevented: e.defaultPrevented,
                returnValue: e.returnValue,
              });
            };
            input.click();
          };
        });
      });

      await this.page.click("#trigger-btn");

      const { defaultPrevented, returnValue } = await promise;
      assert.isTrue(
        defaultPrevented,
        "Setting returnValue to false should prevent default"
      );
      assert.isFalse(
        returnValue,
        "Reading returnValue should reflect the set value"
      );
    });

    it("Setting returnValue to false on a non-cancelable MouseEvent should not set defaultPrevented to true", async function () {
      const { defaultPrevented, returnValue } = await this.page.evaluate(() => {
        const evt = new MouseEvent("click", { cancelable: false });
        evt.returnValue = false;
        return {
          defaultPrevented: evt.defaultPrevented,
          returnValue: evt.returnValue,
        };
      });

      assert.isFalse(
        defaultPrevented,
        "Non-cancelable MouseEvent cannot be defaultPrevented via returnValue"
      );
      assert.isTrue(
        returnValue,
        "returnValue should remain true for non-cancelable event"
      );
    });

    it("Calling preventDefault() on a non-cancelable Event should not set defaultPrevented to true", async function () {
      const defaultPrevented = await this.page.evaluate(() => {
        const evt = new Event("test", { cancelable: false });
        evt.preventDefault();
        return evt.defaultPrevented;
      });

      assert.isFalse(
        defaultPrevented,
        "Non-cancelable events cannot be defaultPrevented"
      );
    });

    it("Calling preventDefault() on a non-cancelable MouseEvent should not set defaultPrevented to true", async function () {
      const defaultPrevented = await this.page.evaluate(() => {
        const evt = new MouseEvent("click", { cancelable: false });
        evt.preventDefault();
        return evt.defaultPrevented;
      });

      assert.isFalse(
        defaultPrevented,
        "Non-cancelable MouseEvent cannot be defaultPrevented"
      );
    });

    it("showPicker() should require user activation", async function () {
      const result = await this.page.evaluate(async () => {
        try {
          const input = document.getElementById("color-input");
          input.showPicker();
          return { success: true };
        } catch (e) {
          return { success: false, name: e.name, message: e.message };
        }
      });

      assert.isFalse(result.success, "Should fail without user activation");
      assert.equal("NotAllowedError", result.name, "Should throw error");
    });

    it("dispatchEvent() should return false when event is cancelled by page", async function () {
      const result = await this.page.evaluate(() => {
        const btn = document.getElementById("trigger-btn");
        const listener = e => e.preventDefault();
        btn.addEventListener("click", listener, { once: true });
        const evt = new MouseEvent("click", {
          cancelable: true,
          bubbles: true,
        });
        const ret = btn.dispatchEvent(evt);
        return ret;
      });
      assert.isFalse(
        result,
        "dispatchEvent should return false for cancelled event"
      );
    });

    it("dispatchEvent called with a Proxy should throw TypeError", async function () {
      const result = await this.page.evaluate(() => {
        let trapTriggered = false;
        const proxy = new Proxy(
          { type: "click" },
          {
            get(target, prop) {
              trapTriggered = true;
              return Reflect.get(target, prop);
            },
          }
        );

        try {
          document.dispatchEvent(proxy);
          return { trapped: trapTriggered, errorName: null };
        } catch (e) {
          return { trapped: trapTriggered, errorName: e.name };
        }
      });

      assert.isFalse(
        result.trapped,
        "Should not access 'type' property on a Proxy"
      );
      assert.equal(
        result.errorName,
        "TypeError",
        "Should throw native TypeError"
      );
    });

    it("dispatchEvent called with a plain object with getters should throw TypeError", async function () {
      const result = await this.page.evaluate(() => {
        let getterAccessed = false;
        const obj = {
          get type() {
            getterAccessed = true;
            return "click";
          },
        };

        try {
          document.dispatchEvent(obj);
          return { accessed: getterAccessed, errorName: null };
        } catch (e) {
          return { accessed: getterAccessed, errorName: e.name };
        }
      });

      assert.isFalse(result.accessed, "Should not access getters");
      assert.equal(
        result.errorName,
        "TypeError",
        "Should throw native TypeError"
      );
    });

    it("dispatchEvent called with a revoked proxy should throw TypeError", async function () {
      const result = await this.page.evaluate(() => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();

        try {
          document.dispatchEvent(proxy);
          return { status: "" };
        } catch (e) {
          return { status: "error", name: e.name, message: e.message };
        }
      });

      assert.equal(
        result.status,
        "error",
        "Should throw error on revoked proxy"
      );
      assert.equal(result.name, "TypeError", "Should throw TypeError");
      assert.include(
        result.message,
        "does not implement interface Event",
        "Error message should come from native"
      );
    });
  });
}
