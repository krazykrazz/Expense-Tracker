/**
 * Proof of concept for the Notifiarr Passthrough integration (specs/discord-notifications/spec.md).
 *
 *   NOTIFIARR_API_KEY=... NOTIFIARR_CHANNEL_ID=... node backend/scripts/notifiarr-poc.js [string|number]
 *
 * Posts layout previews of each notification type (made-up data) and edits the "needs login" message into
 * "recovered" (update-in-place). NOTIFIARR_ICON_URL overrides the title icon (must be a public PNG).
 * The argument chooses how the channel ID is sent: Discord IDs exceed Number.MAX_SAFE_INTEGER, so as a plain JS
 * number they would be corrupted; 'number' sends the digits as a raw JSON number to see whether Notifiarr
 * needs that form. Never prints the API key.
 */
const ENDPOINT = 'https://notifiarr.com/api/v1/notification/passthrough/';
const OK_RESPONSE = 'Pass through payload processed.';
const PLACEHOLDER = '__SNOWFLAKE_CHANNEL__';

const apiKey = process.env.NOTIFIARR_API_KEY;
const channelId = process.env.NOTIFIARR_CHANNEL_ID;
const channelMode = process.argv[2] === 'number' ? 'number' : 'string';

if (!apiKey || !/^\d{17,20}$/.test(channelId || '')) {
  console.error('Set NOTIFIARR_API_KEY and NOTIFIARR_CHANNEL_ID (17-20 digits).');
  process.exit(1);
}

const ICON_URL = process.env.NOTIFIARR_ICON_URL || 'https://gh.notifiarr.com/images/icons/notifiarr.png';

function buildBody({ update, event, color, title, description, fields, content, thumbnail }) {
  const body = JSON.stringify({
    notification: { update, name: 'Expense Tracker', event },
    discord: {
      color,
      ping: { pingUser: 0, pingRole: 0 },
      images: { thumbnail: thumbnail || '', image: '' },
      text: { title, icon: ICON_URL, content: content || '', description: description || '', fields, footer: `Expense Tracker v${require('../package.json').version}` },
      ids: { channel: PLACEHOLDER }
    }
  });
  return channelMode === 'number'
    ? body.replace(`"${PLACEHOLDER}"`, channelId)
    : body.replace(PLACEHOLDER, channelId);
}

async function post(label, message) {
  const body = buildBody(message);
  const started = Date.now();
  const res = await fetch(ENDPOINT + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
    body,
    signal: AbortSignal.timeout(5000)
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* plain text response */ }
  const processed = res.ok && (parsed?.details?.response === OK_RESPONSE || parsed?.result?.details?.response === OK_RESPONSE);
  console.log(`${processed ? 'OK  ' : 'FAIL'} ${label}: HTTP ${res.status} in ${Date.now() - started}ms`);
  console.log(`     ${text.slice(0, 400)}`);
  return processed;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log(`Channel ID sent as: ${channelMode}`);
  const event = 'CIBC';
  const results = [];
  const f = (title, text, inline = true) => ({ title, text, inline });

  // Layout previews of each notification type (spec: discord-notifications); all values are made up
  results.push(await post('1. needs login', {
    update: false, event, color: 'E74C3C', title: '🔴 Bank needs login',
    fields: [
      f('Bank', 'CIBC'), f('Status', 'Needs login'), f('Error code', 'ITEM_LOGIN_REQUIRED'),
      f('Last good sync', 'Nov 22, 6:24 AM'), f('Auto sync', 'Paused'), f('Trial slot', 'Not used'),
      f('Action', 'Connections tab → **Reconnect**. Keeps the same connection; nothing is re-imported.', false)
    ]
  }));

  results.push(await post('2. stale', {
    update: false, event, color: 'F39C12', title: '🟡 Bank not updating',
    fields: [
      f('Bank', 'CIBC'), f('Status', 'Not updating'), f('Plaid data age', '28 h'),
      f('Plaid last got data', 'Nov 21, 6:16 AM'), f('Plaid status', 'DOWN'), f('Our sync', 'Working'),
      f('Action', 'CIBC only sends new data when you log in. Use **Log in again** on the Connections tab, or import a file.', false)
    ]
  }));

  await sleep(2000);

  results.push(await post('3. recovered (edits #1 in place)', {
    update: true, event, color: '2ECC71', title: '🟢 Bank recovered',
    fields: [
      f('Bank', 'CIBC'), f('Status', 'Syncing'), f('Was', 'Needs login'),
      f('Down for', '2 d 3 h'), f('New transactions', '12'), f('Balance', '$1,204.55 → $1,180.10')
    ]
  }));

  results.push(await post('4. backup succeeded', {
    update: false, event: 'Backup', color: '3498DB', title: '🔵 Backup completed',
    fields: [
      f('Size', '78.64 MiB'), f('Previous size', '79.05 MiB'), f('Size check', 'Good [↓ 420 KiB]'),
      f('Retained backups', '7'), f('Trigger', 'Scheduled'), f('Duration', '4 s'),
      f('Filename', 'expense-tracker-backup-2026-11-22_02-00-00.tar.gz', false)
    ]
  }));

  results.push(await post('5. backup failed', {
    update: false, event: 'Backup', color: 'E74C3C', title: '🔴 Backup failed',
    fields: [
      f('Trigger', 'Scheduled'), f('Last good backup', 'Nov 21, 2:00 AM'), f('Disk free', '1.2 GiB'),
      f('Error', 'ENOSPC: no space left on device', false)
    ]
  }));

  const ok = results.every(Boolean);
  console.log(ok ? '\nAll requests accepted. Check which of #1 / #2 the "recovered" message (#3) replaced.' : '\nSome requests failed.');
  process.exit(ok ? 0 : 2);
}

main().catch(err => {
  console.error(`PoC failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
