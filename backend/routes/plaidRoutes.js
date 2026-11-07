const express = require('express');
const router = express.Router();
const plaidController = require('../controllers/plaidController');
const { isEnabled } = require('../config/plaid');

// Status and settings always answer: the UI needs them to show and fix an incomplete configuration
router.get('/status', plaidController.getStatus);
router.get('/settings', plaidController.getSettings);
router.put('/settings', plaidController.saveSettings);
router.post('/settings/test', plaidController.testSettings);
router.delete('/settings', plaidController.clearSettings);

router.use((req, res, next) => {
  if (!isEnabled()) {
    return res.status(503).json({ error: 'Plaid integration is not configured. Add your keys in Settings → Bank Import.' });
  }
  next();
});

router.post('/link-token', plaidController.createLinkToken);
router.get('/items', plaidController.listItems);
router.post('/items', plaidController.connectItem);
router.post('/items/:id/reconnected', plaidController.reconnectedItem);
router.post('/items/:id/refresh', plaidController.refreshItem);
router.delete('/items/:id', plaidController.disconnectItem);
router.put('/accounts/:id', plaidController.updateAccount);
router.post('/accounts/:id/import-file', plaidController.importBankFile);
router.post('/sync', plaidController.sync);
router.get('/card-balances', plaidController.getCardBalances);
router.post('/card-balances/:id/use-bank-limit', plaidController.useBankCreditLimit);
router.get('/sync-settings', plaidController.getSyncSettings);
router.put('/sync-settings', plaidController.saveSyncSettings);
router.get('/inbox', plaidController.getInbox);
router.post('/inbox/:id/add', plaidController.addAsExpense);
router.post('/inbox/:id/match', plaidController.matchToExpense);
router.post('/inbox/:id/match-fixed', plaidController.matchToFixedExpense);
router.post('/inbox/:id/match-income', plaidController.matchToIncome);
router.post('/inbox/:id/add-income', plaidController.addAsIncome);
router.post('/inbox/:id/card-payment', plaidController.cardPayment);
router.post('/inbox/:id/cancelled', plaidController.resolveCancelled);
router.post('/inbox/:id/ignore', plaidController.ignore);
router.post('/inbox/:id/unignore', plaidController.unignore);

module.exports = router;
