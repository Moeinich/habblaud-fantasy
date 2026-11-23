// The client app: store (data) -> world (canvas) -> UI (panels). Loaded by main.ts after the active language's
// dictionary, because several modules call tr() when they load.
import { loadAccess } from './net/access';
import { OfficeStore } from './net/store';
import { createWorld } from './world';
import { createUI } from './ui';
import { migrateLegacyKeys, safeLocalStorage } from './ui/prefs';
import { getLocale, tr } from '../../shared/i18n';

export function start(): void {
  // Before anything else: the world (wallets) and the UI (preferences) read localStorage when they are created.
  migrateLegacyKeys(safeLocalStorage());

  // Chosen language (shared/i18n): screen readers and the browser spellchecker follow the lang attribute.
  document.documentElement.lang = getLocale();
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    tr('Pixel-art virtual office that shows, in real time, what your Claude Code agents are doing.'),
  );

  const params = new URLSearchParams(location.search);
  const store = new OfficeStore({ mock: params.has('mock') });
  const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const world = createWorld(worldCanvas, store);
  createUI(uiRoot, store, world);
  // What this page may do (local port, or remote with login) arrives before the first snapshot (or gives up after a
  // few seconds and the previous rule stays).
  if (store.mock) store.connect();
  else {
    void loadAccess().finally(() => store.connect());
    // Reconnection (server restarted, phone back from the lock screen): access may have changed, and the login may
    // have expired (loadAccess goes to the sign-in screen).
    let opened = false;
    store.on('connection', (state) => {
      if (state === 'open') {
        if (opened) void loadAccess();
        opened = true;
      } else if (state === 'closed' && opened) void loadAccess();
    });
  }

  // Makes debugging from the browser console easier.
  Object.assign(window, { habblaud: { store, world } });
}
