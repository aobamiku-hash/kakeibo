const fs = require('fs');
const path = require('path');

function getCliOption(optionName) {
  const prefix = `${optionName}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === optionName) {
      const nextArg = process.argv[index + 1];
      if (!nextArg || nextArg.startsWith('--')) {
        throw new Error(`${optionName} の値が指定されていません。`);
      }
      return nextArg;
    }
    if (arg.startsWith(prefix)) {
      const value = arg.slice(prefix.length);
      if (!value) {
        throw new Error(`${optionName} の値が指定されていません。`);
      }
      return value;
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

  return {
    cliPath: cliPath ? path.resolve(cliPath) : null,
    candidates: [...new Set(candidates)],
  };
}

function resolveCreditCardItemsPath() {
  const { cliPath, candidates } = buildCandidatePaths();
  if (cliPath && !fs.existsSync(cliPath)) {
    throw new Error(`--items-path で指定した明細 JSON が見つかりません: ${cliPath}`);
  }

  if (cliPath) {
    return { itemsPath: cliPath, candidates };
  }

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