/**
 * @invariant Whatever a bank, account or error text contains, nothing that could be a card / account number (a run of
 * 4 or more digits) or a file path survives into a notification. Randomised inputs cover digit runs inside words,
 * separators and path shapes that hand-picked examples would miss.
 */
const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { safeName, describeError, buildMessage } = require('./notificationMessages');

const textWithDigits = fc.array(
  fc.oneof(fc.stringMatching(/^[A-Za-z ]{0,8}$/), fc.stringMatching(/^[0-9]{1,16}$/), fc.constantFrom('-', ' ', '*', '•', '/')),
  { maxLength: 8 }
).map(parts => parts.join(''));

describe('notification privacy (property)', () => {
  test('safeName never lets a run of 4+ digits through', () => {
    fc.assert(
      fc.property(textWithDigits, (name) => !/\d{4,}/.test(safeName(name))),
      pbtOptions()
    );
  });

  test('a bank message hides digit runs in the bank name, wherever it is shown', () => {
    fc.assert(
      fc.property(textWithDigits, (name) => {
        const message = buildMessage('plaid_needs_attention', { institutionName: name, status: 'needs_login' });
        return !/\d{4,}/.test(JSON.stringify([message.name, message.title, message.description, message.fields]));
      }),
      pbtOptions()
    );
  });

  test('describeError never contains a file path, quoted or not, with or without spaces', () => {
    const pathLike = fc.tuple(
      fc.constantFrom('/config/backups/', 'C:\\config\\db\\', '/app/', '\\\\server\\share\\', '/config/My Drive/', 'G:\\My Drive\\'),
      fc.stringMatching(/^[a-z0-9._-]{1,12}$/)
    ).map(([dir, file]) => `${dir}${file}`);
    const quote = fc.constantFrom("'", '"');
    fc.assert(
      fc.property(pathLike, quote, fc.constantFrom('open', 'EACCES: permission denied, open', 'ENOENT: no such file,'), (filePath, q, prefix) => {
        const text = describeError(new Error(`${prefix} ${q}${filePath}${q}`));
        return !text.includes('config') && !text.includes('/app/') && !text.includes('Drive') && !/[A-Za-z]:\\/.test(text)
          && text.includes('<path>');
      }),
      pbtOptions()
    );
    // Unquoted paths can't contain spaces (the space ends them), so only space-free ones are generated
    fc.assert(
      fc.property(pathLike.filter(p => !p.includes(' ')), (filePath) => {
        const text = describeError(new Error(`open ${filePath} failed`));
        return !text.includes('config') && !text.includes('/app/') && text.includes('<path>');
      }),
      pbtOptions()
    );
  });
});
