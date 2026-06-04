import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useForm } from "@/hooks/useForm";

type Values = { name: string; enabled: boolean };

function setup(overrides: Partial<Parameters<typeof useForm<Values>>[0]> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn(async () => undefined);
  const { result } = renderHook(() =>
    useForm<Values>({
      initialValues: { name: "", enabled: false },
      onSubmit,
      ...overrides,
    })
  );
  return { result, onSubmit };
}

describe("useForm", () => {
  it("updates a value via setValue", () => {
    const { result } = setup();
    act(() => result.current.setValue("name", "Alice"));
    expect(result.current.values.name).toBe("Alice");
  });

  it("handleChange reads text input value", () => {
    const { result } = setup();
    act(() => result.current.handleChange("name")({ target: { value: "Bob" } } as never));
    expect(result.current.values.name).toBe("Bob");
  });

  it("handleChange reads checkbox checked", () => {
    const { result } = setup();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    act(() => result.current.handleChange("enabled")({ target: checkbox } as never));
    expect(result.current.values.enabled).toBe(true);
  });

  it("blocks submit and exposes errors when validation fails", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { result } = setup({
      validate: (v) => (v.name ? {} : { name: "Name is required" }),
      onSubmit,
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.errors.name).toBe("Name is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with values when valid", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { result } = setup({ onSubmit });
    act(() => result.current.setValue("name", "Carol"));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(onSubmit).toHaveBeenCalledWith({ name: "Carol", enabled: false });
  });

  it("captures submitError when onSubmit throws", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("save failed");
    });
    const { result } = setup({ onSubmit });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.submitError).toBe("save failed");
    expect(result.current.submitting).toBe(false);
  });

  it("clears a field error as soon as it is edited", async () => {
    const { result } = setup({ validate: (v) => (v.name ? {} : { name: "Required" }) });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.errors.name).toBe("Required");
    act(() => result.current.setValue("name", "x"));
    expect(result.current.errors.name).toBeUndefined();
  });

  it("reset restores initial values and clears errors", async () => {
    const { result } = setup({ validate: (v) => (v.name ? {} : { name: "Required" }) });
    act(() => result.current.setValue("name", "temp"));
    await act(async () => {
      await result.current.handleSubmit();
    });
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ name: "", enabled: false });
    expect(result.current.errors).toEqual({});
  });
});
