import assert from "node:assert/strict";
import { test } from "node:test";
import { Container, Text } from "@earendil-works/pi-tui";
import { AssistantMessageComponent, getMarkdownTheme, initTheme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import autoFold from "../src/extension.ts";

initTheme("dark", false);

test("extension mounts, handles run lifecycle, toggles and fully releases on reload", async () => {
  const handlers = new Map<string, Function>();
  let command: Function;
  autoFold({
    on: (event: string, handler: Function) => handlers.set(event, handler),
    registerCommand: (_name: string, definition: { handler: Function }) => { command = definition.handler; },
  } as never);
  const source = new Container();
  source.children = [new UserMessageComponent("test", getMarkdownTheme()), new Text("notice", 0, 0)];
  const assistant = new AssistantMessageComponent();
  assistant.updateContent({ role: "assistant", content: [{ type: "thinking", thinking: "reasoning" },
    { type: "text", text: "answer" }], stopReason: "stop" } as never);
  source.addChild(assistant);
  const document = new Container();
  document.children = [new Container(), new Container(), source];
  const tui = Object.assign(new Container(), { mode: "fullscreen", requestRender() {} });
  tui.children = [document];
  let widget: { dispose(): void } | undefined;
  const ctx = { mode: "tui", hasUI: true, isIdle: () => true, ui: {
    notify: () => assert.fail("Unexpected warning"),
    setWidget: (_name: string, factory: Function | undefined) => {
      widget?.dispose();
      widget = factory?.(tui, theme);
    },
  } };
  handlers.get("session_start")!({}, ctx);
  const projection = document.children[2];
  assert.notEqual(projection, source);
  handlers.get("agent_start")!({}, ctx);
  assert.match(projection.render(80).join("\n"), /reasoning/);
  // Low-level runs can finish and retry; only agent_settled folds the activity.
  handlers.get("agent_end")?.({}, ctx);
  assert.match(projection.render(80).join("\n"), /reasoning/);
  handlers.get("agent_settled")!({}, ctx);
  assert.doesNotMatch(projection.render(80).join("\n"), /reasoning/);
  assert.match(projection.render(80).join("\n"), /answer/);
  await command!("", ctx);
  assert.match(projection.render(80).join("\n"), /reasoning/);
  handlers.get("session_shutdown")!({}, ctx);
  assert.equal(document.children[2], source);
  handlers.get("session_start")!({}, ctx);
  assert.notEqual(document.children[2], source);
  handlers.get("session_shutdown")!({}, ctx);
  assert.equal(document.children[2], source);
});
