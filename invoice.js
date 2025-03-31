var fs = require('fs');
var stdio = require('stdio');

// make global for ease of implementation (for now)
invoice = {
  output:'',
  subtotal:0,
  taxes:0,
  total:0
}

var ops = stdio.getopt({
  'input': {key: 'i', args: 1, description: 'Input file with billing information.'},
  'template': {key: 't', args: 1, description: 'Template file set. Examples: markup, html'}
});
if (ops.input) { var input = ops.input; }
invoice.billing  = JSON.parse(fs.readFileSync(input, 'utf8'));
invoice.setup    = JSON.parse(fs.readFileSync(ops.template+'.config', 'utf8'));
if (typeof invoice.setup.pricedot==='undefined') { invoice.setup.pricedot = ','; }

if (ops.template) { invoice.setup.type = ops.template; } else { invoice.setup.type = 'markup'; }
invoice.template = fs.readFileSync(invoice.setup.type+'.template', 'utf8');
invoice.table    = JSON.parse(fs.readFileSync(invoice.setup.type+'.table', 'utf8'));

// dates calculation
var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
var dateIssued = invoice.billing.dateIssued.split('.');
invoice.dateIssued = new Date(dateIssued[0],(dateIssued[1]-1),dateIssued[2]);
invoice.dateDue = new Date(Math.round(Math.abs(invoice.dateIssued.getTime()+(invoice.billing.daysDue*oneDay))));

// create table of items
var table = String(invoice.table.head);
var line;
for(i=0;i<invoice.billing.list.length;i++) {
  line  = invoice.billing.list[i];
  if(typeof line.detailA === 'undefined') { line.detailA=''; }
  if(typeof line.detailB === 'undefined') { line.detailB=''; }
  if(typeof line.detailC === 'undefined') { line.detailC=''; }
  table = table+replaceBulk(invoice.table.body,
                ['{{table_item}}','{{table_detailA}}','{{table_detailB}}','{{table_detailC}}','{{table_cost}}','{{table_qty}}','{{table_unit}}','{{table_tax}}','{{table_price}}'],
                [line.item,line.detailA,line.detailB,line.detailC,
                 formatNumber(line.cost),
                 line.qty,line.unit,
                 line.tax,
                 formatNumber(line.cost*line.qty)
                ]);
  invoice.subtotal = invoice.subtotal+(line.cost*line.qty);
  if(typeof line.tax==='undefined' || isNaN(line.tax)) { line.tax = invoice.setup.taxdefault; }
  invoice.taxes = invoice.taxes+((line.cost*line.qty)*(line.tax/100));
}
invoice.total = invoice.subtotal+invoice.taxes;

// format totals
invoice.total = formatNumber(invoice.total);
invoice.subtotal = formatNumber(invoice.subtotal);
invoice.taxes = formatNumber(invoice.taxes);


table = table+replaceBulk(String(invoice.table.foot),
              ['{{table_taxes}}','{{table_subtotal}}','{{table_total}}'],
              [invoice.taxes,invoice.subtotal,invoice.total]);
  
var dateIssued = {
      y:invoice.dateIssued.getFullYear(),
      m:('00'+(invoice.dateIssued.getMonth()+1)).slice(-2),
      d:('00'+invoice.dateIssued.getDate()).slice(-2)
    }
    
var dateDue = {
      y:invoice.dateDue.getFullYear(),
      m:('00'+(invoice.dateDue.getMonth()+1)).slice(-2),
      d:('00'+invoice.dateDue.getDate()).slice(-2)
    }

invoice.output = invoice.output+replaceBulk(String(invoice.template),
                 ['{{payeeCompany}}','{{invoiceId}}','{{dateIssuedYear}}','{{dateIssuedMonth}}','{{dateIssuedDay}}','{{dateDueYear}}','{{dateDueMonth}}','{{dateDueDay}}','{{payeeId}}','{{payeeReg}}','{{payeeAccount}}','{{payeeEmail}}','{{payeeStreet}}','{{payeeZip}}','{{payeeCity}}','{{payeeCountry}}'],
                 [invoice.setup.payeeCompany,invoice.billing.invoiceId,dateIssued.y,dateIssued.m,dateIssued.d,dateDue.y,dateDue.m,dateDue.d,invoice.setup.payeeId,invoice.setup.payeeReg,invoice.setup.payeeAccount,invoice.setup.payeeEmail,invoice.setup.payeeStreet,invoice.setup.payeeZip,invoice.setup.payeeCity,invoice.setup.payeeCountry]);

invoice.output = invoice.output.replace('{{invoiceTable}}',table);

invoice.output = replaceBulk(invoice.output,
                 ['{{clientId}}','{{clientReg}}','{{clientContact}}','{{clientEmail}}','{{clientStreet}}','{{clientZip}}','{{clientCity}}','{{clientCountry}}'],
                 [invoice.billing.clientId,invoice.billing.clientReg,invoice.billing.clientContact,invoice.billing.clientEmail,invoice.billing.clientStreet,invoice.billing.clientZip,invoice.billing.clientCity,invoice.billing.clientCountry]);

invoice.output = replaceBulk(invoice.output,
              ['{{taxes}}','{{subtotal}}','{{total}}'],
              [invoice.taxes,invoice.subtotal,invoice.total]);

if (ops.template) {
  var path = require('path').dirname(ops.template);
  invoice.output = invoice.output.replace('{{PATH}}',path);
}

console.log(invoice.output);

//
// helper functions
//

function replaceBulk( str, findArray, replaceArray ){
  var i, regex = [], map = {}; 
  for( i=0; i<findArray.length; i++ ){ 
    regex.push( findArray[i].replace(/([-[\]{}()*+?.\\^$|#,])/g,'\\$1') );
    map[findArray[i]] = replaceArray[i]; 
  }
  regex = regex.join('|');
  str = str.replace( new RegExp( regex, 'g' ), function(matched){
    return map[matched];
  });
  return str;
}

function formatNumber(n) {
  return String(n.toFixed(2)).replace(/\./g,invoice.setup.pricedot)
}
