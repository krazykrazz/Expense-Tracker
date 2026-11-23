/**
 * Posts one sample of every notification type to a Discord channel through Notifiarr, built with the app's own
 * message builders and provider, so what you see is what the app sends (specs/discord-notifications/spec.md).
 * All values are made up.
 *
 *   NOTIFIARR_API_KEY=... NOTIFIARR_CHANNEL_ID=... node backend/scripts/notifiarr-poc.js
 *
 * Never prints the API key.
 */
const { buildMessage } = require('../services/notificationMessages');
const notifiarrProvider = require('../services/notifiarrProvider');

const apiKey = process.env.NOTIFIARR_API_KEY;
const channelId = process.env.NOTIFIARR_CHANNEL_ID;

if (!apiKey || !/^\d{17,20}$/.test(channelId || '')) {
  console.error('Set NOTIFIARR_API_KEY and NOTIFIARR_CHANNEL_ID (17-20 digits).');
  process.exit(1);
}

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

const SAMPLES = [
  ['plaid_needs_attention', { institutionName: 'CIBC', status: 'needs_login', errorCode: 'ITEM_LOGIN_REQUIRED', lastSyncedAt: hoursAgo(30).replace('T', ' ').slice(0, 19) }],
  ['plaid_needs_attention', { institutionName: 'CIBC', status: 'error', errorCode: 'INSTITUTION_DOWN', lastSyncedAt: hoursAgo(2).replace('T', ' ').slice(0, 19) }],
  ['plaid_stale', { institutionName: 'CIBC', bankUpdatedAt: hoursAgo(28), institutionStatus: 'DOWN' }],
  ['plaid_recovered', { institutionName: 'CIBC', previousState: 'needs_login', since: hoursAgo(51) }],
  ['plaid_sync_changes', { institutionName: 'CIBC', added: 3, updated: 1, removed: 0, balances: [{ name: 'Dividend Visa', field: 'available', from: 1204.55, to: 1180.1 }] }],
  ['plaid_sync_changes', {
    institutionName: 'Wealthsimple (Canada)', added: 0, updated: 0, removed: 0,
    balances: [
      { name: 'Credit Card', field: 'balance', from: 4977.62, to: 5130.85 },
      { name: 'RRSP', field: 'balance', from: 183793.51, to: 184222.87 },
      { name: 'Spousal RRSP', field: 'balance', from: 91224.82, to: 91232.75 }
    ]
  }],
  ['backup_succeeded', { trigger: 'scheduled', filename: 'expense-tracker-backup-v1.32.0-48d51c3-2026-11-23_02-00-00.tar.gz', size: 82460000, backupsKept: 7 }],
  ['backup_failed', { trigger: 'scheduled', error: Object.assign(new Error("ENOSPC: no space left on device, write '/config/backups/x.tar.gz'"), { code: 'ENOSPC' }), lastBackup: hoursAgo(26) }],
  ['backup_restored', { filename: 'expense-tracker-backup-v1.32.0-48d51c3-2026-11-23_02-00-00.tar.gz' }],
  ['test', {}]
];

async function main() {
  const credentials = { apiKey, channelId, pingUserId: '' };
  let failed = 0;
  for (const [eventKey, data] of SAMPLES) {
    const message = buildMessage(eventKey, data, { now });
    const result = await notifiarrProvider.send(credentials, message);
    if (!result.ok) failed++;
    console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${message.name}${message.title ? ` · ${message.title}` : ''}${result.ok ? '' : `: ${result.reason}`}`);
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  process.exit(failed ? 2 : 0);
}

main().catch(err => {
  console.error(`Preview failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
