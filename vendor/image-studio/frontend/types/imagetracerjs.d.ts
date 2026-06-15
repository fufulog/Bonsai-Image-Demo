declare module "imagetracerjs" {
  export function imageToSVG(
    path: string,
    callback: (svgString: string) => void,
    options?: Record<string, any>
  ): void;
  export function imagedataToSVG(
    imagedata: ImageData,
    options?: Record<string, any>
  ): string;
}

declare module "potrace-js/src/index.js" {
  export function loadImage(url: string): Promise<HTMLImageElement>;
  export function traceImage(image: HTMLImageElement, options?: Record<string, any>): any;
  export function getSVG(pathList: any, size: number, opt_type?: string): string;
}

declare module "svg-path-simplify";
declare module "image-q";

