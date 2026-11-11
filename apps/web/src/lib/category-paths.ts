export const parseCatsParam = (value: string | null): string[][] => {
  if (!value) return []
  return value
    .split(";")
    .map((path) => path.split("/").filter(Boolean))
    .filter((path) => path.length > 0)
}

export const encodeCatsParam = (paths: string[][]) =>
  paths
    .map((path) => path.join("/"))
    .filter(Boolean)
    .join(";")
