const fs = require('fs');
const path = require('path');

function getCliOption(optionName) {
  const prefix = `${optionName}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === optionName) {
      return process.argv[index + 1] || null;
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return null;
}

function buildCandidatePaths() {
  const cliPath = getCliOption('--items-path');
  const envPath = process.env.KAKEIBO_CREDIT_ITEMS_PATH;
  const candidates = [];

  if (cliPath) candidates.push(path.resolve(cliPath));
  if (envPath) candidates.push(path.resolve(envPath));

  candidates.push(path.join(__dirname, 'credit_card_items.json'));

  return [...new Set(candidates)];
}

function resolveCreditCardItemsPath() {
  const candidates = buildCandidatePaths();
  const itemsPath = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  return { itemsPath, candidates };
}

function getCreditCardItemsPathHelp() {
  return [
    '明細 JSON の指定方法:',
    '  1. --items-path <path>',
    '  2. 環境変数 KAKEIBO_CREDIT_ITEMS_PATH',
    `  3. ${path.join(__dirname, 'credit_card_items.json')}`,
  ].join('\n');
}

module.exports = {
  getCreditCardItemsPathHelp,
  resolveCreditCardItemsPath,
};