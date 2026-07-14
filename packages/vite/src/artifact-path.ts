const JAVASCRIPT_EXTENSIONS = [".js", ".mjs"] as const;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

// Manifest paths cross JavaScript, Python, URLs, archives, and filesystems.
// Restrict every segment to the portable ASCII subset shared by each boundary.
export function isSafeArtifactPath(value: string): boolean {
  const parts = value.split("/");
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    parts.every(
      (part) =>
        SAFE_SEGMENT.test(part) &&
        part !== "." &&
        part !== ".." &&
        !part.endsWith(".") &&
        !RESERVED_FILENAME.test(part),
    )
  );
}

export function isJavaScriptArtifactPath(value: string): boolean {
  return (
    isSafeArtifactPath(value) &&
    JAVASCRIPT_EXTENSIONS.some((extension) => hasArtifactExtension(value, extension))
  );
}

export function isStylesheetArtifactPath(value: string): boolean {
  return isSafeArtifactPath(value) && hasArtifactExtension(value, ".css");
}

export function javascriptExtension(value: string): ".js" | ".mjs" {
  if (hasArtifactExtension(value, ".mjs")) return ".mjs";
  if (hasArtifactExtension(value, ".js")) return ".js";
  throw new Error(`Expected a JavaScript bundle path, received ${value}.`);
}

function hasArtifactExtension(value: string, extension: string): boolean {
  const name = value.slice(value.lastIndexOf("/") + 1);
  return name.length > extension.length && name.endsWith(extension);
}

export function artifactPathsConflict(paths: readonly string[]): boolean {
  // Portable paths still cross case-sensitive and case-insensitive filesystems.
  // Catch ASCII case aliases and file-directory overlaps before writing them.
  const normalized = paths.map(asciiLowercase);
  return normalized.some((path, index) =>
    normalized.some((other, otherIndex) =>
      index === otherIndex ? false : path === other || path.startsWith(`${other}/`),
    ),
  );
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}
