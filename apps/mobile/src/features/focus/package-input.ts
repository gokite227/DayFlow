const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * Native debug screen input (app/dev/focus.tsx): package names separated by commas, spaces or new lines. Invalid names are reported instead of
 * being sent to the native module (which validates again).
 */
export function parsePackageInput(text: string): { packages: string[]; invalid: string[] } {
  const names = [...new Set(text.split(/[\s,]+/).filter((name) => name !== ""))];
  return { packages: names.filter((name) => PACKAGE_NAME.test(name)), invalid: names.filter((name) => !PACKAGE_NAME.test(name)) };
}
