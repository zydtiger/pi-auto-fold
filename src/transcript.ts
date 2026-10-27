import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion, Spacer, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { Entry, Projection } from "./bridge.ts";

class Activity extends Container {
  entries: Entry[] = [];
  active = false;
  expanded = false;
  initialized = false;
  started = 0;
  elapsed = 0;

  constructor(private theme: Theme, private redraw: () => void, private now: () => number) {
    super();
  }

  update(entries: Entry[], active: boolean): void {
    if (!this.initialized || active !== this.active) {
      this.expanded = active;
      if (active) this.started = this.now();
      else if (this.active) this.elapsed += this.now() - this.started;
    }
    this.initialized = true;
    this.entries = entries;
    this.active = active;
  }

  toggle(): void { this.expanded = !this.expanded; this.redraw(); }

  override render(width: number): string[] {
    const thoughts = this.entries.filter(e => e.kind === "thinking").length;
    const tools = this.entries.filter(e => e.kind === "tool").length;
    const time = this.active ? this.elapsed + this.now() - this.started : this.elapsed;
    const duration = time > 0 ? ` · ${(time / 1000).toFixed(1)}s` : "";
    const label = `${this.expanded ? "▾" : "▸"} ${this.active ? "Working" : "Worked"}${duration} · ${thoughts} thinking · ${tools} tools`;
    const header: Component = {
      render: w => [this.theme.fg("muted", truncateToWidth(label, w))],
      invalidate() {},
    };
    this.children = [new Spacer(1), new MouseRegion(header, event => {
      if (event.type === "click" && event.button === "left") {
        this.toggle();
        return { handled: true };
      }
      return undefined;
    }), ...this.entries.filter(e => this.expanded || (e.kind !== "thinking" && e.kind !== "tool"))
      .map(e => e.component)];
    return super.render(width);
  }
}

/** Per-prompt groups retain their own disclosure state when another prompt starts. */
export class Transcript extends Container implements Projection {
  private groups = new Map<object, Activity>();
  private running = false;
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(private read: () => Entry[], private theme: Theme,
    private redraw: () => void, private now: () => number = Date.now) { super(); }

  begin(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.timer = setInterval(this.redraw, 1000);
    this.timer.unref?.();
    this.redraw();
  }

  finish(): void {
    if (this.disposed) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = undefined;
    // Commit transition even if the next prompt arrives before a render frame.
    for (const group of this.groups.values()) if (group.active) group.update(group.entries, false);
    this.redraw();
  }

  toggleLatest(): void { [...this.groups.values()].at(-1)?.toggle(); }

  override render(width: number): string[] {
    const entries = this.read();
    const latestUser = entries.findLast(e => e.kind === "user")?.key;
    const retained = new Set<object>();
    const children: Component[] = [];
    let key: object = this;
    let body: Entry[] = [];
    const flush = () => {
      if (!body.length) return;
      if (!body.some(e => e.kind === "thinking" || e.kind === "tool")) {
        children.push(...body.map(e => e.component));
        body = [];
        return;
      }
      let group = this.groups.get(key);
      if (!group) this.groups.set(key, group = new Activity(this.theme, this.redraw, this.now));
      group.update(body, this.running && key === (latestUser ?? this));
      retained.add(key);
      children.push(group);
      body = [];
    };
    for (const entry of entries) {
      if (entry.kind === "user") {
        flush();
        key = entry.key;
        children.push(entry.component);
      } else body.push(entry);
    }
    flush();
    for (const key of this.groups.keys()) if (!retained.has(key)) this.groups.delete(key);
    this.children = children;
    return super.render(width);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.groups.clear();
  }
}
