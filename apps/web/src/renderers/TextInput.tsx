import { Input } from '@ui5/webcomponents-react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isStringControl, type ControlProps } from '@jsonforms/core';
import { Ui5ControlWrapper } from './Ui5ControlWrapper';

// One real renderer: JSONForms string control -> UI5 Input. Bound on `onInput`
// (UI5 fires input on every keystroke) and pushed back via JSONForms handleChange.
function TextInputControl({ data, handleChange, path, label, required, errors, enabled }: ControlProps) {
  return (
    <Ui5ControlWrapper label={label} required={required} errors={errors}>
      {(field) => (
        <Input
          value={(data as string) ?? ''}
          disabled={enabled === false}
          valueState={field.valueState}
          valueStateMessage={field.valueStateMessage}
          onInput={(e) => handleChange(path, (e.target as unknown as { value: string }).value)}
        />
      )}
    </Ui5ControlWrapper>
  );
}

export const TextInput = withJsonFormsControlProps(TextInputControl);
export const textInputTester = rankWith(2, isStringControl);
