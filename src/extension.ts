import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mount } from "./bridge.ts";
import { Transcript } from "./transcript.ts";

export default function autoFold(pi: ExtensionAPI): void {
  let release: (() => void) | undefined;
  let transcript: Transcript | undefined;
  let working = false;
  pi.on("agent_start", () => { working = true; transcript?.begin(); });
  pi.on("agent_settled", () => { working = false; transcript?.finish(); });
  pi.on("session_start", (_event, ctx) => {
    release?.();
    release = undefined;
    transcript = undefined;
    working = !ctx.isIdle();
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    ctx.ui.setWidget("pi-auto-fold.host", (tui, theme) => {
      release?.();
      const dispose = mount(tui, read => {
        transcript = new Transcript(read, theme, () => tui.requestRender());
        if (working) transcript.begin();
        return transcript;
      });
      release = dispose;
      if (!dispose) ctx.ui.notify("pi-auto-fold needs Pi 1.4 fullscreen layout; native display retained.", "warning");
      return { render: () => [], invalidate() {}, dispose: () => {
        dispose?.();
        if (release === dispose) { release = undefined; transcript = undefined; }
      } };
    });
  });
  pi.on("session_shutdown", (_event, ctx) => {
    release?.();
    release = undefined;
    transcript = undefined;
    working = false;
    if (ctx.hasUI && ctx.mode === "tui") ctx.ui.setWidget("pi-auto-fold.host", undefined);
  });
  pi.registerCommand("activity", {
    description: "Expand or collapse the latest prompt's thinking and tools",
    handler: async (_args, ctx) => {
      if (!transcript) ctx.ui.notify("Activity folding is available in fullscreen TUI mode.", "info");
      else transcript.toggleLatest();
    },
  });
}
