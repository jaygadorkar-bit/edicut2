import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { CHECKOUT_COUNTRIES, countryCallingCode } from "../lib/checkout-contact";

export function filterCountries(query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const search = normalize(query.trim());
  return CHECKOUT_COUNTRIES.filter(country => normalize(country.name).includes(search) || country.code.toLowerCase() === search);
}

export function CountrySelect({ defaultValue = "", onCountryChange }: {
  defaultValue?: string;
  onCountryChange?: (countryCode: string, previousCountryCode: string) => void;
}) {
  const initial = CHECKOUT_COUNTRIES.find(country => country.code === defaultValue);
  const [country, setCountry] = useState(initial?.code ?? "");
  const [text, setText] = useState(initial?.name ?? "");
  const [selectionPending, setSelectionPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState({ above: false, height: 240 });
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options = filterCountries(searching ? text : "");

  useEffect(() => {
    input.current?.setCustomValidity((!country || selectionPending) && text ? "Choose a country from the list." : "");
  }, [country, selectionPending, text]);

  function cancelSearch() {
    setText(country ? CHECKOUT_COUNTRIES.find(option => option.code === country)?.name ?? "" : "");
    setSearching(false);
    setSelectionPending(false);
    setOpen(false);
    setActive(-1);
    input.current?.setCustomValidity("");
  }

  useEffect(() => {
    if (!open) return;
    const position = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 16;
      const flip = below < 160 && above > below;
      setPlacement({ above: flip, height: Math.max(80, Math.min(240, (flip ? above : below) - 44)) });
    };
    position();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) cancelSearch();
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", position);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", position); };
  }, [open]);

  useEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    if (!open || !option || !list.current) return;
    const menu = list.current;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }
  }, [active, open]);

  function choose(index: number) {
    const selected = options[index];
    if (!selected) return;
    onCountryChange?.(selected.code, country);
    setCountry(selected.code);
    setText(selected.name);
    setSearching(false);
    setSelectionPending(false);
    setActive(-1);
    setOpen(false);
    input.current?.setCustomValidity("");
  }

  return (
    <div ref={root} className="relative min-w-0">
      <input type="hidden" name="country" value={selectionPending ? "" : country} />
      <div className="neo-inset relative flex h-12 items-center rounded-xl focus-within:outline-2 focus-within:outline-primary">
        <Globe2 size={18} aria-hidden="true" className="pointer-events-none absolute left-3 text-slate-500" />
        <input ref={input} id="checkout-country" role="combobox" required autoComplete="off" maxLength={100}
          aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
          placeholder="Select or search country" value={text}
          className="h-full w-full min-w-0 rounded-xl bg-transparent pl-10 pr-12 text-base font-medium outline-none placeholder:text-slate-500"
          onFocus={() => { setOpen(true); setActive(-1); }}
          onClick={() => setOpen(true)}
          onChange={event => {
            setText(event.currentTarget.value); setSelectionPending(true); setSearching(true); setActive(-1); setOpen(true);
            event.currentTarget.setCustomValidity(event.currentTarget.value ? "Choose a country from the list." : "");
          }}
          onInvalid={() => setOpen(true)}
          onBlur={event => { if (!root.current?.contains(event.relatedTarget)) cancelSearch(); }}
          onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); cancelSearch(); }
            else if (event.key === "Tab") cancelSearch();
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setActive(index => event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1) : index < 0 ? options.length - 1 : Math.max(0, index - 1));
            } else if (open && (event.key === "Home" || event.key === "End")) {
              event.preventDefault(); setActive(event.key === "Home" ? 0 : options.length - 1);
            } else if (open && event.key === "Enter") {
              event.preventDefault(); choose(active < 0 && options.length === 1 ? 0 : active);
            }
          }} />
        <button type="button" tabIndex={-1} aria-label={open ? "Close country menu" : "Open country menu"}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { if (open) cancelSearch(); else { input.current?.focus(); setOpen(true); } }}
          className="absolute right-0 flex h-12 w-11 cursor-pointer items-center justify-center rounded-r-xl text-slate-500">
          <ChevronDown size={17} aria-hidden="true" className={`transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? (
        <div className={`absolute inset-x-0 z-50 overflow-hidden rounded-2xl border border-white bg-[#f6f9fc] p-2 shadow-[0_16px_40px_-12px_rgba(25,35,45,0.3)] ${placement.above ? "bottom-full mb-2" : "top-full mt-2"}`}>
          <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1 text-xs font-medium text-slate-500">
            <span>Choose your country</span><span aria-live="polite">{options.length} available</span>
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label="Countries" style={{ maxHeight: placement.height }} className="relative overflow-y-auto overscroll-contain">
            {options.map((option, index) => (
              <li key={option.code} id={`${listId}-${option.code}`} role="option" aria-label={`${option.name}, ${countryCallingCode(option.code)}`} aria-selected={country === option.code}
                onPointerDown={event => event.preventDefault()} onClick={() => choose(index)} onMouseMove={() => setActive(index)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${active === index ? "bg-[#e3ecf4] text-[#19232d]" : "text-slate-700 hover:bg-[#e3ecf4]"}`}>
                <span aria-hidden="true" className="flex h-7 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-bold tracking-wider text-slate-500">{countryCallingCode(option.code)}</span>
                <span className="flex-1">{option.name}</span>
                {country === option.code ? <Check size={16} aria-hidden="true" /> : null}
              </li>
            ))}
          </ul>
          {!options.length ? <p role="status" className="px-3 py-5 text-sm font-medium text-slate-500">No countries found. Try another name.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
