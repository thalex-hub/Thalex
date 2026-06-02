const formatCurrencyInput = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const sValue = value.toString();
  const clean = sValue.replace(/\./g, '').replace(',', '.'); 
  const numValue = Number(clean);
  if (isNaN(numValue)) return '';
  return sValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseCurrencyInput = (value) => {
  if (!value) return '';
  const clean = value.replace(/\./g, '').replace(',', '.');
  return clean;
};

let val = formatCurrencyInput(8500000);
console.log("format 8500000 ->", val);
// When user edits to 8.500.000 it is parsed:
let parsed = parseCurrencyInput("8.500.000");
console.log("parse 8.500.000 ->", parsed);
console.log("number ->", Number(parsed));

// Type 10000000
parsed = parseCurrencyInput("10.000.000");
console.log("parse 10.000.000 ->", parsed);
console.log("number ->", Number(parsed));
