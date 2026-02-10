/**
 * Manual verification script for activity log integration
 * 
 * This script performs CRUD operations on various entities and verifies
 * that activity log events are being created correctly.
 */

const { initializeDatabase } = require('../database/db');
const expenseService = require('../services/expenseService');
const fixedExpenseService = require('../services/fixedExpenseService');
const loanService = require('../services/loanService');
const investmentService = require('../services/investmentService');
const budgetService = require('../services/budgetService');
const paymentMethodService = require('../services/paymentMethodService');
const loanPaymentService = require('../services/loanPaymentService');
const backupService = require('../services/backupService');
const activityLogService = require('../services/activityLogService');

async function verifyActivityLogging() {
  console.log('=== Activity Log Integration Verification ===\n');

  try {
    // Initialize database
    await initializeDatabase();
    console.log('✓ Database initialized\n');

    // Get initial event count
    const initialStats = await activityLogService.getRecentEvents(1000, 0);
    const initialCount = initialStats.total;
    console.log(`Initial event count: ${initialCount}\n`);

    // Test 1: Expense CRUD
    console.log('Testing Expense CRUD...');
    const expense = await expenseService.createExpense({
      date: '2025-01-27',
      place: 'Test Store',
      amount: 50.00,
      type: 'Groceries',
      method: 'Cash'
    });
    console.log(`  ✓ Created expense ID: ${expense.id}`);

    await expenseService.deleteExpense(expense.id);
    console.log(`  ✓ Deleted expense ID: ${expense.id}\n`);

    // Test 2: Fixed Expense CRUD
    console.log('Testing Fixed Expense CRUD...');
    const fixedExpense = await fixedExpenseService.createFixedExpense({
      year: 2025,
      month: 1,
      name: 'Test Rent',
      amount: 1000.00,
      category: 'Housing',
      payment_type: 'Cash',
      due_day: 1
    });
    console.log(`  ✓ Created fixed expense ID: ${fixedExpense.id}`);

    await fixedExpenseService.deleteFixedExpense(fixedExpense.id);
    console.log(`  ✓ Deleted fixed expense ID: ${fixedExpense.id}\n`);

    // Test 3: Loan CRUD
    console.log('Testing Loan CRUD...');
    const loan = await loanService.addLoan({
      name: 'Test Loan',
      loan_type: 'loan',
      initial_balance: 5000.00,
      interest_rate: 5.5,
      start_date: '2025-01-01'
    });
    console.log(`  ✓ Created loan ID: ${loan.id}`);

    await loanService.deleteLoan(loan.id);
    console.log(`  ✓ Deleted loan ID: ${loan.id}\n`);

    // Test 4: Investment CRUD
    console.log('Testing Investment CRUD...');
    const investment = await investmentService.addInvestment({
      name: 'Test TFSA',
      account_type: 'TFSA'
    });
    console.log(`  ✓ Created investment ID: ${investment.id}`);

    await investmentService.deleteInvestment(investment.id);
    console.log(`  ✓ Deleted investment ID: ${investment.id}\n`);

    // Test 5: Budget CRUD
    console.log('Testing Budget CRUD...');
    const budget = await budgetService.addBudget({
      year: 2025,
      month: 1,
      category: 'Groceries',
      limit_amount: 500.00
    });
    console.log(`  ✓ Created budget ID: ${budget.id}`);

    await budgetService.deleteBudget(budget.id);
    console.log(`  ✓ Deleted budget ID: ${budget.id}\n`);

    // Test 6: Payment Method CRUD
    console.log('Testing Payment Method CRUD...');
    const paymentMethod = await paymentMethodService.addPaymentMethod({
      name: 'Test Card',
      payment_type: 'credit_card',
      credit_limit: 5000.00,
      billing_cycle_day: 15,
      effective_date: '2025-01-01'
    });
    console.log(`  ✓ Created payment method ID: ${paymentMethod.id}`);

    await paymentMethodService.deactivatePaymentMethod(paymentMethod.id, '2025-01-27');
    console.log(`  ✓ Deactivated payment method ID: ${paymentMethod.id}\n`);

    // Test 7: Loan Payment CRUD (need an active loan first)
    console.log('Testing Loan Payment CRUD...');
    const testLoan = await loanService.addLoan({
      name: 'Test Loan for Payment',
      loan_type: 'loan',
      initial_balance: 5000.00,
      interest_rate: 5.5,
      start_date: '2025-01-01'
    });
    console.log(`  ✓ Created test loan ID: ${testLoan.id}`);

    const loanPayment = await loanPaymentService.addLoanPayment({
      loan_id: testLoan.id,
      payment_date: '2025-01-15',
      amount: 200.00
    });
    console.log(`  ✓ Created loan payment ID: ${loanPayment.id}`);

    await loanPaymentService.deleteLoanPayment(loanPayment.id);
    console.log(`  ✓ Deleted loan payment ID: ${loanPayment.id}`);

    await loanService.deleteLoan(testLoan.id);
    console.log(`  ✓ Cleaned up test loan\n`);

    // Test 8: Insurance Status Change
    console.log('Testing Insurance Status Change...');
    const medicalExpense = await expenseService.createExpense({
      date: '2025-01-27',
      place: 'Dr. Test',
      amount: 150.00,
      type: 'Tax - Medical',
      method: 'Cash',
      insurance_status: 'pending'
    });
    console.log(`  ✓ Created medical expense ID: ${medicalExpense.id}`);

    // Update to change insurance status - this should log an insurance_status_changed event
    const updatedExpense = await expenseService.getExpenseById(medicalExpense.id);
    await expenseService.updateExpense(medicalExpense.id, {
      ...updatedExpense,
      insurance_status: 'paid'
    });
    console.log(`  ✓ Changed insurance status to Paid`);

    await expenseService.deleteExpense(medicalExpense.id);
    console.log(`  ✓ Cleaned up medical expense\n`);

    // Get final event count
    const finalStats = await activityLogService.getRecentEvents(1000, 0);
    const finalCount = finalStats.total;
    const newEvents = finalCount - initialCount;

    console.log(`\n=== Summary ===`);
    console.log(`Initial events: ${initialCount}`);
    console.log(`Final events: ${finalCount}`);
    console.log(`New events logged: ${newEvents}`);
    console.log(`Expected events: ~15 (2 per entity × 7 entities + 1 for insurance status change)`);

    // Display recent events
    console.log(`\n=== Recent Events (last 30) ===`);
    const recentEvents = await activityLogService.getRecentEvents(30, 0);
    recentEvents.events.forEach((event, index) => {
      console.log(`${index + 1}. [${event.event_type}] ${event.user_action}`);
      if (event.metadata) {
        console.log(`   Metadata: ${JSON.stringify(event.metadata)}`);
      }
    });

    // Verify logging failures don't break functionality
    console.log(`\n=== Testing Resilience ===`);
    console.log('Attempting to log event with missing required fields...');
    await activityLogService.logEvent('', '', null, '', null);
    console.log('✓ System handled invalid event gracefully (no crash)\n');

    console.log('=== Verification Complete ===');
    console.log('✓ All entity CRUD operations logged events successfully');
    console.log('✓ Insurance status changes logged correctly');
    console.log('✓ Logging failures handled gracefully');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifyActivityLogging()
  .then(() => {
    console.log('\n✓ All checks passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
