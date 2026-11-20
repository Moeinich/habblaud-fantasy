// Machine tokens for HABBLAUD_INGEST (other machines sending their sessions to this server). Runs on the SERVER:
//
//   npm run ingest:token -- add <name> [--label "Anna's Mac"]   creates (or replaces) the token and prints it ONCE
//   npm run ingest:token -- remove <name>                       revokes it (its agents leave the office within seconds)
//   npm run ingest:token -- list                                the machines (never the tokens)
//
// Only the SHA-256 of each token is stored, in <HABBLAUD_DATA_DIR or ~/.habblaud>/ingest-machines.json (mode 600).
// The running server picks up changes by itself. In Docker, run it inside the container:
// `docker compose exec habblaud node dist/server/ingest-token.js add <name>` (the image only has dist/).
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MACHINES_FILE, MachineStore } from '../server/ingest/machines';
import { tr } from '../shared/i18n';

const USAGE = tr(
  'Uso: npm run ingest:token -- <add|remove|list> [nome] [--label "Nome exibido"]\n\n  add <nome>      cria (ou troca) o token da máquina e mostra uma única vez\n  remove <nome>   revoga o token da máquina\n  list            lista as máquinas (nunca os tokens)\n\nO nome: letras minúsculas, números e hífens (ex.: mac-anna). Os tokens ficam só como hash em\n<HABBLAUD_DATA_DIR ou ~/.habblaud>/ingest-machines.json.',
);

export function machinesFile(env: NodeJS.ProcessEnv): string {
  return join(resolve(env.HABBLAUD_DATA_DIR?.trim() || join(env.HOME || homedir(), '.habblaud')), MACHINES_FILE);
}

export function run(argv: string[], env: NodeJS.ProcessEnv, out: (l: string) => void): number {
  const [command, name, ...rest] = argv;
  const store = new MachineStore(machinesFile(env));
  if (command === 'list') {
    const list = store.machines();
    if (!list.length) out(tr('Nenhuma máquina ainda. Crie uma com: npm run ingest:token -- add <nome>'));
    for (const m of list) out(`${m.id}${m.name !== m.id ? ` (${m.name})` : ''}  ${new Date(m.createdAt).toISOString()}`);
    return 0;
  }
  if ((command === 'add' || command === 'remove') && name) {
    if (command === 'remove') {
      out(store.remove(name) ? tr('Token de "{0}" revogado.', [name]) : tr('Nenhuma máquina "{0}".', [name]));
      return 0;
    }
    const i = rest.indexOf('--label');
    const label = i >= 0 ? rest[i + 1] : undefined;
    try {
      const token = store.add(name, label);
      out(tr('Token da máquina "{0}" (aparece só agora; guarde-o e use no npm run remote:install da máquina):', [name]));
      out('');
      out(`  ${token}`);
      out('');
      return 0;
    } catch (err) {
      out((err as Error).message);
      return 1;
    }
  }
  out(USAGE);
  return command === '-h' || command === '--help' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2), process.env, (l) => console.log(l));
}
