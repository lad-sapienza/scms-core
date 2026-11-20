/**
 * DataTb Component Exports
 * 
 * Exports the MDX-safe wrapper by default for better compatibility
 * with Astro MDX files
 */

export { DataTb } from './DataTbMdx';

// Source components
export {
  CsvSource,
  JsonSource,
  DirectusSource,
  BdusSource,
  ApiSource,
} from './sources';

// Types
export type {
  DataRow,
  ColumnConfig,
  PaginationConfig,
  DataTbProps,
  CsvSourceConfig,
  JsonSourceConfig,
  DirectusSourceConfig,
  BdusSourceConfig,
  ApiSourceConfig,
  SourceConfig,
} from './types';

export type {
  CsvSourceProps,
  JsonSourceProps,
  DirectusSourceProps,
  BdusSourceProps,
  ApiSourceProps,
} from './sources';
