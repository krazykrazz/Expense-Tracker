const { getDatabase } = require('../database/db');
const loanBalanceService = require('../services/loanBalanceService');

async function checkMortgageCalculation() {
  console.log('=== Mortgage Loan Calculation Check ===\n');

  try {
    const db = await getDatabase();

    // Find mortgage loan(s)
    const loans = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM loans WHERE LOWER(name) LIKE '%mortgage%' ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (loans.length === 0) {
      console.log('No mortgage loans found in the database.');
      console.log('\nSearching for all loans...\n');
      
      const allLoans = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM loans ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (allLoans.length === 0) {
        console.log('No loans found in the database.');
        return;
      }

      console.log('Available loans:');
      allLoans.forEach(loan => {
        console.log(`  - ${loan.name} (ID: ${loan.id}, Type: ${loan.loan_type})`);
      });
      return;
    }

    for (const loan of loans) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Loan: ${loan.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`ID: ${loan.id}`);
      console.log(`Type: ${loan.loan_type}`);
      console.log(`Initial Balance: $${loan.initial_balance.toLocaleString()}`);
      console.log(`Start Date: ${loan.start_date}`);
      console.log(`Current Estimated Months Left: ${loan.estimated_months_left || 'N/A'}`);
      console.log(`Paid Off: ${loan.is_paid_off ? 'Yes' : 'No'}`);

      // Get balance history
      const balanceHistory = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM loan_balances WHERE loan_id = ? ORDER BY year ASC, month ASC`,
          [loan.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      console.log(`\nBalance History (${balanceHistory.length} entries):`);
      
      if (balanceHistory.length === 0) {
        console.log('  No balance entries found.');
        console.log('  → Add balance entries to calculate estimated months left');
      } else {
        console.log('\n  Date       | Balance      | Rate  | Monthly Change');
        console.log('  ' + '-'.repeat(55));
        
        balanceHistory.forEach((entry, index) => {
          const dateStr = `${entry.year}-${entry.month.toString().padStart(2, '0')}`;
          const balanceStr = `$${entry.remaining_balance.toLocaleString()}`.padEnd(12);
          const rateStr = `${entry.rate}%`.padEnd(5);
          
          let changeStr = '';
          if (index > 0) {
            const prevBalance = balanceHistory[index - 1].remaining_balance;
            const change = entry.remaining_balance - prevBalance;
            const monthsDiff = (entry.year - balanceHistory[index - 1].year) * 12 + 
                              (entry.month - balanceHistory[index - 1].month);
            const monthlyChange = change / monthsDiff;
            changeStr = monthlyChange < 0 ? 
              `-$${Math.abs(monthlyChange).toLocaleString(undefined, {maximumFractionDigits: 2})}` : 
              `+$${monthlyChange.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
          }
          
          console.log(`  ${dateStr} | ${balanceStr} | ${rateStr} | ${changeStr}`);
        });

        // Calculate manually
        const currentBalance = balanceHistory[balanceHistory.length - 1].remaining_balance;
        const estimatedMonths = loanBalanceService.calculateEstimatedMonths(
          balanceHistory,
          currentBalance
        );

        console.log('\n' + '='.repeat(60));
        console.log('CALCULATION BREAKDOWN:');
        console.log('='.repeat(60));

        if (balanceHistory.length < 2) {
          console.log('❌ Not enough data (need at least 2 balance entries)');
        } else {
          // Calculate average paydown
          let totalPaydown = 0;
          let monthCount = 0;

          console.log('\nMonthly Paydown Analysis:');
          for (let i = 1; i < balanceHistory.length; i++) {
            const prev = balanceHistory[i - 1];
            const curr = balanceHistory[i];
            
            const monthsDiff = (curr.year - prev.year) * 12 + (curr.month - prev.month);
            const balanceChange = prev.remaining_balance - curr.remaining_balance;
            const monthlyPaydown = balanceChange / monthsDiff;
            
            console.log(`  ${prev.year}-${prev.month.toString().padStart(2, '0')} → ${curr.year}-${curr.month.toString().padStart(2, '0')}: $${balanceChange.toLocaleString()} over ${monthsDiff} month(s) = $${monthlyPaydown.toLocaleString(undefined, {maximumFractionDigits: 2})}/month`);
            
            if (monthlyPaydown > 0) {
              totalPaydown += monthlyPaydown;
              monthCount++;
            }
          }

          if (monthCount > 0) {
            const avgMonthlyPaydown = totalPaydown / monthCount;
            console.log(`\nAverage Monthly Paydown: $${avgMonthlyPaydown.toLocaleString(undefined, {maximumFractionDigits: 2})}`);
            console.log(`Current Balance: $${currentBalance.toLocaleString()}`);
            console.log(`\nEstimated Months Left: ${currentBalance} ÷ ${avgMonthlyPaydown.toFixed(2)} = ${estimatedMonths} months`);
            
            if (estimatedMonths) {
              const years = Math.floor(estimatedMonths / 12);
              const months = estimatedMonths % 12;
              console.log(`                      = ${years} year(s) and ${months} month(s)`);
              
              // Calculate estimated payoff date
              const lastEntry = balanceHistory[balanceHistory.length - 1];
              const payoffDate = new Date(lastEntry.year, lastEntry.month - 1);
              payoffDate.setMonth(payoffDate.getMonth() + estimatedMonths);
              console.log(`\nEstimated Payoff Date: ${payoffDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`);
            }
          } else {
            console.log('\n❌ No positive paydown trend detected');
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMortgageCalculation();
