# Plaid Bank Import

Connect bank and credit card accounts through [Plaid](https://plaid.com/docs/), pull their transactions automatically, and review them in an **Import Inbox**:
- add each one as a new expense, or match it to an expense you already entered;
- confirm a planned fixed expense or expected income with it;
- or ignore it.

Nothing becomes an expense without an explicit action. The feature is optional: without Plaid keys the tracker works exactly as before, and none of this appears.

Only the Plaid **Transactions** product is used (balances come with it). See [Limitations](#limitations).

Specs: [Phase 1](../../specs/archive/plaid-integration/spec.md) (archived) and [bank sync roadmap](../../specs/plaid-bank-sync/spec.md).

## Setup

### 1. Plaid account

1. Create a Plaid Dashboard account and apply for the free **Trial plan** (US/Canada accounts created on or after 15 April 2026). It gives real bank data for up to **10 Production connections, ever**. Disconnecting a bank does **not** give the slot back.
2. Under Developers → Keys, copy the `client_id`, the **Sandbox** secret and the **Production** secret.
3. Build and test with Sandbox first: it has fake banks, unlimited connections, and the test login `user_good` / `pass_good`.

### 2. Configuration (in the app)

Open **Settings → Bank Import**:

1. Choose **Sandbox** or **Production**. Each environment has its own secret.
2. Paste the **Client ID** and the **Secret** for that environment.
3. Click **Test connection**. This asks Plaid for a Link token with those keys and shows whether Plaid accepted them, without saving anything.
4. Click **Save**. The bank icon appears in the header straight away.

How the settings form behaves:
- After saving, the form shows only masked hints (`••••1234`). The secret is never sent back to the browser.
- To change only some values, leave the other fields blank: a blank field keeps the saved value.
- Switching Sandbox ↔ Production is refused while banks from the other environment are connected, because a bank's connection only works in the environment it was made in. Disconnect them first (Bank Import → Connections).
- **Remove keys** turns the feature off. It is refused while any bank is connected.
- If Production is enabled and the app has no password, the screen recommends setting one (Settings → Security), since anyone on the network could otherwise open it.

Until keys are saved, the header button is hidden and every `/api/plaid/*` endpoint except `/status` and `/settings` returns 503. The server log reports `Plaid integration enabled (sandbox, configured via Settings)` on startup. Incomplete configurations are logged as warnings that list what is missing; secrets are never logged.

#### How secrets are stored

- **The encryption key:** generated automatically the first time it is needed, at `<CONFIG_DIR>/secrets/plaid.key` (`/config/secrets/plaid.key` in Docker). The file is readable only by the app user.
- **What it protects:** both the Plaid secret (setting `plaid_secret_enc`) and every bank access token are encrypted with it using AES-256-GCM.
- **Backups:** they contain only the database, invoices, statements and `backupConfig.json`, never the `secrets/` folder. A backup on its own can't be used to reach your bank data.
- **Restoring on another machine** (or after losing `/config/secrets`): the Bank Import tab asks you to re-enter the secret, and each bank must be reconnected. In Production, every reconnection uses another Trial slot. To avoid that when migrating, copy `secrets/plaid.key` to the new `/config` alongside the restore.

#### Optional: environment variables

Container-managed setups can configure Plaid with environment variables instead. If **any** of `PLAID_CLIENT_ID`, `PLAID_SECRET` or `PLAID_ENV` is set, they are the only source used, and the settings screen becomes read-only.

| Variable | Value |
|----------|-------|
| `PLAID_CLIENT_ID` | Your Plaid `client_id` |
| `PLAID_SECRET` | The secret for the chosen environment |
| `PLAID_ENV` | `sandbox` or `production` |
| `PLAID_TOKEN_KEY` | Optional. 32-byte key (base64 or hex) used instead of the generated key file. It works with either configuration method |

- **Docker:** put the values in an untracked `.env` file next to `docker-compose.yml`, then uncomment the `PLAID_*` lines in the `expense-tracker` service. Never commit secrets.
- **Already using `PLAID_TOKEN_KEY`:** keep it set. Your existing bank connections were encrypted with it, and they can't be read without it.

> **Staging and preview:** don't give a container that runs on a *copy* of production data your Production keys or `secrets/plaid.key`. Disconnecting a bank there would remove the real connection at Plaid. Leave them unconfigured, or use Sandbox keys.

### 3. Content Security Policy

Plaid Link loads from `https://cdn.plaid.com`. The helmet CSP in `backend/server.js` allows it in `script-src` and `frame-src`, and allows `https://*.plaid.com` in `connect-src`.

## Using it

The **bank icon** in the header opens the Bank Import modal. It appears as soon as Plaid keys are saved.

### Connections tab

1. **Connect a bank** opens Plaid Link. In Production it first asks you to confirm, showing how many Trial connections you have used.
2. For each account, choose the **payment method** it pays from (debit or credit card payment methods), or *Don't import*. Transactions from unmapped accounts are kept but hidden from the inbox.
   - Mapped payment methods show a small green **bank badge** next to their name on the Financial page (Payment Methods). Hovering it lists the linked bank accounts. Without Plaid configured, the Financial page makes no bank calls and shows no badges.
3. **Sync now** pulls changes for every connected bank and reports new / updated / removed counts. One failing bank does not stop the others.
   - The first sync covers about 30 days of history. Plaid may need a minute after connecting before history is ready.
   - Each bank shows when it last synced (date and time) and its last error.
4. **Automatic sync** (shown once a bank is connected): on by default, every **30 minutes from 06:00 to 23:00** in the business timezone (Settings), nothing overnight. Choose 30, 60 or 120 minutes and the hours, or turn it off. See [Automatic sync](#automatic-sync).
5. **Disconnect** removes the connection at Plaid and locally. Unreviewed and ignored transactions are deleted. Expenses already added, and their bank-confirmed colours, are kept. For a bank that only needs a new login, the confirmation steers you to **Reconnect** instead.

### When a bank needs you (expired login)

Banks periodically ask for the login again (a changed password, a security check). Until then Plaid returns `ITEM_LOGIN_REQUIRED`, and automatic sync pauses that bank, so new transactions silently stop arriving. The app makes this hard to miss:

- **Header:** the bank icon gets a **red dot**, and its hover text names the bank. Clicking it opens Bank Import on **Connections** instead of the Inbox.
- **Main screen:** a notification in the Notifications panel ("CIBC needs you to log in again: bank transactions stopped syncing"). Clicking it opens Connections. Dismissing hides it until the page is reloaded.
- **Connections:** the bank shows a status chip (**Needs login**, **Connection removed**, or **Sync problem** for temporary bank errors that keep retrying) with a line explaining what to do.
- **Reconnect** (shown for *Needs login*) opens Plaid Link in *update mode*: you log in to the bank again and the same connection is repaired. It uses **no new Trial slot**, keeps the sync position, so nothing is re-imported, and syncs straight away. Logged as `plaid_item_updated` ("Reconnected bank: CIBC").
- **Connection removed** (the bank or Plaid no longer knows the connection) can't be repaired: Disconnect it, then connect the bank again.

The status is worked out from the bank's last sync error, and all of the above refreshes in every open tab as soon as a sync fails or a bank is reconnected.

### When a bank stops updating (at Plaid)

Our syncs only get what Plaid already has. Plaid fetches from each bank on its own schedule (usually 1-4 times a day), and sometimes its connection to a bank breaks for hours or days (Wealthsimple, Nov 2026). Our sync then still succeeds, just with nothing new, so this is checked separately:

- **After every sync**, the app asks Plaid (free) when it last fetched from the bank (`/item/get`) and how Plaid rates that bank right now (`/institutions/get_by_id` with status).
- **Connections:** every bank shows "Bank data updated by Plaid: <time>". When Plaid rates the bank down or degraded, it adds "Plaid reports <bank> updates down since <time>". Plaid's rating isn't always reliable (it showed CIBC down for weeks while it worked), so it's shown as information, not used to flag the bank.
- **Not updating:** when Plaid hasn't fetched new data from a bank for over **12 hours** (and there's no login problem), the bank gets an amber **Not updating** chip and the header bank icon an **amber dot** (hover names the bank). Red still means "you need to act" and takes precedence.
- **What to do:** usually nothing: the bank catches up once Plaid's connection recovers, and nothing is lost (the sync position is kept). Some banks only give Plaid new data while you're logged in (CIBC: transactions arrive only right after a login, and the login expires after about 24 hours), so a **Log in again** button appears on a Not updating bank. It first asks Plaid to fetch now (`/transactions/refresh`). CIBC always refuses that with "login required" (even minutes after a login), and Plaid only fetches during a login when the connection is marked as needing one. So the connection is marked Needs login and Plaid's login opens straight away (update mode: same connection, no new Trial slot), followed by a sync that reports what it brought. For a bank Plaid can fetch from on its own, no login opens and the new transactions arrive with the next sync. On paid Plaid plans `/transactions/refresh` may be billed per call. A [file import](#import-a-bank-file-fallback) is the dependable fallback. Don't disconnect: it uses a Trial slot and doesn't help. Automatic sync keeps running for these banks.

### Import a bank file (fallback)

When Plaid can't get data from a bank, download your recent activity from the bank's website and import it. The rows go into the same Inbox as Plaid's, so Add, Match, Ignore, pending charges and the card balance check all work as usual.

- **Where:** Bank Import → Connections → **Import file** next to an account that imports into a payment method. Choose the CSV; a preview shows what will happen before anything is saved.
- **Supported files:**
  - **Wealthsimple** credit card and chequing CSV exports (Activity → Export).
  - **CIBC** credit card CSV (Download transactions → CSV). The file has no header row; it may list a second cardholder's card, which is fine as long as one card in the file has the account's last four digits.
  - Other banks can be added per format. The file must suit the account: a card file into a credit card account, a chequing file into the chequing account with the same last four digits.
- **What's imported:** rows from the first date Plaid has for that account (older history is already in the tracker; change the date in the preview if needed). Transactions Plaid already sent are matched rather than added again: same amount with dates within 3 days, or, when one of them is pending, an amount within 25% and a similar description. Pending charges in a Wealthsimple file come in as **Pending** (Plaid doesn't flag Wealthsimple's pending charges). They turn green when a newer file shows them Completed, when Plaid sends a change for them, or when the card's balance from Plaid shows they posted: Wealthsimple's balance leaves pending charges out, so after each sync whose balance refresh succeeded, if exactly one choice of the still-pending charges explains the balance difference to the cent, the others have posted and are settled (logged as settled). When it's ambiguous (two charges of the same amount, or a tip changed a total), nothing is settled. CIBC's file only lists posted transactions.
- **Either order, best information kept:** a file and Plaid can each be first. Whichever arrives second fills in what the first lacked:
  - **Settled wins over pending.** This goes one way: a settled transaction never goes back to pending. A CIBC file can settle a charge that Plaid still shows as pending; the expense's amount and posted date update and it turns green. The settled amount is the one kept.
  - **Purchase date:** Plaid's when it sends one (CIBC), otherwise the file's (Wealthsimple's file dates are the purchase date; Plaid's are 0-1 day later).
  - **Posted date:** Plaid's, or a CIBC file's when the file settled the charge.
  - **Merchant name:** Plaid's, otherwise the file's.
  - Your review (Added, Matched, Ignored) and the expense link are never changed by either source.
- **Importing again is safe:** rows imported before are recognised (nothing is added twice); a pending charge that has completed in a newer export settles in place, and its expense turns green.
- **When Plaid catches up,** each Plaid transaction that matches a file row takes that row over (Plaid's id from then on). Its review, expense link and colour are kept, so nothing is counted twice. An **ignored** file row stays ignored after takeover, and a file row matching an ignored Plaid row stays ignored too.
- **In the Inbox,** file rows have a **From file** tag. Imports are logged as `plaid_file_imported`.
- **Card balance check:** the bank's balance comes from Plaid, so it doesn't include transactions that are only in a file yet. A file transaction you added or matched is listed as **From a bank file, not in the bank's balance yet**: it explains its part of the difference until Plaid sends it and takes the row over. Unreviewed or ignored file rows are in neither balance, so they aren't causes. When the bank's data is stale (Plaid hasn't had new data for over 12 hours), the check also shows a warning. The card still shows as differing (amber) until the bank's balance catches up, but nothing is unexplained.
- **Limits:** a Wealthsimple file has no posting date, so card expenses from it get none until Plaid sends one. Rows that disappear from a later export are not removed.

**Connecting a disconnected bank again:** a new connection gets new transaction ids from Plaid, so the first ~30 days would otherwise arrive as duplicates of transactions you already reviewed. Instead, when a new transaction looks like one kept from the disconnected bank (same amount, description and date; or a settled charge for a kept pending one: same purchase date and description, amount within 25%), the kept row is re-attached to it. Its expense stays linked, a kept pending charge settles as usual (green pill), and nothing reappears in the inbox. Ignored transactions were deleted on disconnect, so they come back to the inbox once. While a bank is disconnected, a pending expense from it stays yellow, and its hover text says it will update once the bank is connected again.

### Automatic sync

Nobody needs to know about Sync now:

- **On a schedule:** a check runs every 5 minutes and syncs each bank whose last sync is older than the interval (with 3 minutes of slack, so "30 minutes" stays 30), during the active hours only.
- **When the app is opened:** loading the app, coming back to its tab (at most once every 5 minutes) or opening Bank Import syncs, in the background, any bank not synced in the last 30 minutes. This works at any hour, including overnight.
- **What is skipped:** banks waiting for you (expired login, removed at the bank) until they are reconnected (see [When a bank needs you](#when-a-bank-needs-you-expired-login)), banks from another Plaid environment, and a bank that just failed (it is retried at the next interval, not every 5 minutes). Nothing runs while Plaid is not configured.
- **Results:** a sync that brings new, changed or removed transactions refreshes the inbox and connections in every open tab (toast "↻ Bank import updated"). Syncs with nothing new are silent.
- **Cost:** Plaid does not charge per sync call (Transactions is billed per connected account per month on paid plans, and is included in the Trial). Plaid itself collects new data from most banks 1 to 4 times a day, so most syncs find nothing new.

### Inbox tab

Lists bank transactions waiting for review, newest first, with the place (Plaid's merchant name, or the raw bank description), the bank's raw description, amount and payment method. Transactions not yet settled at the bank are included with a **Pending** badge (see [Pending transactions](#pending-transactions)).

| Action | What happens |
|--------|--------------|
| **Add** | Opens an inline editor pre-filled with place, date and a category suggested from your history for that place. The place is the one you chose before for the same bank description (store numbers, "- Purchase" and city/province ignored, so "Yig Browns 406" gets the "Brown's Independent" you used for "Yig Browns 405"), else an existing place the description starts with ("Sobeys" for "SOBEYS #4123"; the longest match, then the most used), else the bank's text. The bank's own text stays visible under the place. **Add expense** creates a normal expense (validation, activity log and sync all apply). For credit cards, the bank's posting date is stored as the posted date when it is later than the purchase date. |
| **Match** | Shown when existing expenses could be the same purchase: same payment method, same **charged** amount to the cent, date within ±3 days, and not already linked. For reimbursed or insurance-tracked expenses the charged amount is the original cost (what the card was charged), not the out-of-pocket amount; the picker shows both. Links the transaction to the chosen expense without changing it. The same picker lists **fixed expenses** the transaction could pay and, for deposits, **expected income** (see below). |
| **Ignore** | Hides the transaction. The **Ignored** filter lists ignored transactions with **Undo ignore**. |
| **Record payment**, **Link to card payment**, **Record payment to…** | Credit card payments; see [Credit card payments](#credit-card-payments). |

- Refunds and credits on a credit card (zero or negative amounts) are labelled *Refund / credit*, unless they look like a card payment (*Card payment*). They can be recorded as a payment or ignored, never added as an expense. Money coming into a bank account is labelled *Deposit* (see [Income](#income-confirm-a-deposit)).
- Amounts in a currency other than CAD get a badge; they are not converted.

### Pending transactions

So you can add an expense the day you spend instead of waiting 1-3 days for the charge to settle:

- **Pending charges** appear with a yellow **Pending** badge (for banks that report them to Plaid; in testing CIBC did, Wealthsimple did not). They can be **added** or **matched** to an expense, or ignored. Fixed-expense and income confirmation wait until they settle, because their point is the date the money actually landed.
- **Expense list:** an expense from a pending charge shows its payment method pill in **yellow**. Hovering it says "Pending at bank … updates when it settles".
- **When it settles**, Plaid sends the settled transaction pointing at its pending one. The sync updates the bank row in place, so the expense stays linked and the pill turns **green**. Nothing needs reviewing again. Then:
  - if the settled amount differs (a tip, a gas pre-authorization), the expense amount follows the bank, but only if it still has the pending amount. An amount you edited by hand, and reimbursed or insurance-tracked expenses, are kept, and the pill turns red-orange ("Amount differs from bank");
  - credit card expenses get the bank's posting date;
  - the change is logged (`plaid_transaction_updated`, action `settled`, plus the normal `expense_updated`). If the expense can't be updated, action `settle_failed` names the amount and posted date to set by hand.
- **When a pending charge you added disappears** (a hold that was cancelled, or a charge that settled without Plaid linking the two), it shows at the top of the inbox as **Cancelled at bank**, and the pill turns red-orange. Choose:
  - **Link**, when a settled transaction on the same card within 10 days and 25% of the amount is offered: it takes over the link and the expense follows its amount;
  - **Keep expense**: the expense stays, no longer linked to the bank;
  - **Delete expense**: the charge never happened.
- Unreviewed pending rows simply follow the bank: they turn into the settled transaction in place, or disappear if the bank drops them.

### Fixed expenses: confirm instead of adding

Fixed expenses (rent, mortgage, utilities, subscriptions) are usually logged ahead, often copied from the previous month. A bank charge that pays one should **confirm** it, not be added as a new expense: adding it would count the bill twice.

- **Which fixed expenses are offered:** for a charge (not a refund), the Match picker lists fixed expenses that:
  - use the **same payment method** (the fixed expense's linked payment method; its name is only a fallback for very old entries);
  - are **due from 3 days before to 10 days after** the date the charge landed (the bank's posted date), with the due day clamped to the month length. A fixed expense without a due day is offered for any charge in its month. The window crosses month ends, so a bill due on the 30th that lands on the 2nd still matches;
  - are **not already confirmed**.

  Exact amounts are listed first. When an amount is exact or within 10%, the row gets a **"Fixed: <name>"** badge.
- **Confirm:** links the transaction to the fixed expense and records when the payment **actually landed**. No expense is created.
- **Different amount:** bills vary, and copied-forward amounts go stale. The planned amount is updated to the bank amount through the normal fixed-expense update (validated, logged as `fixed_expense_updated`), and the picker says so before you confirm. If that update fails, the confirmation is undone.
- **In Fixed Expenses**, a confirmed item's **payment type pill turns green**. Hovering it shows the bank description, the date it landed and how many days before or after the due date, the bank amount, and the planned amount when it was updated. The pill turns red-orange if the planned amount is later edited away from the bank amount.
- **Each month is separate:** copying fixed expenses forward creates new, unconfirmed items. Deleting a confirmed fixed expense returns its transaction to the inbox.

The landing dates are the groundwork for a later phase: auto-logged loan payments (currently created on the due day) could use the actual date the payment landed.

### Income: confirm a deposit

Expected income (Income Management) is a monthly list of sources: a name, category and amount, with no day or account. A deposit (money into a chequing or savings account; credits on a credit card are refunds, not income) can confirm one of them or create one.

- **Which income is offered:** the Match picker lists income sources that are **not already confirmed** in the deposit's month. In the last 3 days of a month it also lists next month's income (pay due on the 1st that lands early before a weekend), and in the first 3 days the previous month's.
  - Ranking: sources this bank description confirmed before (by name, so next month's copied source is found automatically), then sources whose name words all appear in the description (*JAT* for "JAT - Direct deposit"), then the deposit's own month, then the closest amount.
  - A likely match (name fit or exact amount) gets an **"Income: <name>"** badge.
- **Confirm:** links the deposit to the income source and records when it **landed**. One deposit per income source: log pay that arrives more than once a month as separate sources.
- **Different amount:** the picker offers **Update to $X** (pre-checked). Checked, the income amount becomes the deposit amount through the normal income update (logged as `income_source_updated`); unchecked, the income keeps its amount. If the update fails, the confirmation is undone.
- **Add income:** for a deposit with no expected source (a one-off government payment, a gift), creates an income source in the deposit's month with the deposit amount. The name and category are pre-filled from an earlier confirmation of the same description, else the description and *Other*.
- **In Income Management**, a received income source shows the bank icon (income has no payment method pill) with the description, the date it landed and the deposit amount. It turns amber when the income amount differs from the deposit. Deleting the income source returns the deposit to the inbox.

### Credit card payments

A card payment shows up twice in the inbox: as a **debit** on the account that paid it (chequing) and as a **credit** on the card. Both resolve to **one** recorded payment (Credit Card Detail → Payments), so the card's balance, statement and reminders update exactly as if you had logged it by hand.

- **How the two sides are found:** a credit on a card and a debit on another account with the **same amount to the cent**, both settled, posted **within 5 days**. The bank's wording is only a label ("Credit Card Payment", "PAYMENT THANK YOU/PAIEMEN T MERCI", "CIBC MASTERCARD - Bill payment" all differ, and Wealthsimple writes every bill, including your hydro bill, as "<payee> - Bill payment"). When several candidates fit, all are listed and you choose; nothing is picked for you.
- **Record payment** (on the credit on a card, always offered, highlighted when it looks like a payment): creates the payment on that card with the bank's amount and the credit's posted date, and links the credit to it. When exactly one debit could have paid it, **Also mark the <account> debit as this payment** is pre-checked, so one click settles both rows. With several, pick one or none. A pending credit can be recorded once it settles.
- **Match** (same panel): when you already entered that payment by hand (same card, same amount, within 5 days), it is listed so you can match it instead of recording it twice.
- **Link to card payment** (on the debit): ties the debit to a payment that is already recorded, from the card side or by hand. It creates nothing. A debit whose credit hasn't arrived yet says so: record it from the credit when it shows up, usually within a few days.
- **Record payment to…** (on the debit): only for a card with **no bank account connected**, since no credit will ever arrive for it. A connected card is refused: its own credit records the payment, so it is never recorded twice.
- **Add** stays on a debit that looks like a card payment, but its form warns that adding it as an expense counts the spending twice (the card already has it).
- **Each payment has at most one bank row per side** (one credit on the card, one debit on the paying account).
- **Undo:** delete the payment in the card's Payments tab. Payments recorded from the bank show a small bank icon there, and the delete dialog says its bank transactions return to the inbox. Both rows go back to **To review**; nothing is lost.
- **Balance check:** a payment with its credit linked no longer shows as a cause on the card's balance check.
- **Not supported:** one debit paying two cards, one card paid by two debits, and amounts that differ by even a cent between the two sides. Record the card side and ignore (or link) the rest.
- Categories help when Plaid sends one (`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, stored since 1.22.0 for new rows); rows staged earlier, and rows from a bank file, are recognised by their wording.

### Bank-confirmed payment method in the expense list

Expenses that were added from, or matched to, a bank transaction colour their **payment method pill**, so no extra icon is needed:

| Colour | Meaning |
|--------|---------|
| Green | Settled at the bank, amount equal |
| Yellow | Still pending at the bank; updates when it settles (or, if its bank was disconnected, once it is connected again) |
| Red-orange | Needs attention: the amount differs from the bank, or the bank dropped the pending charge (review in the inbox) |

- Hovering the pill shows the bank's description, date and amount, and whether the expense was added from or matched to the bank. Screen readers hear the state ("(confirmed by bank)", "(pending at bank)", …) after the method name.
- "Amount differs" means the expense amount no longer equals the bank amount to the cent; the hover text starts with "Amount differs from bank". Reimbursed expenses are compared using their original cost, since that is what the bank charged.
- Expenses without a link (cash, cheques, or anything not yet reviewed) keep the normal grey pill.

### Credit card balance check

Each sync also stores the balance the bank reports for every account. For credit cards mapped to a bank account, the app compares it with the tracker's own balance, so you can see whether they agree and, if not, why.

- **Financial page → Payment Methods:** a linked card's **Current** balance is coloured like the expense list's payment pill: **green** when it matches the bank to the cent, **red-orange** when it doesn't. Hovering shows both balances and the likely causes. Cards not linked to a bank keep the normal grey.
- **Card details (View):** the check is folded into the existing cards, so it takes no extra space when everything matches:
  - **Current Balance card:** a line such as **Bank $2,160.40 · matches** (green) or **· differs by $50.00** (red-orange). The bank figure is what the bank says is owed: `limit − available` when the bank sends available credit, which includes pending charges (CIBC); otherwise the bank's balance, marked *excl. pending* (Wealthsimple). Its hover text adds the sync time, entries dated after today (which neither balance counts) and Inbox transactions that already have a matching tracker entry (**Match** them to tidy up);
  - **Why it differs from the bank** (only when the balances differ): the likely causes, each with its amount:
    - *At the bank, not in the tracker:* a charge or credit still waiting in the Inbox, or one that was **ignored**, such as a refund that was never recorded. **Open Inbox** goes straight there;
    - *In the tracker, not at the bank:* an expense or payment since the bank's history starts (about 30 days before connecting) that no bank transaction is linked to: a typo, the wrong card, a duplicate, or not posted yet;
    - *Still pending:* an expense added from a pending charge, on a bank whose balance leaves pending charges out;
    - *Cancelled by the bank:* an expense added from a pending charge the bank then dropped (review it in the Inbox);
    - *Fixed expense:* a charge confirmed as a fixed expense, which the card balance doesn't include;
    - *Credit balance:* the card is in credit at the bank, while the tracker's balance stops at $0;
    - anything left over is shown as not explained by the bank's recent transactions (e.g. an old entry, or a wrong statement balance);
  - **Use bank limit** in the Credit Limit card (or on its own when the card has no limit), only when the bank reports a different limit. Nothing else is ever changed automatically.
- **How causes are found:** bank rows and tracker entries for the same amount within 5 days cancel out (a payment entered by hand pairs with the bank's payment; a payment recorded from the inbox is already linked to its bank credit and isn't a cause at all, see [Credit card payments](#credit-card-payments)). One tracker entry also cancels out two bank charges that add up to it, e.g. an Amazon order shipped and charged in two parts. When the card's latest statement balance was entered from the real statement, only activity posted after that statement is considered: the statement already accounts for everything before it.
- The check refreshes after every sync, payment and expense change. A bank that isn't syncing is flagged, since its balance may be out of date.

## How it works

- **Tokens:** Plaid access tokens are encrypted with AES-256-GCM using the Plaid encryption key (`secrets/plaid.key`, or `PLAID_TOKEN_KEY`) and stored in `plaid_items.access_token_enc`. The key is never written to the database, and the `secrets/` folder is not backed up, so backups never contain a usable token. Tokens are never logged, returned to the browser, or written to the activity log.
- **Environment guard:** a bank connected in one environment is never used against the other. Sync refuses it with "Disconnect it and connect again", and Disconnect removes it locally without calling Plaid.
- **Sync:** each bank is synced with Plaid's `/transactions/sync` from its stored cursor.
  - All pages are fetched first. The staged changes and the new cursor are then saved in one database transaction, so a failure part-way leaves nothing half-applied.
  - If Plaid reports data changed mid-pagination, the sync restarts from the saved cursor (up to 3 times).
  - Two syncs of the same bank never run at once.
  - Afterwards, every account's balance is refreshed from Plaid's `/accounts/get` (free; Plaid's cached balances), because `/transactions/sync` only includes accounts that had transactions in that response. A failure there keeps the previous balances and doesn't fail the sync.
- **Staging rules:**
  - Pending transactions are staged with `pending = 1`. A settled transaction that names its pending version (`pending_transaction_id`) replaces that row in place, keeping its review state and links.
  - New transactions are inserted once (unique `transaction_id`, so re-syncing is safe).
  - Plaid's personal finance category (primary, detailed, confidence) is stored with each transaction. Rows staged before it was stored keep none, and a later sync that omits it never clears it. Nothing uses it yet; it will recognise credit card payments.
  - Modified and removed transactions only affect rows still waiting for review. Anything you have added, matched or ignored is never changed by a sync, except pending charges: they settle in place (see [Pending transactions](#pending-transactions)), and a linked one the bank drops is kept and flagged (`removed_at`) for review.
- **One link per expense:** a unique index on `plaid_transactions.expense_id` ensures an expense is linked to at most one bank transaction.
- **Deleting a linked expense** sends its bank transaction back to the inbox (as "To review"), so it can be re-added, matched to another expense, or ignored. It is never silently lost.
- **Trial counter:** every Production connection increments the `plaid_production_items_created` setting, which is never decremented, matching Plaid's rule.
- **Backups:** see [How secrets are stored](#how-secrets-are-stored). A restore also reloads the saved Plaid settings, so the app immediately reflects the keys (or lack of them) in the restored database.

### Data

Tables `plaid_items`, `plaid_accounts`, `plaid_transactions`, `plaid_fixed_expense_links`, `plaid_income_links` and `plaid_card_payment_links`; see [Database Schema](../DATABASE_SCHEMA.md#plaid-tables). The expense list (`GET /api/expenses`) adds a `bankLink` field to every expense: `{ status, name, rawName, date, amount, pending, removed, disconnected }` or `null` (`disconnected`: its bank was disconnected). Fixed expenses and income sources get `bankConfirmation` (`{ landedDate, amount, plannedAmount, name }`) or `null`. A bank's `status` (`ok`, `needs_login`, `gone`, `error`) is derived from its stored `last_error`; there is no status column.

### API

All under `/api/plaid`; see the [Endpoint Reference](../API_DOCUMENTATION.md#plaid-bank-import--plaidroutesjs).

### Activity log

- `plaid_item_added` and `plaid_item_deleted` (entity `plaid_item`, institution name only). Reconnecting a bank (update mode) logs `plaid_item_updated` with the institution name and the error it cleared.
- Saving or removing Plaid keys logs `settings_updated` (entity `settings`) describing what changed, e.g. "environment: Sandbox → Production, secret changed", never the values.
- Adding a transaction as an expense logs the normal `expense_added`. Confirming income with a different amount logs `income_source_updated`; Add income logs `income_source_added`.
- A sync that changed the inbox (Sync now, scheduled or on opening the app) logs `plaid_sync_completed` (entity `plaid_transaction`, counts and source only). Changing the automatic sync schedule logs `settings_updated` with `section: 'plaid_auto_sync'`.
- Every inbox decision (add, match, confirm fixed expense, confirm income, add income, record or link a card payment, ignore, restore) logs `plaid_transaction_updated` with the action, e.g. "Matched bank transaction "Coffee Shop" ($25.50, 2026-10-12) to an existing expense". Recording a card payment also logs `credit_card_payment_added`; each bank row it linked logs `card_payment` with `creditCardPaymentId` and `side` (`card` or `funding`).
- Changing an account's mapping logs `plaid_account_updated`; a bank going into error logs `plaid_sync_failed` once (not on every retry).
- All Plaid events refresh open Bank Import modals and Financial page bank badges in other tabs.

## How banks differ

What a bank sends Plaid varies. As measured on the first two connected banks:

| | CIBC (credit card) | Wealthsimple (chequing, card) |
|---|---|---|
| Purchase date | Yes: expenses get the day you spent | No: expenses get the posting date (usually 1-2 days later); change it in the Add form if needed |
| Pending charges | Marked pending: yellow pill, green when settled | Sent as already settled: green pill at once |
| Balance includes pending charges | Yes (via available credit) | No: the balance lags new charges |
| Login | Username and password (no OAuth) | Username and password (no OAuth) |
| Card payment wording | Credit on the card: "PAYMENT THANK YOU/PAIEMEN T MERCI" | Credit on the card: "Credit Card Payment - From: Cash". On chequing the debit reads "Credit Card Payment", or "CIBC MASTERCARD - Bill payment" for a CIBC payment |

## Limitations

These are deferred to later phases (see the [roadmap](../../specs/plaid-bank-sync/spec.md)):

- **Connection alerts are in-app only:** a bank needing a new login is flagged in the app (header dot, notification), not by email or push, so it is noticed the next time the app is opened.
- **Not-spending rows:** transfers, investment contributions, loan payments and refunds can't be recorded from the inbox yet; ignore them. Credit card payments and income can be recorded or confirmed.
- **Card payments:** one debit paying two cards, or one card paid by two debits, isn't paired; amounts must match to the cent. See [Credit card payments](#credit-card-payments).
- **Bank changes after review:** a settled transaction the bank changes after you reviewed it is not followed. Pending charges are; see above. For Wealthsimple, whose pending charges arrive as settled, a later amount change isn't followed either.
- **Categories:** they come only from your own history for the place; Plaid's categories are not used.
- **Inbox conveniences:** no bulk actions and no count badge on the header icon.
- **Loan payments:** confirmed fixed expenses don't yet feed auto-logged loan payments (those still use the due day).
- **Medical, donation, insurance and reimbursement details** are not in the inline Add form. Add the expense, then edit it in the expense list to set people, insurance, receipts or a reimbursement. Its bank colour keeps comparing against the original charged amount.
- **Balances:** credit card balances are checked against the bank (see [Credit card balance check](#credit-card-balance-check)); investment, loan and line-of-credit balances are received but not yet shown or used.
- **No webhooks:** new transactions arrive with the next automatic sync, not instantly.
