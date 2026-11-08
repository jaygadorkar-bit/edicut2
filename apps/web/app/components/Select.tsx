import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "../styles/select.css";

export type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};
type OptionProps = {
  value?: string | number;
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};

function optionText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? optionText(child.props.children)
        : String(child),
    )
    .join("");
}

export function selectOptions(
  children: ReactNode,
  group?: string,
  groupDisabled = false,
): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === Fragment)
      return selectOptions(child.props.children, group, groupDisabled);
    if (child.type === "optgroup")
      return selectOptions(
        child.props.children,
        child.props.label,
        groupDisabled || !!child.props.disabled,
      );
    if (child.type !== "option") return [];
    const label = child.props.label ?? optionText(child.props.children);
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: groupDisabled || !!child.props.disabled,
        group,
      },
    ];
  });
}

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size"
>;
const useClientLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

/** Custom single-select UI; the inaccessible native field retains FormData, reset, and constraint validation. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      children,
      id: suppliedId,
      className = "",
      style,
      value,
      defaultValue,
      disabled,
      required,
      onChange,
      onInvalid,
      autoFocus,
      tabIndex,
      title,
      ...props
    },
    forwardedRef,
  ) {
    const generatedId = useId();
    const id = suppliedId ?? `select-${generatedId}`;
    const listId = `${id}-options`;
    const options = selectOptions(children);
    const native = useRef<HTMLSelectElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLUListElement>(null);
    const [current, setCurrent] = useState(
      String(value ?? defaultValue ?? options[0]?.value ?? ""),
    );
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [invalid, setInvalid] = useState(false);
    const [placement, setPlacement] = useState<{
      left: number;
      width: number;
      maxHeight: number;
      top?: number;
      bottom?: number;
    }>();
    const search = useRef({ text: "", time: 0 });
    const selectedValue = value === undefined ? current : String(value);
    const selected = options.findIndex(
      (option) => option.value === selectedValue,
    );
    const [portal, setPortal] = useState<HTMLElement | null>(null);
    const resetValue = useRef("");
    resetValue.current = String(
      value ??
        defaultValue ??
        options.find((option) => !option.disabled)?.value ??
        "",
    );

    useEffect(() => {
      const select = native.current;
      if (!select) return;
      const reset = (event: Event) =>
        queueMicrotask(() => {
          if (event.defaultPrevented || !select.isConnected) return;
          select.value = resetValue.current;
          setCurrent(select.value);
          setInvalid(false);
          setOpen(false);
        });
      select.form?.addEventListener("reset", reset);
      if (autoFocus) trigger.current?.focus();
      return () => select.form?.removeEventListener("reset", reset);
    }, [autoFocus, props.form]);

    useClientLayoutEffect(() => {
      if (native.current) setCurrent(native.current.value);
    }, [children, value]);

    useEffect(() => {
      if (disabled) setOpen(false);
    }, [disabled]);

    useEffect(() => {
      if (open && (!options[active] || options[active].disabled)) {
        setActive(options.findIndex((option) => !option.disabled));
      }
    }, [children, open, active]);

    useClientLayoutEffect(() => {
      if (!open || !portal) return;
      const position = () => {
        const bounds = trigger.current?.getBoundingClientRect();
        if (!bounds) return;
        const gap = 8,
          gutter = 12;
        const below = window.innerHeight - bounds.bottom - gap - gutter;
        const above = bounds.top - gap - gutter;
        const flip = below < 180 && above > below;
        const width = Math.min(
          420,
          Math.max(bounds.width, 220),
          window.innerWidth - gutter * 2,
        );
        setPlacement({
          left: Math.max(
            gutter,
            Math.min(bounds.left, window.innerWidth - width - gutter),
          ),
          width,
          maxHeight: Math.max(44, Math.min(320, flip ? above : below)),
          ...(flip
            ? { bottom: window.innerHeight - bounds.top + gap }
            : { top: bounds.bottom + gap }),
        });
      };
      const close = (event: PointerEvent) => {
        if (
          !trigger.current?.contains(event.target as Node) &&
          !menu.current?.contains(event.target as Node)
        )
          setOpen(false);
      };
      const scroll = (event: Event) => {
        if (!menu.current?.contains(event.target as Node)) position();
      };
      position();
      document.addEventListener("pointerdown", close);
      window.addEventListener("resize", position);
      window.addEventListener("scroll", scroll, true);
      return () => {
        document.removeEventListener("pointerdown", close);
        window.removeEventListener("resize", position);
        window.removeEventListener("scroll", scroll, true);
      };
    }, [open, portal]);

    useEffect(() => {
      const item = menu.current?.querySelector<HTMLElement>(
        `[data-index="${active}"]`,
      );
      const list = menu.current;
      if (!open || !item || !list) return;
      if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
      else if (
        item.offsetTop + item.offsetHeight >
        list.scrollTop + list.clientHeight
      )
        list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }, [active, open, placement]);

    function firstEnabled(fromEnd = false) {
      const indices = options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0);
      return (fromEnd ? indices.at(-1) : indices[0]) ?? -1;
    }
    function show(fromEnd = false) {
      // Dialog/fullscreen can change while this field stays mounted.
      setPortal(
        trigger.current?.closest<HTMLElement>("dialog, :fullscreen") ??
          document.body,
      );
      setActive(
        selected >= 0 && !options[selected].disabled
          ? selected
          : firstEnabled(fromEnd),
      );
      search.current = { text: "", time: 0 };
      setOpen(true);
    }
    function choose(index: number) {
      const option = options[index],
        field = native.current;
      if (!field || disabled || !option || option.disabled) return;
      setOpen(false);
      setInvalid(false);
      trigger.current?.focus({ preventScroll: true });
      if (field.value === option.value) return;
      field.value = option.value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return (
      <span className="site-select">
        <button
          ref={trigger}
          type="button"
          id={id}
          role="combobox"
          disabled={disabled}
          className={`site-select__trigger ${className}`}
          style={style}
          title={title ?? options[selected]?.label}
          tabIndex={tabIndex}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={props["aria-describedby"]}
          aria-required={required}
          aria-invalid={props["aria-invalid"] || invalid || undefined}
          onClick={() => (open ? setOpen(false) : show())}
          onBlur={(event) => {
            if (!menu.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "Tab") setOpen(false);
            else if (
              event.key === "Enter" ||
              (event.key === " " &&
                (Date.now() - search.current.time >= 700 ||
                  !search.current.text))
            ) {
              event.preventDefault();
              if (open) choose(active);
              else show();
            } else if (event.altKey && event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(false);
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              if (!open) {
                show(event.key === "ArrowUp" || event.key === "End");
                if (event.key === "Home" || event.key === "End")
                  setActive(firstEnabled(event.key === "End"));
              } else if (event.key === "Home" || event.key === "End")
                setActive(firstEnabled(event.key === "End"));
              else {
                const step = event.key === "ArrowDown" ? 1 : -1;
                let next = active + step;
                while (
                  next >= 0 &&
                  next < options.length &&
                  options[next].disabled
                )
                  next += step;
                if (next >= 0 && next < options.length) setActive(next);
              }
            } else if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              event.preventDefault();
              if (!open) show();
              const now = Date.now(),
                character = event.key.toLocaleLowerCase();
              const text =
                (now - search.current.time < 700 ? search.current.text : "") +
                character;
              search.current = { text, time: now };
              const query = [...text].every((letter) => letter === character)
                ? character
                : text;
              const start = query.length === 1 ? active + 1 : 0;
              const index = options
                .map(
                  (_, offset) =>
                    (start + offset + options.length) % options.length,
                )
                .find(
                  (index) =>
                    !options[index].disabled &&
                    options[index].label.toLocaleLowerCase().startsWith(query),
                );
              if (index !== undefined) setActive(index);
            }
          }}
        >
          <span className="site-select__value">
            {options[selected]?.label || "Choose an option"}
          </span>
          <ChevronDown
            className="site-select__chevron"
            size={16}
            aria-hidden="true"
          />
        </button>
        <select
          {...props}
          id={`${id}-native`}
          ref={(element) => {
            native.current = element;
            if (typeof forwardedRef === "function") forwardedRef(element);
            else if (forwardedRef) forwardedRef.current = element;
          }}
          className="site-select__native"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          onFocus={() => trigger.current?.focus()}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            trigger.current?.focus();
            show();
            onInvalid?.(event);
          }}
          onChange={(event) => {
            setCurrent(event.currentTarget.value);
            setInvalid(false);
            onChange?.(event);
          }}
        >
          {children}
        </select>
        {open && portal
          ? createPortal(
              <ul
                ref={menu}
                id={listId}
                role="listbox"
                aria-label={props["aria-label"]}
                aria-labelledby={props["aria-labelledby"] ?? id}
                className="site-select__menu"
                style={{
                  ...placement,
                  visibility: placement ? "visible" : "hidden",
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "touch") event.preventDefault();
                }}
              >
                {options.length ? (
                  options.map((option, index) => (
                    <Fragment key={`${option.value}-${index}`}>
                      {option.group &&
                      option.group !== options[index - 1]?.group ? (
                        <li role="presentation" className="site-select__group">
                          {option.group}
                        </li>
                      ) : null}
                      <li
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={selectedValue === option.value}
                        aria-disabled={option.disabled || undefined}
                        data-index={index}
                        data-active={active === index || undefined}
                        className="site-select__option"
                        onPointerMove={() => {
                          if (!option.disabled) setActive(index);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          choose(index);
                        }}
                      >
                        <span>{option.label}</span>
                        {selectedValue === option.value ? (
                          <Check size={16} aria-hidden="true" />
                        ) : null}
                      </li>
                    </Fragment>
                  ))
                ) : (
                  <li role="presentation" className="site-select__empty">
                    No options available
                  </li>
                )}
              </ul>,
              portal,
            )
          : null}
      </span>
    );
  },
);
