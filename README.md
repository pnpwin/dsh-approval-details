# Tool approval details for DeepSeek Harness

An independent, unofficial plugin that makes it clear what you are approving. Every tool approval card identifies the requested tool. Bash/PowerShell commands and `terminal_send` input appear in a selectable code block with all whitespace and line breaks preserved. Nested PTC calls are matched by their own call ID, not the outer transport's arguments. The localized Auto review reason stays visible.

The standard DSH approval card still owns Allow once, Reject, cancellation and keyboard handling. This plugin does not change authorization policy, execute tools, grant permissions, or write Session events. It applies to all sessions in the current profile and can be disabled under Plugins.

## Install from GitHub

Ask the Harness agent to install the bundle with the `plugin_manager` tool:

```json
{"action":"install_bundle","target":"github:pnpwin/dsh-approval-details#v1.0.0"}
```

There are no install scripts, runtime npm dependencies or post-install build requirements. DSH loads the native JavaScript modules directly from `src/`. React comes from the host application. English, Russian and Chinese inventory metadata and an original SVG icon are included. The approval headline supports all eight built-in DSH locales.

## Limitations

If the correlated call is not loaded, still preparing, settled, or has invalid arguments, its tool name remains visible and no unrelated command is shown. Terminal operations that send no text (open/read/close/signal) show their tool name rather than a fabricated shell command. The command lookup uses DSH's active-call projection; it never scans the complete Session log or Chat history.

## Repository layout

- `src/`: all implementation and build code; the icon is in `src/assets/`.
- `tests/`: behavior tests and expected presentation output; keep this directory in place.
- `locale/`: localized inventory metadata; keep this directory in place.
- Root files: documentation, license, upstream attribution, package/lock metadata, the DSH discovery patch and ignore rules only. Never add implementation or build scripts to the root.

This layout is an explicit maintainer requirement. Preserve it for future changes. The build checks the root-file rule automatically.

## Development

Use Node.js 22 or newer and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm pack --out artifacts/dsh-approval-details-1.0.0.tgz
```

The build validates the already-native Host/Client modules, module identity, exports, package resources and root layout. It does not emit duplicate JavaScript or loose build artifacts. Tests use the package-local React development dependency and do not depend on an adjacent DSH checkout.

To test a packed bundle, extract it into an owned temporary directory, install its development dependencies with scripts disabled, and run `node --test` against this checkout's tests with `DSH_APPROVAL_PACKAGE_ROOT` set to the extracted package path.

## License

MIT. See [LICENSE](LICENSE) and [UPSTREAM.md](UPSTREAM.md).
