import { Plus } from "lucide-react";
import { PACKAGE_ADD_ONS, type PackageAddOnId } from "../../lib/package-addons";
import styles from "../../styles/package-addons.css?url";

export function PackageAddOns({ selected, onChange, disabled = false }: {
  selected: readonly string[];
  onChange: (ids: PackageAddOnId[]) => void;
  disabled?: boolean;
}) {
  return <>
    <link rel="stylesheet" href={styles} />
    <fieldset className="package-addons" disabled={disabled}>
      <legend><Plus size={15} aria-hidden="true" />Make it yours <span>Optional add-ons</span></legend>
      {PACKAGE_ADD_ONS.map(item => <label key={item.id} className="package-addon" data-selected={selected.includes(item.id)}>
        <input type="checkbox" name="addon" value={item.id} checked={selected.includes(item.id)} onChange={event => onChange(
          PACKAGE_ADD_ONS.filter(option => option.id === item.id ? event.currentTarget.checked : selected.includes(option.id)).map(option => option.id),
        )} />
        <span className="package-addon-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
        <span className="package-addon-price">+$20</span>
      </label>)}
    </fieldset>
  </>;
}
