import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

import {
  install,
  resolveBuildId,
  detectBrowserPlatform,
  Browser,
} from "@puppeteer/browsers";

const __dirname = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = path.join(__dirname, ".cache", "puppeteer");

export function getTestUrl(filename) {
  return `file://${path.join(__dirname, "/tests/", filename)}`;
}

export async function launchFirefox({ extension = false } = {}) {
  const platform = detectBrowserPlatform();

  const buildId = await resolveBuildId(Browser.FIREFOX, platform, "nightly");

  const installedBrowser = await install({
    browser: Browser.FIREFOX,
    buildId,
    cacheDir,
    platform,
    unpack: true,
  });

  const browser = await puppeteer.launch({
    browser: "firefox",
    headless: false,
    executablePath: installedBrowser.executablePath,
    userDataDir: path.join(cacheDir, "profile"),
    args: ["--width=1280", "--height=1024", "--new-instance"],
    ignoreHTTPSErrors: true,
    extraPrefsFirefox: {
      "widget.disable_file_pickers": true,
      "full-screen-api.ignore-widgets": true,
    },
  });

  if (extension) {
    await browser.connection.send("webExtension.install", {
      extensionData: { type: "path", path: __dirname },
    });
  }

  return browser;
}

export async function consumeTransientUserActivation(page) {
  await page.evaluate(async () => {
    if (navigator.userActivation.isActive) {
      await document.body.requestFullscreen();
      await document.exitFullscreen();
    }
  });
}

export async function grantTransientUserActivation(page) {
  await page.keyboard.down("Alt");
  await page.keyboard.press("Quote");
  await page.keyboard.up("Alt");
}

export async function writeImageToClipboard(page) {
  await grantTransientUserActivation(page);
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(100, 100);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 100, 100);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });
  await consumeTransientUserActivation(page);
}

export async function clearClipboard(page) {
  await grantTransientUserActivation(page);
  await page.evaluate(async () => {
    await navigator.clipboard.writeText("");
    return true;
  });
  await consumeTransientUserActivation(page);
}
