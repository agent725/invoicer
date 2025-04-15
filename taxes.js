var fs = require('fs');
var stdio = require('stdio');
var files;

var ops = stdio.getopt({
  'directory': {key: 'd', args: 1, description: 'Operating directory. Example: /home/user/invoices'},
  'frame': {key: 'f', args: 1, description: 'Timeframe within which to collect information. Example: 2025Q1'},
  'template': {key: 't', args: 1, description: 'Template file set. Examples: markup, html'}
});
const currentLocation = ops.directory.split('/').pop();
let pathmodifier = '/';
if (currentLocation === 'invoices' || currentLocation === 'expenses') pathmodifier = '/../';
const directory = `${ops.directory}${pathmodifier}`;
if(!fs.existsSync(`${directory}invoices`) ||!fs.existsSync(`${directory}expenses`)) {
  console.warn('[!] The directories ./invoices and ./expenses must exist, and this script can be run only in one of these directories or their root.');
  process.exit(1);
}

const invoicesSetup    = JSON.parse(fs.readFileSync(`${directory}invoices/${ops.template}.config`, 'utf8'));
const currency = invoicesSetup.currency;

// determine start and end date
function toSimpleDate(input) {
  return `${input.getDate()}-${input.getMonth()+1}-${input.getFullYear()}`;
}

// format number to two-decimal currency output
function formatNumber(n) {
  return String(n.toFixed(2)).replace(/\./g,'.')
}

// format tax object for display
function displayIncomeTaxes(taxes) {
  let outString = '';
  for (tax in taxes) {
    outString += `              [${tax}%]`+"\n";
    outString += `                ${currency} ${taxes[tax].net} net profit`+"\n";
    outString += `                ${currency} ${taxes[tax].tax} taxes`+"\n";
    // DEBUG: outString += `                ${JSON.stringify(taxes)}`+"\n";
  }
  return outString;
}

function displayExpenseTaxes(taxes) {
  let outString = '';
  for (tax in taxes) {
    outString += `              [${tax}%]`+"\n";
    outString += `                ${currency} ${taxes[tax]}`+"\n";
  }
  return outString;
}

const frame = ops.frame.toUpperCase();
let timeFrame, QorY;
if (frame.indexOf('Q') > -1) {
  QorY = 'Q';
  timeFrame = frame.split(QorY)[1];
} else {
  QorY = 'Y';
  timeFrame = QorY;
}
const year = frame.split(QorY)[0];
let frameStart, frameEnd;
switch (timeFrame) {
  case '1':
    frameStart = new Date(year,0,1);
    frameEnd = new Date(year,2,31);
    break;
  case '2':
    frameStart = new Date(year,3,1);
    frameEnd = new Date(year,5,30);
    break;
  case '3':
    frameStart = new Date(year,6,1);
    frameEnd = new Date(year,8,30);
    break;
  case '4':
    frameStart = new Date(year,9,1);
    frameEnd = new Date(year,11,31);
    break;
  case 'Y':
    frameStart = new Date(year,0,1);
    frameEnd = new Date(year,11,31);
    break;
}
if (!frameStart || !frameEnd) {
  console.warn(`[!] Illegal quarter entered for year ${year}. Please enter a number from 1 to 4.`);
  process.exit(1);
}

console.warn(`[i] Calculating taxes from ${toSimpleDate(frameStart)} to ${toSimpleDate(frameEnd)}.`);

function calculateInvoice(invoicesData) {
  let line, invoices = {
    id:invoicesData.invoicesId,
    subtotal:0,
    taxes:{},
    total:0
  }  
  for(i=0;i<invoicesData.list.length;i++) {
    line  = invoicesData.list[i];
    invoices.subtotal = invoices.subtotal+(line.cost*line.qty);
    if(typeof line.tax==='undefined' || isNaN(line.tax)) { line.tax = invoicesSetup.taxdefault; }
    if (!invoices.taxes.hasOwnProperty(line.tax)) invoices.taxes[line.tax] = { tax:0, net:0 };
    invoices.taxes[line.tax].net += line.cost * line.qty;
    invoices.taxes[line.tax].tax += invoices.taxes[line.tax].net * (line.tax/100);
  }
  for (const taxline in invoices.taxes) {
    invoices.total += invoices.subtotal+invoices.taxes[taxline].tax;
  }
  
  // format totals
  invoices.total = formatNumber(invoices.total);
  invoices.subtotal = formatNumber(invoices.subtotal);
  Object.keys(invoices.taxes).forEach( function(key, index) {
    invoices.taxes[key].net = formatNumber(invoices.taxes[key].net);
    invoices.taxes[key].tax = formatNumber(invoices.taxes[key].tax);
  });

  return invoices;
}

function calculateExpenses(expenseData) {
  let line, expense = {
    id:expenseData.expenseId,
    subtotal:0,
    taxes:{},
    total:0
  }  
  for(i=0;i<expenseData.length;i++) {
    line  = expenseData[i];
    expense.subtotal += line.subtotal;
    if(typeof line.tax==='undefined' || isNaN(line.tax)) { line.tax = invoicesSetup.taxdefault; }
    if (!expense.taxes.hasOwnProperty(line.tax)) expense.taxes[line.tax] = 0;
    expense.taxes[line.tax] += (line.subtotal*(line.tax/100));
  }
  for (const taxline in expense.taxes) {
    expense.total += expense.subtotal+expense.taxes[taxline];
  }
  // format totals
  expense.total = formatNumber(expense.total);
  expense.subtotal = formatNumber(expense.subtotal);
  Object.keys(expense.taxes).forEach( function(key, index) { expense.taxes[key] = formatNumber(expense.taxes[key]); });
  return expense;
}

// calculate total income 
files = fs.readdirSync(`${directory}invoices`);
let income = {
  invoices:0,
  subtotal:0,
  taxes:{},
  taxtotal:0,
  total:0
}
for (const file of files) {
  if (file.endsWith('.json')) {  // read every invoice here and add up their totals
    const invoicesData = JSON.parse(fs.readFileSync(`${directory}invoices/${file}`, 'utf8'));
    if (invoicesData.hasOwnProperty('dateIssued')) {
      const dateIssued = new Date(invoicesData.dateIssued);
      if (dateIssued>frameStart && dateIssued<frameEnd) {
        //console.warn(file);
        //console.warn(JSON.stringify(invoicesData));
        //console.warn( JSON.stringify( calculateInvoice(invoicesData) ) );
        const invoicesTotals = calculateInvoice(invoicesData);
        income.invoices ++;
        income.subtotal += Number(invoicesTotals.subtotal);
        income.total += Number(invoicesTotals.total);
        Object.keys(invoicesTotals.taxes).forEach( function(key, index) {
          if (!income.taxes.hasOwnProperty(key)) income.taxes[key] = { net:0, tax:0 };
          income.taxes[key].net += Number(invoicesTotals.taxes[key].net);
          income.taxes[key].tax += Number(invoicesTotals.taxes[key].tax);
          income.taxtotal += income.taxes[key].tax;
        });
      }
    }
  }
}

// calculate total expenses
files = fs.readdirSync(`${directory}expenses`);
let expenses = {
  bills:0,
  subtotal:0,
  taxes:{},
  taxtotal:0,
  total:0
}
for (const file of files) {
  if (file.endsWith('.json')) {  // read all expenses here and add up their totals
    const expensesData = JSON.parse(fs.readFileSync(`${directory}expenses/${file}`, 'utf8'));
    const expensesInFrame = [];
    if (expensesData.hasOwnProperty('list') && Array.isArray(expensesData.list)) {
      for (const expense of expensesData.list) {
        if (expense.hasOwnProperty('dateIssued')) {
          const dateIssued = new Date(expense.dateIssued);
          if (dateIssued>frameStart && dateIssued<frameEnd) {
            expensesInFrame.push(expense);
          }
        }
      }
    }
    //console.warn(file);
    //console.warn(JSON.stringify(expensesData));
    //console.warn( JSON.stringify( calculateExpenses(expensesInFrame) ) );
    const expenseTotals = calculateExpenses(expensesInFrame);
    if (expensesInFrame.length > 0) expenses.bills ++;
    expenses.subtotal += Number(expenseTotals.subtotal);
    expenses.total += Number(expenseTotals.total);
    Object.keys(expenseTotals.taxes).forEach( function(key, index) {
      if (!expenses.taxes.hasOwnProperty(key)) expenses.taxes[key] = 0;
      expenses.taxes[key] += Number(expenseTotals.taxes[key]);
      expenses.taxtotal += expenses.taxes[key];
    });
  }
}

console.warn( "\n\nINCOME \n\n"+
              `  Invoices: ${income.invoices}\n\n`+
              `  Subtotal: ${currency} ${formatNumber(income.subtotal)}\n`+
              `  Taxes:    ${currency} ${formatNumber(income.taxtotal)}\n${displayIncomeTaxes(income.taxes)}\n`+
              `  Total:    ${currency} ${formatNumber(income.total)}\n`
            );

console.warn( "\nEXPENSES \n\n"+
              `  Bills:    ${expenses.bills}\n\n`+
              `  Subtotal: ${currency} ${formatNumber(expenses.subtotal)}\n`+
              `  Taxes:    ${currency} ${formatNumber(expenses.taxtotal)}\n${displayExpenseTaxes(expenses.taxes)}\n`+
              `  Total:    ${currency} ${formatNumber(expenses.total)}\n`
            );

console.warn( "\nRESULTS \n\n"+
              `  Net profit:   ${currency} ${formatNumber(income.subtotal - expenses.subtotal)}\n`+
              `  Gross profit: ${currency} ${formatNumber(income.total - expenses.total)}\n`+
              `  Tax owed:     ${currency} ${formatNumber(income.taxtotal - expenses.taxtotal)}\n`
            );
