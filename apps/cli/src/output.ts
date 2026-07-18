import kleur from 'kleur';

export const out = {
  header: (msg: string): void => console.log(kleur.bold(msg)),
  ok: (msg: string): void => console.log(kleur.green('✓') + ' ' + msg),
  warn: (msg: string): void => console.log(kleur.yellow('!') + ' ' + msg),
  err: (msg: string): void => console.error(kleur.red('✗') + ' ' + msg),
  info: (msg: string): void => console.log('  ' + msg),
  dim: (msg: string): void => console.log(kleur.dim('  ' + msg)),
};
