import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type FormSelectOption = { value: string; label: string };

/** Select-only combobox with a native fallback before hydration. */
export function FormSelect({ id, name, value, options, onChange, required, invalid, describedBy, className }: {
  id: string; name: string; value: string; options: FormSelectOption[];
  onChange: (value: string) => void; required?: boolean; invalid?: boolean; describedBy?: string; className?: string;
}) {
  const [enhanced, setEnhanced] = useState(false);
  const [open, setOpen] = useState(false);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [active, setActive] = useState(selected);
  const [placement, setPlacement] = useState({ above: false, height: 240 });
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", time: 0 });
  const listId = `${id}-options`;

  useEffect(() => { setEnhanced(true); }, []);
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 16;
      const flip = below < 200 && above > below;
      setPlacement({ above: flip, height: Math.max(44, Math.min(240, (flip ? above : below) - 16)) });
    };
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    position();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  useEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    const menu = list.current;
    if (!open || !option || !menu) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [active, open]);

  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  }

  return <div ref={root} className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    {enhanced ? <>
      <input type="hidden" name={name} value={value} />
      <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={listId}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox" aria-required={required} aria-invalid={invalid} aria-describedby={describedBy}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={`${className} relative cursor-pointer text-left pr-12`}
        onClick={() => { setActive(selected); setOpen(current => !current); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          else if (event.key === "Tab") setOpen(false);
          else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) choose(active); else { setActive(selected); setOpen(true); }
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault(); setOpen(true);
            setActive(current => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : !open ? selected : Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const now = Date.now();
            const query = (now - search.current.time < 700 ? search.current.text : "") + event.key.toLowerCase();
            search.current = { text: query, time: now };
            const index = options.findIndex(option => option.label.toLowerCase().startsWith(query));
            if (index >= 0) { setActive(index); setOpen(true); }
          }
        }}>
        <span id={`${id}-value`} className="block break-words">{options.find(option => option.value === value)?.label || "Choose an option"}</span>
        <ChevronDown size={18} aria-hidden="true" className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <ul ref={list} id={listId} role="listbox" aria-labelledby={`${id}-label`}
        style={{ maxHeight: placement.height }}
        className={`absolute inset-x-0 z-50 overflow-y-auto overscroll-contain rounded-2xl border border-white bg-[var(--neo-surface-strong)] p-2 shadow-xl ${placement.above ? "bottom-full mb-2" : "top-full mt-2"}`}>
        {options.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={value === option.value}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(index)} onPointerMove={() => setActive(index)}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm leading-5 ${active === index ? "bg-[#7157ed]/10 text-[#5141a9]" : "text-slate-700"}`}>
          <span className="min-w-0 flex-1 break-words">{option.label}</span>
          {value === option.value ? <Check size={17} aria-hidden="true" className="shrink-0 text-[#5141a9]" /> : null}
        </li>)}
      </ul> : null}
    </> : <select id={id} name={name} value={value} required={required} aria-invalid={invalid} aria-describedby={describedBy} className={className} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>}
  </div>;
}
