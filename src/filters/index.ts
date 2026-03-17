/**
 * Filter registry — dispatches commands to the appropriate filter module.
 */

export interface Filter {
  name: string;
  apply(command: string, output: string): string;
}

const filters: Filter[] = [];

export function registerFilter(filter: Filter): void {
  filters.push(filter);
}

export function getFilters(): readonly Filter[] {
  return filters;
}
