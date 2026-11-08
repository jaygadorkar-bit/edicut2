import { Select } from "./Select";

export type FormSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** Compatibility API for project forms; menus share the same accessible control. */
export function FormSelect({
  id,
  name,
  value,
  options,
  onChange,
  required,
  invalid,
  describedBy,
  className,
}: {
  id: string;
  name: string;
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  return (
    <Select
      id={id}
      name={name}
      value={value}
      required={required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      aria-labelledby={`${id}-label`}
      className={className}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </Select>
  );
}
