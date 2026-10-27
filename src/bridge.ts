import { AssistantMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, type Component, type TUI } from "@earendil-works/pi-tui";

type Message = Parameters<AssistantMessageComponent["updateContent"]>[0];
type Options = ConstructorParameters<typeof AssistantMessageComponent>;
type NativeAssistant = Component & {
  lastMessage?: Message;
  isStreaming: boolean;
  markdownTheme: Options[2];
  outputPad: number;
  markdownTransformers: NonNullable<Options[5]>;
  contentContainer: Container;
};
export type NativeTool = Component & {
  toolCallId: string;
  toolName: string;
  expanded: boolean;
  setExpanded(expanded: boolean): void;
};
export type Entry = {
  key: object;
  kind: "user" | "thinking" | "tool" | "content";
  component: Component;
  tool?: NativeTool;
};

function isContainer(value: unknown): value is Container {
  return value instanceof Container;
}

export function isTool(value: Component): value is NativeTool {
  const node = value as Partial<NativeTool>;
  return typeof node.toolCallId === "string" && typeof node.toolName === "string"
    && typeof node.expanded === "boolean" && typeof node.setExpanded === "function";
}

/** Split display copies only. Original messages and native mutation targets remain intact. */
export class EntryReader {
  private views = new WeakMap<Component, Map<number, AssistantMessageComponent>>();
  private cache = new WeakMap<Component, { children: Component[]; streaming: boolean; entries: Entry[] }>();

  read(node: Component): Entry[] {
    if (node instanceof UserMessageComponent) return [{ key: node, kind: "user", component: node }];
    if (isTool(node)) return [{ key: node, kind: "tool", component: node, tool: node }];
    if (!(node instanceof AssistantMessageComponent)) return [{ key: node, kind: "content", component: node }];
    // Pi exposes the class but not these fields. Guard this single private boundary.
    const native = node as unknown as NativeAssistant;
    const message = native.lastMessage;
    if (!message || typeof native.isStreaming !== "boolean" || !native.markdownTheme
      || typeof native.outputPad !== "number" || !Array.isArray(native.markdownTransformers)
      || !isContainer(native.contentContainer) || !Array.isArray(message.content)
      || ["error", "aborted", "length"].includes(message.stopReason)
      || message.content.some(part => !["text", "thinking", "toolCall"].includes(part.type))) {
      return [{ key: node, kind: "content", component: node }];
    }
    const previous = this.cache.get(node);
    if (previous?.children === native.contentContainer.children && previous.streaming === native.isStreaming) {
      return previous.entries;
    }
    let views = this.views.get(node);
    if (!views) this.views.set(node, views = new Map());
    const entries = message.content.flatMap((part, index): Entry[] => {
      if (part.type === "toolCall") return [];
      if (!(part.type === "thinking" ? part.thinking : part.text).trim()) return [];
      let view = views.get(index);
      if (!view) {
        view = new AssistantMessageComponent(undefined, false, native.markdownTheme, undefined,
          native.outputPad, native.markdownTransformers);
        views.set(index, view);
      }
      view.setHideThinkingBlock(false);
      view.updateContent({ ...message, content: [part] }, native.isStreaming);
      return [{ key: view, kind: part.type === "thinking" ? "thinking" : "content", component: view }];
    });
    this.cache.set(node, { children: native.contentContainer.children, streaming: native.isStreaming, entries });
    return entries;
  }
}

const OWNER = Symbol.for("zydtiger.pi-auto-fold.projection");
export interface Projection extends Component { dispose(): void }

/** Pi 1.4 mounts [header, resources, chat] in its document container. */
export function mount(tui: TUI, create: (read: () => Entry[]) => Projection): (() => void) | undefined {
  if (tui.mode !== "fullscreen") return undefined;
  const roots: unknown = Reflect.get(tui, "children");
  const document: unknown = Array.isArray(roots) ? roots[0] : undefined;
  if (!isContainer(document) || document.children.length !== 3
    || !document.children.every(isContainer) || Reflect.get(document, OWNER)) return undefined;
  const source = document.children[2] as Container;
  const reader = new EntryReader();
  const projection = create(() => source.children.flatMap(child => reader.read(child)));
  const children: Component[] = document.children;
  children[2] = projection;
  Reflect.set(document, OWNER, projection);
  tui.requestRender();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (document.children[2] === projection) document.children[2] = source;
    if (Reflect.get(document, OWNER) === projection) Reflect.deleteProperty(document, OWNER);
    projection.dispose();
    tui.requestRender();
  };
}
