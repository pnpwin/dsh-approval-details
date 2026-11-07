import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

// React is supplied by DSH at runtime and installed locally only for tests.
const require = createRequire(import.meta.url);
const packageRoot = process.env.DSH_APPROVAL_PACKAGE_ROOT
  ? pathToFileURL(resolve(process.env.DSH_APPROVAL_PACKAGE_ROOT) + sep)
  : new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));
const source = readFileSync(new URL(manifest.exports['./client'], packageRoot), 'utf8');

function fixture(active = 'ru', locales = [{ id: 'ru', fallback: 'en' }, { id: 'en' }]) {
  let module;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { module = value; } } } });
  assert.equal(module.id, '@pnpwin/dsh-approval-details');
  const plugin = module.factory(require);
  const registrations = new Map();
  const cleanups = [];
  let dictionaries;
  const ctx = {
    effect(callback) { cleanups.push(callback()); },
    locale: {
      register(namespace, value) {
        assert.equal(namespace, 'pnpwin-approval-details');
        dictionaries = value;
        return () => { dictionaries = undefined; };
      },
      getLocale: () => ({ active, locales }),
    },
    slots: {
      inject(name, callback) {
        // The production Slots service owns this effect and waits for declarations.
        const cleanup = callback();
        cleanups.push(cleanup);
        return cleanup;
      },
      register(options, component) {
        registrations.set(options.name, { options, component });
        return () => { registrations.delete(options.name); };
      },
    },
  };
  plugin.apply(ctx);
  const panel = registrations.get('conversation.composer');
  const detail = registrations.get('conversation.approval.detail');
  return {
    plugin,
    registrations,
    panel,
    detail,
    dispose() { for (const cleanup of cleanups.reverse()) cleanup(); },
    dictionaries: () => dictionaries,
    card(approval) {
      return panel.component({
        matched: approval,
        ...panel.options.inject(),
        t: (key, values) => dictionaries[active in dictionaries ? active : 'en'][key].replace('{toolName}', values.toolName),
        renderFactorySlot: (name, props) => {
          assert.equal(name, 'conversation.approval.card');
          return props;
        },
      });
    },
    command(calls, callId = 'target') {
      return detail.component({
        callId,
        useChat: selector => selector({
          legacy: { runningCalls: calls },
          get nodes() { throw new Error('must not scan the full Chat history'); },
        }),
      });
    },
  };
}

function call(name, args, callId = 'target', subCalls = []) {
  return { name, argsRaw: JSON.stringify(args), callId, phase: 'start', subCalls };
}

function approval(extra = {}) {
  return {
    kind: 'approval', key: 'approval:1', toolName: 'bash', callId: 'target',
    answerable: true, answer: async () => {}, ...extra,
  };
}

test('identifies any tool independently of the Auto review reason', () => {
  const f = fixture();
  const card = f.card(approval({ toolName: 'write', reason: 'Auto review denied this call.' }));
  assert.equal(card.title, 'Подтвердите инструмент: write');
  assert.equal(card.description, 'Auto review denied this call.');
  assert.equal(card.callId, 'target');
  assert.equal(card.requestKey, 'approval:1');
});

test('keeps localized reason and raw reviewer explanation', () => {
  const f = fixture();
  const card = f.card(approval({ reason: 'audit', displayReason: { en: 'Denied: raw reason', ru: 'Отклонено: raw reason' } }));
  assert.equal(card.description, 'Отклонено: raw reason');
  assert.equal(fixture('ru-RU', [{ id: 'ru-RU', fallback: 'ru' }, { id: 'ru', fallback: 'en' }]).card(
    approval({ displayReason: { en: 'English', ru: 'Русский' } }),
  ).description, 'Русский');
  assert.equal(fixture('fr').card(approval({ displayReason: { en: 'English' } })).description, 'English');
});

test('renders the tool even with no reason or correlated call', () => {
  const card = fixture().card(approval({ callId: undefined }));
  assert.equal(card.title, 'Подтвердите инструмент: bash');
  assert.equal('description' in card, false);
  assert.equal('callId' in card, false);
});

test('preserves original one-shot approval actions and live answerability', async () => {
  const answers = [];
  const request = approval({ answer: async value => { answers.push(value); } });
  const card = fixture().card(request);
  assert.deepEqual(answers, []);
  assert.equal(card.canAnswer(), true);
  await card.onAllow();
  await card.onReject();
  assert.deepEqual(answers, ['allowed-once', 'rejected']);
  request.answerable = false;
  assert.equal(card.canAnswer(), false);
  assert.equal('onAlways' in card, false);
});

test('does not take over ordinary questions, plans or an idle composer', () => {
  const { select } = fixture().panel.options;
  const pending = approval();
  assert.equal(select({ pendingInteraction: pending }), pending);
  for (const value of [undefined, { kind: 'question' }, { kind: 'plan-review' }]) {
    assert.equal(select({ pendingInteraction: value }), null);
  }
});

test('preserves complete multiline bash command as plain selectable text', () => {
  const command = 'printf "<script>not HTML</script>"\n  printf "a  b"\nprintf "$HOME"';
  const element = fixture().command([call('bash', { command })]);
  assert.equal(element.type, 'pre');
  assert.equal(element.props.children, command);
  assert.equal(element.props.style.whiteSpace, 'pre-wrap');
  assert.equal(element.props.style.userSelect, 'text');
  assert.equal(element.props.style.overflowWrap, 'anywhere');
  assert.equal(element.props.dangerouslySetInnerHTML, undefined);
});

test('reads terminal_send text and never treats an ordinary text argument as a command', () => {
  const f = fixture();
  for (const name of ['terminal_send', 'functions.terminal_send']) {
    assert.equal(f.command([call(name, { text: 'echo terminal\n  pwd', sessionId: 'shell-1' })]).props.children, 'echo terminal\n  pwd');
  }
  assert.equal(f.command([call('write', { text: 'not a command' })]), null);
  assert.equal(f.command([call('terminal_read', { sessionId: 'shell-1' })]), null);
  assert.equal(f.command([call('pwsh', { command: 'Get-Location' })]).props.children, 'Get-Location');
});

test('matches nested PTC calls by inner call ID, not outer or parallel commands', () => {
  const target = call('bash', { command: 'echo correct' });
  const middle = call('run_code', { command: 'wrong middle' }, 'middle', [target]);
  const outer = call('run_code', { command: 'wrong outer' }, 'outer', [
    call('bash', { command: 'wrong sibling' }, 'sibling'), middle,
  ]);
  assert.equal(fixture().command([outer, call('bash', { command: 'wrong parallel' }, 'parallel')]).props.children, 'echo correct');
});

test('never displays unrelated, preparing, settled, malformed or non-string input', () => {
  const f = fixture();
  const invalid = [undefined, null, [], 42, 'echo wrong', {}, { command: 42 }];
  for (const args of invalid) assert.equal(f.command([call('bash', args)]), null);
  assert.equal(f.command([{ ...call('bash', {}), argsRaw: '{' }]), null);
  assert.equal(f.command([{ ...call('bash', { command: 'old' }), phase: 'preparing' }]), null);
  assert.equal(f.command([{ ...call('bash', { command: 'old' }), kind: 'tool-result' }]), null);
  assert.equal(f.command([call('bash', { command: 'wrong' }, 'other')]), null);
  assert.equal(f.command([]), null);
});

test('does not truncate long commands or reuse another Session or prior publication', () => {
  const f = fixture();
  const long = 'printf "' + 'x'.repeat(20000) + '"\n';
  assert.equal(f.command([call('bash', { command: long })]).props.children, long);
  assert.equal(f.command([call('bash', { command: 'updated' })]).props.children, 'updated');
  assert.equal(f.command([]), null);
});

test('locale and both slot contributions are owned by plugin disposal', () => {
  const f = fixture();
  assert.equal(f.panel.options.priority, -1);
  assert.equal(f.detail.options.priority, -1);
  assert.deepEqual(Array.from(f.plugin.inject), ['slots', 'locale']);
  for (const language of ['en', 'ru', 'zh', 'ja', 'de', 'es', 'fr', 'pt']) assert.ok(f.dictionaries()[language].confirmTool);
  f.dispose();
  assert.equal(f.registrations.size, 0);
  assert.equal(f.dictionaries(), undefined);
});

test('pins visible title, reason and commands for English and Russian', () => {
  const cases = [];
  for (const language of ['en', 'ru']) {
    const f = fixture(language);
    for (const [name, args] of [['bash', { command: 'printf "hello"\n  pwd' }], ['terminal_send', { text: 'git status --short' }], ['write', { file_path: 'sample.txt' }]]) {
      const card = f.card(approval({ toolName: name, displayReason: { en: 'Auto review denied this call.', ru: 'Auto review отклонила этот вызов.' } }));
      cases.push({ language, tool: name, title: card.title, reason: card.description, command: f.command([call(name, args)])?.props.children ?? null });
    }
  }
  assert.deepEqual(cases, JSON.parse(readFileSync(new URL('./approval.expected.json', import.meta.url), 'utf8')));
});
