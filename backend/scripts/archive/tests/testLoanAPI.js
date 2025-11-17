const loanRepo = require('../repositories/loanRepository');

async function testAPI() {
  console.log('Testing loan API response...\n');
  
  const loans = await loanRepo.getAllWithCurrentBalances();
  
  console.log('Loans returned from API:');
  loans.forEach(loan => {
    console.log(`\n${loan.name}:`);
    console.log(`  ID: ${loan.id}`);
    console.log(`  Type: ${loan.loan_type}`);
    console.log(`  Current Balance: ${loan.currentBalance}`);
    console.log(`  Estimated Months Left: ${loan.estimated_months_left !== null ? loan.estimated_months_left : 'null'}`);
  });
  
  process.exit(0);
}

testAPI().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
