// @vitest-environment happy-dom
import { act, Fragment, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select, selectOptions } from "./Select";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const choices = (
  <>
    <option value="">Not assigned</option>
    <option value="a">Alpha manager</option>
    <option value="blocked" disabled>
      Unavailable
    </option>
    <option value="b">Beta manager</option>
    <option value="c">Bravo manager</option>
  </>
);
const button = () =>
  host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
const field = () =>
  host.querySelector("select")! as unknown as HTMLSelectElement;
const list = () => document.querySelector<HTMLUListElement>('[role="listbox"]');
const option = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === text,
  )!;
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.focus();
    element.click();
  });
}
async function key(key: string) {
  await act(async () =>
    button().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}

describe("shared custom select", () => {
  it("renders custom UI from the server and retains only an inaccessible native form control", () => {
    const html = renderToStaticMarkup(
      <label>
        Manager
        <Select name="manager" defaultValue="a">
          {choices}
        </Select>
      </label>,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('class="site-select__native"');
    expect(html).toContain('tabindex="-1" aria-hidden="true"');
    expect(html).toContain("Alpha manager");
  });
  it("parses dynamic children, fragments, numeric values, labels, and disabled groups", () => {
    expect(
      selectOptions(
        <Fragment>
          <optgroup label="Staff" disabled>
            <option value={1}>One</option>
          </optgroup>
          {false}
          <option label="Two" value="2">
            Alternate
          </option>
          <option>Three</option>
        </Fragment>,
      ),
    ).toEqual([
      { value: "1", label: "One", disabled: true, group: "Staff" },
      { value: "2", label: "Two", disabled: false, group: undefined },
      { value: "Three", label: "Three", disabled: false, group: undefined },
    ]);
  });
  it("submits the selected value once and delivers a real select change event", async () => {
    const onChange = vi.fn((event) =>
      expect(event.currentTarget).toBe(field()),
    );
    await render(
      <form>
        <Select name="manager" defaultValue="a" onChange={onChange}>
          {choices}
        </Select>
      </form>,
    );
    await click(button());
    await click(option("Beta manager"));
    expect(button().textContent).toBe("Beta manager");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(new FormData(host.querySelector("form")!).getAll("manager")).toEqual(
      ["b"],
    );
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(button());
  });
  it("updates controlled state and respects a rejected controlled change", async () => {
    function Controlled() {
      const [value, setValue] = useState("a");
      return (
        <Select
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        >
          {choices}
        </Select>
      );
    }
    await render(<Controlled />);
    await click(button());
    await click(option("Beta manager"));
    expect(button().textContent).toBe("Beta manager");
    expect(field().value).toBe("b");
    await render(
      <Select value="a" onChange={() => {}}>
        {choices}
      </Select>,
    );
    await click(button());
    await click(option("Beta manager"));
    expect(button().textContent).toBe("Alpha manager");
    expect(field().value).toBe("a");
  });
  it("supports arrows, Home/End, and Enter while skipping disabled choices", async () => {
    await render(<Select defaultValue="a">{choices}</Select>);
    await key("ArrowDown");
    await key("ArrowDown");
    await key("Enter");
    expect(field().value).toBe("b");
    await key("Home");
    expect(button().getAttribute("aria-activedescendant")).toContain("-0");
    await key("End");
    await key("Enter");
    expect(field().value).toBe("c");
  });
  it("supports typeahead and repeated-character cycling", async () => {
    await render(<Select defaultValue="a">{choices}</Select>);
    await key("b");
    await key("b");
    await key("Enter");
    expect(field().value).toBe("c");
    await click(button());
    await key("a");
    await key("l");
    await key("Enter");
    expect(field().value).toBe("a");
  });
  it("Escape cancels the pending selection and Tab closes the menu", async () => {
    await render(<Select defaultValue="a">{choices}</Select>);
    await key("End");
    await key("Escape");
    expect(field().value).toBe("a");
    expect(list()).toBeNull();
    await click(button());
    await key("Tab");
    expect(list()).toBeNull();
  });
  it("dismisses on outside pointer and blur without changing the value", async () => {
    await render(
      <>
        <Select defaultValue="a">{choices}</Select>
        <button id="outside">Next</button>
      </>,
    );
    await click(button());
    await act(async () =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(list()).toBeNull();
    expect(field().value).toBe("a");
    await click(button());
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#outside")!.focus(),
    );
    expect(list()).toBeNull();
  });
  it("ignores disabled options and closes when the control becomes disabled", async () => {
    await render(<Select defaultValue="a">{choices}</Select>);
    await click(button());
    await click(option("Unavailable"));
    expect(field().value).toBe("a");
    expect(list()).not.toBeNull();
    await render(
      <form>
        <Select name="manager" disabled>
          {choices}
        </Select>
      </form>,
    );
    expect(button().disabled).toBe(true);
    expect(field().disabled).toBe(true);
    expect(list()).toBeNull();
  });
  it("routes required-field validation to the visible control", async () => {
    await render(
      <form>
        <label htmlFor="manager">Manager</label>
        <Select id="manager" name="manager" required defaultValue="">
          {choices}
        </Select>
      </form>,
    );
    await act(async () => expect(field().checkValidity()).toBe(false));
    expect(button().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(button());
    await click(option("Alpha manager"));
    expect(field().checkValidity()).toBe(true);
    expect(button().getAttribute("aria-invalid")).toBeNull();
  });
  it("resets uncontrolled fields with the containing form", async () => {
    await render(
      <form>
        <Select name="manager" defaultValue="a">
          {choices}
        </Select>
      </form>,
    );
    await click(button());
    await click(option("Beta manager"));
    await act(async () => {
      host.querySelector("form")!.reset();
      await Promise.resolve();
    });
    expect(field().value).toBe("a");
    expect(button().textContent).toBe("Alpha manager");
  });
  it("tracks changes to controlled values and dynamic options", async () => {
    await render(<Select defaultValue="a">{choices}</Select>);
    await render(
      <Select defaultValue="a">
        <option value="new">New staff member</option>
      </Select>,
    );
    expect(button().textContent).toBe("New staff member");
    await render(
      <Select value={2} onChange={() => {}}>
        <option value={1}>One</option>
        <option value={2}>Two</option>
      </Select>,
    );
    expect(button().textContent).toBe("Two");
  });
  it("opens menus outside clipping parents and flips above near the bottom", async () => {
    await render(
      <div style={{ overflow: "hidden" }}>
        <Select>{choices}</Select>
      </div>,
    );
    vi.spyOn(button(), "getBoundingClientRect").mockReturnValue({
      top: 700,
      bottom: 740,
      left: 950,
      right: 1020,
      width: 70,
      height: 40,
      x: 950,
      y: 700,
      toJSON() {},
    });
    await click(button());
    expect(list()!.parentElement).toBe(document.body);
    expect(list()!.style.bottom).not.toBe("");
    expect(parseFloat(list()!.style.left)).toBeLessThanOrEqual(
      window.innerWidth - 220,
    );
  });
  it("keeps popups in native dialogs and labels the field while retaining form ownership", async () => {
    await render(
      <>
        <form id="external" />
        <dialog open>
          <label htmlFor="manager">Manager</label>
          <Select
            id="manager"
            name="manager"
            form="external"
            aria-describedby="help"
          >
            {choices}
          </Select>
        </dialog>
      </>,
    );
    await click(button());
    expect(list()!.parentElement).toBe(host.querySelector("dialog"));
    expect(button().getAttribute("aria-describedby")).toBe("help");
    expect(new FormData(host.querySelector("form")!).get("manager")).toBe("");
  });
});
