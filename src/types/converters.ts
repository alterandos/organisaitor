// Converters (components/ConverterPane): the built-in unit converters (config/units.ts) and the
// person's own (this file), which sync (`converters`). A custom converter is named inputs, each
// with a unit, worked into one output by a formula (utils/formula.ts, mathjs syntax). With one
// input and a formula back (`inverse`, in terms of the output's key) it works both ways.

export type ConverterId = string & { readonly _brand: 'ConverterId' };

export interface ConverterField {
  key:   string;   // its name in a formula: a letter or word (co2, kg, x)
  label: string;
  unit:  string;
}

export interface CustomConverter {
  id:        ConverterId;
  name:      string;
  icon:      string | null;
  inputs:    ConverterField[];
  output:    ConverterField;
  formula:   string;          // the output from the inputs
  inverse:   string | null;   // the input from the output (one input only)
  createdAt: string;
  updatedAt: string;
}
