import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantMessageComponent, getMarkdownTheme, initTheme, ToolExecutionComponent,
  UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, stripTerminalSequences, Text, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { EntryReader, mount } from "../src/bridge.ts";
import { Transcript } from "../src/transcript.ts";

initTheme("dark", false);
const stripAnsi = stripTerminalSequences;
const fakeTui = () => Object.assign(new Container(), { mode: "fullscreen", requestRender() {} }) as unknown as TUI;
const message = (thinking: string, text: string, stopReason = "stop") => ({
  role: "assistant", content: [{ type: "thinking", thinking }, { type: "text", text }],
  api: "openai-completions", provider: "test", model: "test", timestamp: 1, stopReason,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
}) as Parameters<AssistantMessageComponent["updateContent"]>[0];
const output = (view: Container, width = 100) => view.render(width).map(stripAnsi).join("\n");

function setup() {
  const source = new Container();
  const reader = new EntryReader();
  let clock = 100;
  const transcript = new Transcript(() => source.children.flatMap(c => reader.read(c)), theme, () => {}, () => clock);
  const user = new UserMessageComponent("first prompt", getMarkdownTheme());
  const assistant = new AssistantMessageComponent(message("secret reasoning", "final answer"));
  const tool = new ToolExecutionComponent("bash", "call-1", { command: "echo test" }, undefined, undefined,
    fakeTui(), process.cwd());
  tool.markExecutionStarted();
  tool.updateResult({ content: [{ type: "text", text: Array.from({ length: 30 }, (_, i) => `tool row ${i}`).join("\n") }], isError: false });
  source.children = [user, tool, assistant];
  return { source, assistant, tool, transcript, tick: () => { clock += 1400; } };
}

test("live activity is expanded, settles to one disclosure, text and message data survive", () => {
  const s = setup();
  const original = JSON.stringify(Reflect.get(s.assistant, "lastMessage"));
  s.transcript.begin();
  const live = output(s.transcript);
  assert.match(live, /secret reasoning/);
  assert.match(live, /tool row 29/);
  s.tick();
  s.transcript.finish();
  const done = output(s.transcript);
  assert.doesNotMatch(done, /secret reasoning|tool row/);
  assert.match(done, /final answer/);
  assert.match(done, /Worked · 1.4s · 1 thinking · 1 tools/);
  assert.equal(JSON.stringify(Reflect.get(s.assistant, "lastMessage")), original);
  s.transcript.toggleLatest();
  assert.match(output(s.transcript), /tool row 29/);
  s.transcript.dispose();
  assert.equal(Reflect.get(s.tool, "expanded"), false);
});

test("streaming assistant views keep stable identities and refresh content", () => {
  const node = new AssistantMessageComponent();
  const reader = new EntryReader();
  node.updateContent(message("first", ""), true);
  const first = reader.read(node);
  node.updateContent(message("second", "answer"), true);
  const second = reader.read(node);
  assert.equal(first[0].key, second[0].key);
  assert.match(second[0].component.render(60).map(stripAnsi).join("\n"), /second/);
});

test("next prompt leaves previous folds closed and manual history expansion is preserved", () => {
  const s = setup();
  s.transcript.begin(); output(s.transcript); s.transcript.finish(); output(s.transcript);
  s.source.addChild(new UserMessageComponent("second prompt"));
  s.source.addChild(new AssistantMessageComponent(message("new reasoning", "new answer")));
  s.transcript.begin();
  const live = output(s.transcript);
  assert.doesNotMatch(live, /secret reasoning/);
  assert.match(live, /new reasoning/);
  s.transcript.finish(); output(s.transcript);
  s.transcript.toggleLatest();
  s.source.addChild(new UserMessageComponent("third prompt"));
  s.source.addChild(new AssistantMessageComponent(message("third reasoning", "third answer")));
  s.transcript.begin();
  assert.match(output(s.transcript), /new reasoning/);
  s.transcript.dispose();
});

test("retries do not reset user disclosure and queued prompt closes previous activity", () => {
  const s = setup();
  s.transcript.begin(); output(s.transcript);
  s.transcript.toggleLatest(); s.transcript.begin();
  assert.doesNotMatch(output(s.transcript), /secret reasoning/);
  s.source.addChild(new UserMessageComponent("queued prompt"));
  s.source.addChild(new AssistantMessageComponent(message("queued thought", "queued answer")));
  assert.doesNotMatch(output(s.transcript), /secret reasoning/);
  assert.match(output(s.transcript), /queued thought/);
  s.transcript.dispose();
});

test("restored history starts collapsed and errors remain visible", () => {
  const s = setup();
  s.assistant.updateContent({ ...message("diagnostic reasoning", "partial answer", "error"), errorMessage: "provider failed" });
  const done = output(s.transcript);
  assert.match(done, /provider failed/);
  assert.doesNotMatch(done, /tool row/);
  s.transcript.dispose();
});

test("clicking the native disclosure expands and collapses at narrow widths", () => {
  const s = setup();
  output(s.transcript, 35);
  const group = s.transcript.children[1] as Container;
  const event = { type: "click", button: "left", x: 1, y: 1, screenX: 1, screenY: 1, width: 35,
    height: group.render(35).length, shift: false, alt: false, ctrl: false } as const;
  assert.equal(group.handleMouse(event)?.handled, true);
  assert.match(output(s.transcript, 35), /secret reasoning/);
  group.handleMouse({ ...event, height: group.render(35).length });
  assert.doesNotMatch(output(s.transcript, 35), /secret reasoning/);
  s.transcript.dispose();
});

test("bridge restores native display, rejects unsupported layouts and double mounting", () => {
  const tui = fakeTui();
  const document = new Container();
  const source = new Container();
  source.addChild(new Text("original", 0, 0));
  document.children = [new Container(), new Container(), source];
  (tui as unknown as Container).children = [document];
  const create = (read: () => ReturnType<EntryReader["read"]>) => new Transcript(read, theme, () => {});
  const release = mount(tui, create);
  assert.ok(release);
  assert.notEqual(document.children[2], source);
  assert.equal(mount(tui, create), undefined);
  release(); release();
  assert.equal(document.children[2], source);
  assert.equal(mount(Object.assign(fakeTui(), { mode: "regular" }), create), undefined);
  assert.equal(mount(fakeTui(), create), undefined);
});

test("unknown nodes stay visible and disappearing tools restore expansion", () => {
  const s = setup();
  s.source.addChild(new Text("unknown notice", 0, 0));
  s.transcript.begin(); assert.match(output(s.transcript), /unknown notice/);
  s.source.children = [];
  output(s.transcript);
  assert.equal(Reflect.get(s.tool, "expanded"), false);
  s.transcript.dispose();
});
