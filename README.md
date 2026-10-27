# pi-auto-fold

Watch thinking and your configured tool display while Pi works. Once the prompt finishes,
fold that activity into a clickable summary and keep assistant text visible.

```text
Your prompt
▸ Worked · 12.4s · 3 thinking · 5 tools
Final answer

Next prompt
▾ Working · 2.1s · 1 thinking · 2 tools
  Live thinking and tool output…
```

## Install

Requires Pi 1.4.0 and fullscreen mode (`"tuiMode": "fullscreen"`, Pi's default).

```sh
pi install git:github.com/zydtiger/pi-auto-fold
```

Run `/reload` in an existing Pi session. Click an activity header or run
`/activity` to toggle the latest prompt. Previous prompts retain their own fold
state. Resumed history starts collapsed. A working group automatically folds
when its prompt finishes, including if you opened it manually while working.

## Behavior

- Live activity opens automatically and shows full thinking. Tools keep their
  original renderers and expansion state, including your `pi-tool-display`
  preset (such as `balanced`). Reopening completed activity does the same.
- Automatic retries and tool/model loops stay expanded until `agent_settled`.
  A new user message starts a new group, including queued prompts and steering.
- Thinking and tool rows fold together. Assistant prose, errors, compaction
  notices, and unknown components remain visible. Failed tool results are
  available by expanding the activity group.
- No session messages, provider context, or tool expansion settings are changed.
  Unloading restores the native transcript.
- The guarded bridge targets Pi 1.4's private document layout. Unsupported
  layouts keep Pi's native display and show a warning. Regular scrollback,
  print, and RPC modes are not modified. Use one transcript projection plugin
  at a time; do not combine with `pi-collapse-transcript`.

The timer measures time observed in the current session; historical groups
have counts but no reconstructed duration. Ctrl+O and Ctrl+T remain native
Pi controls; this plugin uses its own group disclosure, shows full thinking,
and leaves tool presentation to Pi and your renderer extensions.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm run check
prek install
prek run --all-files
prek run --all-files --hook-stage pre-push
```

Tests use real Pi assistant, user, tool, and mouse components without making
model requests. No build step or installation scripts are required.

## License

MIT. Inspired by the activity grouping interaction in
[pi-collapse-transcript](https://github.com/luan/agents/tree/main/harnesses/pi/agent/packages/pi-collapse-transcript).
This package implements its own bridge and uses Pi's native UI components.
