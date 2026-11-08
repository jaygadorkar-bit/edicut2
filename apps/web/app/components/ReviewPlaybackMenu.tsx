import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/** Small, keyboard-operated playback selector. Stays inside the fullscreen player. */
export function ReviewPlaybackMenu({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  title,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(selected);
  const expanded = open && !disabled && options.length > 0;
  useEffect(() => {
    if (!expanded) return;
    const option = root.current?.querySelector<HTMLElement>(
      '[role="option"].is-active',
    );
    option?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [expanded, active]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [expanded]);
  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  }
  return (
    <div
      ref={root}
      className="review-playback-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="review-playback-menu__trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        disabled={disabled || !options.length}
        title={title ?? label}
        onClick={() => {
          setActive(selected);
          setOpen(!expanded);
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (expanded) choose(active);
            else {
              setActive(selected);
              setOpen(true);
            }
          } else if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            setActive(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : !expanded
                    ? selected
                    : Math.max(
                        0,
                        Math.min(
                          options.length - 1,
                          active + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
            );
            setOpen(true);
          }
        }}
      >
        <span>
          {options.find((option) => option.value === value)?.label ??
            placeholder ??
            "—"}
        </span>
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="review-playback-menu__popover">
          <span className="review-playback-menu__caption" aria-hidden="true">
            {label}
          </span>
          <ul id={`${id}-list`} role="listbox" aria-label={label}>
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                className={index === active ? "is-active" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value ? (
                  <Check size={13} aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
