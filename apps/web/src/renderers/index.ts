import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import { TextInput, textInputTester } from './TextInput';

// The P0 renderer registry: one real string->UI5 Input renderer. The full
// ComboBox/MultiComboBox/AnalyticalTable toolkit + e.detail payloads are P2.
export const ui5Renderers: JsonFormsRendererRegistryEntry[] = [
  { tester: textInputTester, renderer: TextInput },
];

export { Ui5ControlWrapper } from './Ui5ControlWrapper';
