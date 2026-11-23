import { readFile, writeFile } from 'node:fs/promises';
import { applications } from './adapters/matrix.mjs';

const directory = new URL('../results/', import.meta.url);
const firstApp = 'google-ai-studio/notes-plain';
const results = await Promise.all([firstApp, ...applications.map(app => app.id)].map(async application => {
  const name = application === firstApp ? 'google-notes-plain' : application.replace('/', '-');
  try {
    const result = JSON.parse(await readFile(new URL(name + '.json', directory), 'utf8'));
    return { ...result, name };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { application, name, blocker: 'No result available' };
  }
}));

const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const line = fields => '| ' + fields.map(cell).join(' | ') + ' |';
const markdown = [
  '# SOEN 321 security evaluation',
  '',
  'The tables count individual checks. A failed expectation is classified by its evidence. Skipped checks are counted separately. Runtime findings are based on disposable local instances. Source findings describe the checked-in application.',
  '',
  '## Methodology',
  '',
  'The automated checks retain the manual evidence families. T01 covers access control, including authentication and owner workflows. T02 covers SQL injection controls. T03 covers XSS and output handling. T04 covers hardcoded secrets and session security. T05 covers password storage. T06 covers sensitive information exposure. Suffixes identify individual automated checks.',
  '',
  '- **Source inspection** examines the checked-in implementation for controls and observable defects. A confirmed source finding has direct code evidence, such as a literal signing fallback.',
  '- **Runtime checks** use disposable local instances with temporary accounts and databases. They compare observed responses or state changes with the expected behavior. A confirmed runtime vulnerability requires an observed security impact, such as unauthorized disclosure or mutation.',
  '- **Suspected vulnerabilities** have a source or runtime signal with incomplete evidence of security impact. Functional failures record a behavior mismatch without established security impact. Kiro Booking Plain logout is a functional failure because the response omitted the cookie-clearing header.',
  '- **Untested conditions** are checks that were skipped or outside the exercised scope, with reasons recorded. They are excluded from pass counts.',
  '',
  'Manual evidence — [Google AI Studio Notes Plain](../google-ai-studio/notes-plain/security-evidence) and [Kiro Notes Plain](../kiro/notes-plain/evidence).',
  '',
  '## Results summary',
  '',
  '| Application | Pass | Fail | Skip | Confirmed in source | Confirmed at runtime | Suspected | Functional failures | Runtime coverage |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---|',
];

for (const result of results) {
  const tests = result.tests;
  const count = (field, value) => tests?.filter(check => check[field] === value).length ?? '—';
  const confirmed = mode => tests?.filter(check =>
    check.assessment === 'Confirmed security vulnerability' && (check.mode ?? 'source') === mode).length ?? '—';
  markdown.push(line([
    result.application, ...['Pass', 'Fail', 'Skip'].map(status => count('status', status)),
    confirmed('source'), confirmed('runtime'),
    ...['Suspected vulnerability', 'Functional failure'].map(value => count('assessment', value)),
    result.blocker || 'Local fixture run completed',
  ]));
}

for (const result of results) {
  if (!result.tests) continue;
  markdown.push('', '## ' + result.application, '');
  if (result.blocker) markdown.push('Runtime prerequisite issue. ' + result.blocker, '');
  if (result.node) markdown.push('Node ' + result.node + ' on ' + result.platform + '/' + result.architecture + '.');
  const installer = result.installer ?? (result.bun && 'Bun ' + result.bun);
  if (installer) markdown.push('Installer version ' + installer + '. Dependency lock mode was ' + result.lockMode + '.');
  if (result.dependencies) markdown.push('Runtime packages — ' + Object.entries(result.dependencies)
    .map(([name, version]) => name + ' ' + version).join(', ') + '.');

  markdown.push('', '[Machine-readable results](' + result.name + '.json)', '',
    '| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |',
    '|---|---|---|---|---|---|---|');
  for (const check of result.tests) {
    const mode = check.mode ?? (check.id === 'T04.secret' ? 'source' : check.status === 'Skip' ? 'untested' : 'runtime');
    const refs = check.evidence.split('; ').map(ref => {
      const [file, locations] = ref.split(':');
      return locations.split(',').map(location =>
        '[' + file + ':' + location + '](../' + result.application + '/' + file + '#L' + location + ')').join(', ');
    }).join(', ');
    markdown.push(line([check.id, check.expected, check.actual, check.status, check.assessment, mode, refs]));
  }
}

markdown.push('', '## Coverage limits', '',
  '- Runtime SQL injection and script execution were outside scope. Literal punctuation, inert Markdown markup, and EJS escaping checks cover their stated input and rendering paths.',
  '- Cookie results describe response attributes in the harness. Browser cross-site behavior, TLS termination, fixation, credential replay, and expiry were outside the run.',
  '- Notes tests exercise owner CRUD and second-account access. Booking tests exercise the available list, create, and cancel operations and the ordinary-user boundary for admin slot creation. Form-based profile inspection has no JSON profile endpoint.',
  '- Literal source defaults are reported independently of runtime configuration. The harness generates temporary secrets and does not log their values.',
  '',
  'See [execution instructions and adapter details](../tests/README.md).', '');
await writeFile(new URL('comparison.md', directory), markdown.join('\n'));
