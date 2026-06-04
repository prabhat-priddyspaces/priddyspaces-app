"use client";

import * as React from "react";
import { useCallback, useState } from "react";

/**
 * Minimal, dependency-light form helper.
 *
 * Replaces the per-page `useState(formObject) + manual onChange + ad-hoc
 * validate-before-submit` pattern with one small hook. Pairs with the existing
 * `ui/Field` primitive (which already renders label/hint/error) and
 * `ui/FormSection`. Intentionally not react-hook-form / zod — no new deps.
 */

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export interface UseFormOptions<T> {
  initialValues: T;
  /** Return field→message for invalid fields; empty object means valid. */
  validate?: (values: T) => FormErrors<T>;
  onSubmit: (values: T) => void | Promise<void>;
}

export interface UseFormReturn<T> {
  values: T;
  errors: FormErrors<T>;
  submitting: boolean;
  /** Error thrown by `onSubmit` (e.g. a failed API call). */
  submitError: string | null;
  setValue: <K extends keyof T>(name: K, value: T[K]) => void;
  setValues: (next: Partial<T>) => void;
  /** Wires native inputs: `<input onChange={handleChange("name")} />`. */
  handleChange: (
    name: keyof T
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleSubmit: (event?: { preventDefault?: () => void }) => Promise<void>;
  reset: () => void;
}

export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> {
  const { initialValues, validate, onSubmit } = options;
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
    // Clear a field's error as soon as the user edits it.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }, []);

  const setValues = useCallback((next: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...next }));
  }, []);

  const handleChange = useCallback(
    (name: keyof T) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const target = event.target;
        const value =
          target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
        setValue(name, value as T[keyof T]);
      },
    [setValue]
  );

  const handleSubmit = useCallback(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      const nextErrors = validate ? validate(values) : {};
      setErrors(nextErrors);
      if (Object.values(nextErrors).some((message) => message)) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit(values);
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setSubmitting(false);
      }
    },
    [validate, values, onSubmit]
  );

  const reset = useCallback(() => {
    setValuesState(initialValues);
    setErrors({});
    setSubmitError(null);
  }, [initialValues]);

  return { values, errors, submitting, submitError, setValue, setValues, handleChange, handleSubmit, reset };
}
