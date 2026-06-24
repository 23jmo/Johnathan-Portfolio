/**
 * Minimal RFC 6901 JSON Pointer resolver for A2UI data bindings.
 * A pointer like "/projects/0/name" walks the data model; "~1" decodes to "/"
 * and "~0" to "~" per the spec. Returns undefined for any miss (never throws).
 */
export function resolvePointer(
  model: unknown,
  pointer: string
): unknown {
  if (pointer === "" || pointer === "#") return model;

  const path = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (!path.startsWith("/")) return undefined;

  const tokens = path
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: unknown = model;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return current;
}
