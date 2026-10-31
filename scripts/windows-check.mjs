// Tries the Windows build on a GitHub Windows machine (.github/workflows/
// windows.yml), since no Mac can: installs it, opens it, goes through the
// main screens and takes a picture of the whole screen after each, into
// windows-check/. The pictures, not this script, are the check: it fails only
// if Fokus does not install or open.
//
// Fokus is driven through its web view's debugging port with Playwright,
// which the workflow installs. The port is asked for by the copy the workflow
// builds for this (additionalBrowserArgs), never by the real one. The screen
// is taken by PowerShell, so the title bar, the taskbar and the floating
// windows are in it too.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = "windows-check";
const PORT = 9222;
mkdirSync(OUT, { recursive: true });
const log = [];
const note = (line) => {
  console.log(line);
  log.push(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Whatever happens, the log goes up with the pictures.
process.on("exit", () => writeFileSync(join(OUT, "log.txt"), log.join("\n") + "\n"));

function powershell(script) {
  return execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
  });
}

let shots = 0;
function shoot(name) {
  const path = join(process.cwd(), OUT, `${String(++shots).padStart(2, "0")}-${name}.png`);
  powershell(`
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save('${path}')
  `);
  note(`shot ${path}`);
}

// A screen the size of a laptop's, if this Windows lets us.
try {
  powershell("Set-DisplayResolution -Width 1600 -Height 900 -Force");
} catch {
  note("could not set the screen size; keeping the runner's");
}
note(powershell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | Out-String").trim());

// Install it, as she would, with no questions (NSIS's /S).
const bundle = "src-tauri/target/release/bundle/nsis";
const setup = readdirSync(bundle).find((f) => f.endsWith("-setup.exe"));
if (!setup) throw new Error(`no installer in ${bundle}`);
note(`installing ${setup}`);
execFileSync(join(bundle, setup), ["/S"], { stdio: "inherit" });
const home = join(process.env.LOCALAPPDATA, "Fokus");
const exe = readdirSync(home).find((f) => f.toLowerCase().endsWith(".exe") && !/uninstall/i.test(f));
if (!exe) throw new Error(`nothing to run in ${home}: ${readdirSync(home).join(", ")}`);
note(`installed: ${join(home, exe)}`);

// Its output is piped: a Windows app has no console, but a panic still
// writes to the handles it was given.
const app = spawn(join(home, exe), [], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, RUST_BACKTRACE: "1" },
});
app.stdout.on("data", (d) => note(`fokus: ${String(d).trim()}`));
app.stderr.on("data", (d) => note(`fokus (err): ${String(d).trim()}`));
app.on("exit", (code) => note(`fokus exited with ${code}`));

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf8" }).trim();
  } catch (error) {
    return `(${file} ${args.join(" ")}: ${error.message.split("\n")[0]})`;
  }
}

let browser;
for (let i = 0; i < 60 && !browser; i++) {
  await sleep(1000);
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    if (i % 15 === 14) note(`no web view yet: ${error.message.split("\n")[0]}`);
  }
}
if (!browser) {
  shoot("no-web-view");
  note(run("tasklist", ["/FI", "IMAGENAME eq fokus.exe"]));
  note(run("tasklist", ["/FI", "IMAGENAME eq msedgewebview2.exe"]));
  note(run("netstat", ["-ano", "-p", "TCP"]).split("\n").filter((line) => line.includes(":9222")).join("\n") || "nothing on 9222");
  note(
    powershell(
      "Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty pv",
    ).trim() || "no WebView2 runtime in the registry",
  );
  throw new Error("Fokus did not open (no web view on the debugging port)");
}

// Every Fokus window is a page of the same app, known by its Tauri label;
// WebView2 keeps an about:blank of its own beside them.
async function mainPage() {
  for (let i = 0; i < 20; i++) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const label = await page
          .evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? null)
          .catch(() => null);
        if (i === 0) note(`page ${page.url()}: ${label}`);
        if (label === "main") return page;
      }
    }
    await sleep(500);
  }
  throw new Error("no main window");
}
let page = await mainPage();
page.on("console", (m) => m.type() === "error" && note(`console: ${m.text()}`));
page.on("pageerror", (e) => note(`page error: ${e.message}`));
note(`main page: ${page.url()}, os: ${await page.evaluate(() => document.documentElement.dataset.os)}`);
await sleep(2500);
shoot("first-launch");

// One step failing should not cost the pictures after it: each is tried,
// pictured either way, and the run fails at the end if any did.
let failed = 0;
async function step(name, action) {
  try {
    await action();
  } catch (error) {
    failed++;
    note(`${name} failed: ${error.message.split("\n")[0]}`);
  }
  shoot(name);
}

// Past the guide, and a few tasks in, as she would: typed. (A reload over
// the debugging port never says it has loaded in WebView2.)
await step("focus", async () => {
  await page.locator(".guide__skip").click();
  await sleep(600);
  const add = page.getByPlaceholder("Add a task…");
  for (const title of ["Draft the newsletter", "Reply to Ana about the shoot", "Sketch the spring palette"]) {
    await add.fill(title);
    await add.press("Enter");
    await sleep(300);
  }
  await page.locator(".task__main", { hasText: "Draft the newsletter" }).click();
  await sleep(1200);
});

await step("running", async () => {
  await page.locator("button", { hasText: "Start" }).first().click();
  await sleep(3000);
});

await step("settings", async () => {
  await page.click('.nav > button[data-nav="settings"]');
  await sleep(800);
});

await step("settings-rose", async () => {
  await page.locator('[role="radio"]', { hasText: "Rose" }).first().click();
  await sleep(1200);
});

await step("mini-timer", async () => {
  await page.locator('[role="radio"]', { hasText: "Lavender" }).first().click();
  await page.getByRole("button", { name: /Mini timer/ }).first().click();
  await sleep(3000);
});

// The end-of-phase card, as the timer sends it, and the chime with it.
await step("card", async () => {
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("show_alert", {
      notice: { ended: "focus", next: "short", minutes: 5, started: false, task: "Reply to Ana about the shoot" },
    }),
  );
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("ring", { sound: "chime", volume: 0.6 }));
  await sleep(2500);
});

// Closing the window only hides it: Fokus stays by the clock. Closed as its
// X button would: WM_CLOSE to the biggest visible window titled Fokus (the
// mini timer and the card are titled so too).
await step("closed", async () => {
  powershell(`
    Add-Type @"
  using System; using System.Runtime.InteropServices; using System.Text;
  public class W {
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    public struct RECT { public int L, T, R, B; }
  }
"@
    $found = @{ h = [IntPtr]::Zero; a = 0 }
    [void][W]::EnumWindows({ param($h, $p)
      $sb = New-Object System.Text.StringBuilder 64
      [void][W]::GetWindowText($h, $sb, 64)
      if ($sb.ToString() -eq "Fokus" -and [W]::IsWindowVisible($h)) {
        $r = New-Object W+RECT
        [void][W]::GetWindowRect($h, [ref]$r)
        $a = ($r.R - $r.L) * ($r.B - $r.T)
        if ($a -gt $found.a) { $found.a = $a; $found.h = $h }
      }
      $true
    }, [IntPtr]::Zero)
    [void][W]::PostMessage($found.h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  `);
  await sleep(1500);
  note(`still running after close: ${await page.evaluate(() => true).catch(() => false)}`);
});

await browser.close().catch(() => {});
try {
  execFileSync("taskkill", ["/IM", exe, "/F"]);
} catch {}
console.log(existsSync(OUT) ? "done" : "no pictures");
if (failed) {
  console.error(`${failed} step(s) failed: see log.txt`);
  process.exit(1);
}
