import { Link } from "react-router";
import { ArrowUpRight, Clock3, Image, Plus } from "lucide-react";
import { MONTHLY_PACKAGE_ADD_ONS, monthlyAddOnQuoteHref, packageAddOnsFor, type PackageAddOnId } from "../../lib/package-addons";
import { formatPackagePrice, type EditingPackage } from "../../lib/subscriptions";

export function PackageAddOns({ editingPackage, selected, onChange, disabled = false }: {
  editingPackage: EditingPackage;
  selected: readonly string[];
  onChange: (ids: PackageAddOnId[]) => void;
  disabled?: boolean;
}) {
  const isMonthly = editingPackage.packageType === "monthly";
  const options = packageAddOnsFor(editingPackage.packageType);
  return <fieldset className="package-addons" disabled={disabled}>
      <legend><Plus size={15} aria-hidden="true" />{isMonthly ? "Monthly extras" : "Make it yours"} <span>{isMonthly ? "Quoted separately" : "Optional add-ons"}</span></legend>
      {isMonthly ? <>
        <p className="package-addons-note">We’ll confirm scope, availability, and pricing before work starts.</p>
        {MONTHLY_PACKAGE_ADD_ONS.map(item => {
          const Icon = item.id === "extra-editing-hours" ? Clock3 : Image;
          return <Link key={item.id} to={monthlyAddOnQuoteHref(editingPackage.slug, item.id)} className="package-addon package-addon--quote"
            aria-label={`Request a quote for ${item.label.toLowerCase()} on the ${editingPackage.name} plan`}
            aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={event => { if (disabled) event.preventDefault(); }}>
            <span className="package-addon-icon neo-icon-badge"><Icon size={18} aria-hidden="true" /></span>
            <span className="package-addon-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
            <span className="package-addon-price">Get quote <ArrowUpRight size={14} aria-hidden="true" /></span>
          </Link>;
        })}
      </> : options.map(item => <label key={item.id} className="package-addon" data-selected={selected.includes(item.id)}>
        <input type="checkbox" name="addon" value={item.id} checked={selected.includes(item.id)} onChange={event => onChange(
          options.filter(option => option.id === item.id ? event.currentTarget.checked : selected.includes(option.id)).map(option => option.id),
        )} />
        <span className="package-addon-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
        <span className="package-addon-price">+{formatPackagePrice(item.amountCents / 100)}</span>
      </label>)}
    </fieldset>;
}
