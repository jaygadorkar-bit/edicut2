'use client';

import * as React from 'react';
import { useStore } from '@tanstack/react-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFormField, useFieldContext } from '@/components/ui/form-context';

type BaseFieldProps = {
  label?: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
};

function FieldShell({
  label,
  description,
  children,
}: BaseFieldProps & { children: React.ReactNode }) {
  const field = useFieldContext();

  return (
    <div className='flex flex-col gap-2'>
      {label ? <Label htmlFor={field.formItemId}>{label}</Label> : null}
      {children}
      {description ? (
        <p id={field.formDescriptionId} className='text-muted-foreground text-sm'>
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TextField({ label, description, placeholder }: BaseFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value);

  return (
    <FieldShell label={label} description={description}>
      <Input
        id={field.formItemId}
        value={String(value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

function TextareaField({ label, description, placeholder }: BaseFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value);

  return (
    <FieldShell label={label} description={description}>
      <textarea
        id={field.formItemId}
        className='border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'
        value={String(value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

function SelectField({ label, description, placeholder, options = [] }: BaseFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value);

  return (
    <FieldShell label={label} description={description}>
      <select
        id={field.formItemId}
        className='border-input focus-visible:border-ring rounded-md border px-3 py-2 text-sm outline-none'
        value={String(value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      >
        <option value=''>{placeholder ?? 'Select an option'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function CheckboxField({ label, description }: BaseFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value);

  return (
    <FieldShell description={description}>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={field.formItemId}
          checked={Boolean(value)}
          onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
          onBlur={field.handleBlur}
        />
        {label ? <Label htmlFor={field.formItemId}>{label}</Label> : null}
      </div>
    </FieldShell>
  );
}

function SwitchField(props: BaseFieldProps) {
  return <CheckboxField {...props} />;
}

function RadioGroupField({ label, description, options = [] }: BaseFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value);

  return (
    <FieldShell label={label} description={description}>
      <div className='flex flex-col gap-2'>
        {options.map((option) => (
          <label key={option.value} className='flex items-center gap-2 text-sm'>
            <input
              type='radio'
              name={field.name}
              value={option.value}
              checked={value === option.value}
              onBlur={field.handleBlur}
              onChange={() => field.handleChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </FieldShell>
  );
}

function SliderField({ label, description, min = 0, max = 100, step = 1 }: BaseFieldProps) {
  const field = useFieldContext();
  const fieldValue = useStore(field.store, (state) => state.value);
  const value = typeof fieldValue === 'number' ? fieldValue : min;

  return (
    <FieldShell label={label} description={description}>
      <Input
        id={field.formItemId}
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(Number(event.target.value))}
      />
    </FieldShell>
  );
}

function FileUploadField({ label, description }: BaseFieldProps) {
  const field = useFieldContext();

  return (
    <FieldShell label={label} description={description}>
      <Input
        id={field.formItemId}
        type='file'
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.files?.[0] ?? null)}
      />
    </FieldShell>
  );
}

const FormTextField = createFormField(TextField);
const FormTextareaField = createFormField(TextareaField);
const FormSelectField = createFormField(SelectField);
const FormCheckboxField = createFormField(CheckboxField);
const FormSwitchField = createFormField(SwitchField);
const FormRadioGroupField = createFormField(RadioGroupField);
const FormSliderField = createFormField(SliderField);
const FormFileUploadField = createFormField(FileUploadField);

export {
  TextField,
  TextareaField,
  SelectField,
  CheckboxField,
  SwitchField,
  RadioGroupField,
  SliderField,
  FileUploadField,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormCheckboxField,
  FormSwitchField,
  FormRadioGroupField,
  FormSliderField,
  FormFileUploadField,
};
