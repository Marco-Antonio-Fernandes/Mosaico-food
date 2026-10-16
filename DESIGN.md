# Existing application design

The source of visual truth is `apps/desktop/src/styles.css` and the components in `components/shared`. Preserve the current product theme using `--proto-canvas`, `--proto-panel`, `--proto-ink`, `--proto-muted`, `--proto-line`, `--proto-accent` and `--proto-accent-soft`. Do not introduce a new palette for cash.

Use the existing sans-serif typography, `Panel`, `Tabs`, shared loading/error states and table/button vocabulary. Money uses tabular numerals and Brazilian currency formatting. Forms use visible labels and inline feedback. Lay out the session statement next to operational controls on wide screens, then stack them on narrow screens. Tables may scroll within their own container.
