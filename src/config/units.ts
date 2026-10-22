import { LABELS } from '@/config/labels';

// The built-in unit converters (components/ConverterPane): each category's units as a factor to
// its base unit, or (temperature) a way there and back. A new unit is one entry here; a new
// category is one entry, plus its name in LABELS.converters.categories.

export interface Unit {
  id:     string;
  symbol: string;
  name:   string;
  factor?: number;                      // base units in one of this
  toBase?:   (v: number) => number;     // when it isn't a plain factor (temperature)
  fromBase?: (v: number) => number;
}

// `pair`: the units a new conversion starts with (metric to the common other one).
export interface UnitCategory { id: keyof typeof LABELS.converters.categories; pair: [string, string]; units: Unit[] }

const u = (id: string, symbol: string, name: string, factor: number): Unit => ({ id, symbol, name, factor });

export const UNIT_CATEGORIES: UnitCategory[] = [
  { id: 'length', pair: ['m', 'ft'], units: [
    u('mm', 'mm', 'millimetre', 0.001), u('cm', 'cm', 'centimetre', 0.01), u('m', 'm', 'metre', 1), u('km', 'km', 'kilometre', 1000),
    u('in', 'in', 'inch', 0.0254), u('ft', 'ft', 'foot', 0.3048), u('yd', 'yd', 'yard', 0.9144), u('mi', 'mi', 'mile', 1609.344), u('nmi', 'nmi', 'nautical mile', 1852),
  ] },
  { id: 'area', pair: ['m2', 'ft2'], units: [
    u('mm2', 'mm²', 'square millimetre', 1e-6), u('cm2', 'cm²', 'square centimetre', 1e-4), u('m2', 'm²', 'square metre', 1),
    u('ha', 'ha', 'hectare', 1e4), u('km2', 'km²', 'square kilometre', 1e6), u('in2', 'in²', 'square inch', 0.00064516),
    u('ft2', 'ft²', 'square foot', 0.09290304), u('yd2', 'yd²', 'square yard', 0.83612736), u('acre', 'ac', 'acre', 4046.8564224), u('mi2', 'mi²', 'square mile', 2589988.110336),
  ] },
  { id: 'volume', pair: ['l', 'gal'], units: [
    u('ml', 'mL', 'millilitre', 0.001), u('l', 'L', 'litre', 1), u('m3', 'm³', 'cubic metre', 1000),
    u('tsp', 'tsp', 'teaspoon (US)', 0.00492892159375), u('tbsp', 'tbsp', 'tablespoon (US)', 0.01478676478125), u('floz', 'fl oz', 'fluid ounce (US)', 0.0295735295625),
    u('cup', 'cup', 'cup (US)', 0.2365882365), u('pt', 'pt', 'pint (US)', 0.473176473), u('qt', 'qt', 'quart (US)', 0.946352946),
    u('gal', 'gal', 'gallon (US)', 3.785411784), u('galuk', 'gal (UK)', 'gallon (UK)', 4.54609),
  ] },
  { id: 'mass', pair: ['kg', 'lb'], units: [
    u('mg', 'mg', 'milligram', 1e-6), u('g', 'g', 'gram', 0.001), u('kg', 'kg', 'kilogram', 1), u('t', 't', 'tonne', 1000),
    u('oz', 'oz', 'ounce', 0.028349523125), u('lb', 'lb', 'pound', 0.45359237), u('st', 'st', 'stone', 6.35029318),
  ] },
  { id: 'temperature', pair: ['c', 'f'], units: [
    { id: 'c', symbol: '°C', name: 'Celsius', toBase: (v) => v, fromBase: (v) => v },
    { id: 'f', symbol: '°F', name: 'Fahrenheit', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
    { id: 'k', symbol: 'K', name: 'kelvin', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  ] },
  { id: 'speed', pair: ['kmh', 'mph'], units: [
    u('mps', 'm/s', 'metre per second', 1), u('kmh', 'km/h', 'kilometre per hour', 1 / 3.6), u('mph', 'mph', 'mile per hour', 0.44704),
    u('kn', 'kn', 'knot', 1852 / 3600), u('fps', 'ft/s', 'foot per second', 0.3048),
  ] },
  { id: 'time', pair: ['min', 'h'], units: [
    u('ms', 'ms', 'millisecond', 0.001), u('s', 's', 'second', 1), u('min', 'min', 'minute', 60), u('h', 'h', 'hour', 3600),
    u('d', 'd', 'day', 86400), u('wk', 'wk', 'week', 604800), u('yr', 'yr', 'year (365.25 days)', 31557600),
  ] },
  { id: 'data', pair: ['MB', 'GB'], units: [
    u('bit', 'bit', 'bit', 0.125), u('B', 'B', 'byte', 1), u('kB', 'kB', 'kilobyte', 1e3), u('MB', 'MB', 'megabyte', 1e6), u('GB', 'GB', 'gigabyte', 1e9), u('TB', 'TB', 'terabyte', 1e12),
    u('KiB', 'KiB', 'kibibyte', 1024), u('MiB', 'MiB', 'mebibyte', 1024 ** 2), u('GiB', 'GiB', 'gibibyte', 1024 ** 3),
  ] },
  { id: 'energy', pair: ['kcal', 'kj'], units: [
    u('j', 'J', 'joule', 1), u('kj', 'kJ', 'kilojoule', 1000), u('cal', 'cal', 'calorie', 4.184), u('kcal', 'kcal', 'kilocalorie', 4184),
    u('wh', 'Wh', 'watt-hour', 3600), u('kwh', 'kWh', 'kilowatt-hour', 3.6e6), u('btu', 'BTU', 'British thermal unit', 1055.05585262), u('ev', 'eV', 'electronvolt', 1.602176634e-19),
  ] },
  { id: 'pressure', pair: ['kpa', 'psi'], units: [
    u('pa', 'Pa', 'pascal', 1), u('kpa', 'kPa', 'kilopascal', 1000), u('bar', 'bar', 'bar', 1e5), u('atm', 'atm', 'atmosphere', 101325),
    u('psi', 'psi', 'pound per square inch', 6894.757293168), u('mmhg', 'mmHg', 'millimetre of mercury', 133.322387415),
  ] },
];

export const unitCategory = (id: string): UnitCategory | undefined => UNIT_CATEGORIES.find((c) => c.id === id);
