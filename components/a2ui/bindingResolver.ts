import { resolvePointer } from "./dataModel";

/**
 * Resolve data bindings inside a props object. Any value of the form
 * `{ "$bind": "/pointer" }` is replaced with the value at that JSON Pointer in
 * the data model. Resolution is recursive through nested objects and arrays so
 * deep props bind too. Non-binding values pass through unchanged.
 */
export function resolveBindings(
  value: unknown,
  model: Record<string, unknown>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveBindings(item, model));
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$bind === "string") {
      return resolvePointer(model, obj.$bind);
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      out[key] = resolveBindings(val, model);
    }
    return out;
  }

  return value;
}

export function resolveProps(
  props: Record<string, unknown> | undefined,
  model: Record<string, unknown>
): Record<string, unknown> {
  if (!props) return {};
  return resolveBindings(props, model) as Record<string, unknown>;
}
