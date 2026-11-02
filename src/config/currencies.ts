// The currencies the Currency converter offers (config/units.ts): those the European Central Bank
// publishes reference rates for (api/currency-rates.ts). One that a day's rates leave out shows no
// answer until it's back.

export const CURRENCIES: [code: string, name: string][] = [
  ['AUD', 'Australian dollar'], ['BGN', 'Bulgarian lev'], ['BRL', 'Brazilian real'], ['CAD', 'Canadian dollar'],
  ['CHF', 'Swiss franc'], ['CNY', 'Chinese yuan'], ['CZK', 'Czech koruna'], ['DKK', 'Danish krone'], ['EUR', 'euro'],
  ['GBP', 'pound sterling'], ['HKD', 'Hong Kong dollar'], ['HUF', 'Hungarian forint'], ['IDR', 'Indonesian rupiah'],
  ['ILS', 'Israeli new shekel'], ['INR', 'Indian rupee'], ['ISK', 'Icelandic króna'], ['JPY', 'Japanese yen'],
  ['KRW', 'South Korean won'], ['MXN', 'Mexican peso'], ['MYR', 'Malaysian ringgit'], ['NOK', 'Norwegian krone'],
  ['NZD', 'New Zealand dollar'], ['PHP', 'Philippine peso'], ['PLN', 'Polish złoty'], ['RON', 'Romanian leu'],
  ['SEK', 'Swedish krona'], ['SGD', 'Singapore dollar'], ['THB', 'Thai baht'], ['TRY', 'Turkish lira'],
  ['USD', 'US dollar'], ['ZAR', 'South African rand'],
];
