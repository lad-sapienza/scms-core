/**
 * Type definitions for Gallery component
 */

export interface GalleryImage {
  src: string;
  thumb: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

export interface GalleryProps {
  /**
   * Name of a shared gallery under usr/galleries/<name>/
   * If not provided (and `images` isn't either), auto-loads from the
   * `gallery/` folder colocated with the current page/content file.
   */
  name?: string;

  /**
   * Array of image objects to display
   * Explicit escape hatch — takes precedence over `name` and auto-loading
   */
  images?: GalleryImage[];

  /**
   * Reverse the default sorting order (DESC by name) of images
   * When true, images will be sorted in ascending order
   */
  reverseSorting?: boolean;

  /**
   * Grid configuration
   */
  columns?: {
    min?: number;
    max?: number;
  };

  /**
   * Additional CSS classes
   */
  className?: string;
}
