// Optional dependencies of the interactive terminal (optionalDependencies): loaded with a dynamic import() and used
// only through local types (manager.ts, screen.ts). Declared here so the typecheck doesn't need them installed.
declare module 'node-pty';
declare module '@xterm/headless';
declare module '@xterm/addon-serialize';
