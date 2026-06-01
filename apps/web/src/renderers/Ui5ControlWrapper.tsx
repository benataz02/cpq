import type { ReactElement, ReactNode } from 'react';
import { Label } from '@ui5/webcomponents-react';

// UI5 web components v2 type valueState as a string-literal union, not an enum.
type Ui5ValueState = 'None' | 'Negative';

export interface Ui5FieldState {
  valueState: Ui5ValueState;
  // value-state messages render into a UI5 slot, which accepts an element (not a raw string).
  valueStateMessage?: ReactElement;
}

export interface Ui5ControlWrapperProps {
  label: string;
  required?: boolean;
  errors?: string;
  children: (field: Ui5FieldState) => ReactNode;
}

// Maps JSONForms control metadata (label/required) and errors onto the UI5
// value-state contract, handing the computed state to the concrete control via
// a render prop. The single seam every UI5 renderer reuses.
export function Ui5ControlWrapper({ label, required, errors, children }: Ui5ControlWrapperProps) {
  const hasError = Boolean(errors);
  const field: Ui5FieldState = {
    valueState: hasError ? 'Negative' : 'None',
    valueStateMessage: hasError ? <span>{errors}</span> : undefined,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBlockEnd: '0.75rem' }}>
      <Label required={required}>{label}</Label>
      {children(field)}
    </div>
  );
}
