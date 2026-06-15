import { useCallback, useState, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryEntry } from "@/lib/use-history";

interface UseVectorizerProps {
  entry: HistoryEntry | null;
  isProcessing: boolean;
  setIsProcessing: (loading: boolean) => void;
  processingError: string | null;
  setProcessingError: (err: string | null) => void;
  editedImageUrl: string | null;
  editedImageBlob: Blob | null;
  setEditedImageUrl: (url: string | null) => void;
  setEditedImageBlob: (blob: Blob | null) => void;
  handleSaveCopy: () => void;
  isEditPanelOpen: boolean;
  editMode: "remove-bg" | "vectorize" | null;
}

export function useVectorizer({
  entry,
  isProcessing,
  setIsProcessing,
  processingError,
  setProcessingError,
  editedImageUrl,
  editedImageBlob,
  setEditedImageUrl,
  setEditedImageBlob,
  handleSaveCopy,
  isEditPanelOpen,
  editMode,
}: UseVectorizerProps) {
  // Vectorization options
  const [vectorizeEngine, setVectorizeEngine] = useState<"imagetracer" | "potrace">("imagetracer");
  const [vectorizePreset, setVectorizePreset] = useState<"bw" | "color">("bw");
  const [numberOfColors, setNumberOfColors] = useState(2);
  const [ltres, setLtres] = useState(1);
  const [qtres, setQtres] = useState(1);
  const [strokeWidth, setStrokeWidth] = useState(1);

  // Potrace options
  const [turdsize, setTurdsize] = useState(2);
  const [alphamax, setAlphamax] = useState(1);
  const [opttolerance, setOpttolerance] = useState(0.2);
  const [turnpolicy, setTurnpolicy] = useState<"right" | "left" | "black" | "white" | "minority" | "majority">("right");

  // Path simplification & precision options
  const [simplifyTolerance, setSimplifyTolerance] = useState(0);
  const [decimalPrecision, setDecimalPrecision] = useState(3);

  // Ignore preprocess option
  const [ignorePreprocess, setIgnorePreprocess] = useState(false);

  // Reset state when entry changes
  useEffect(() => {
    setVectorizeEngine("imagetracer");
    setVectorizePreset("bw");
    setNumberOfColors(2);
    setLtres(1);
    setQtres(1);
    setStrokeWidth(1);
    setTurdsize(2);
    setAlphamax(1);
    setOpttolerance(0.2);
    setTurnpolicy("right");
    setSimplifyTolerance(0);
    setDecimalPrecision(3);
    
    // Auto-enable ignorePreprocess if input is already an SVG
    if (entry?.imageBlob?.type === "image/svg+xml") {
      setIgnorePreprocess(true);
    } else {
      setIgnorePreprocess(false);
    }
  }, [entry?.id]);

  const handleVectorize = useCallback(async () => {
    if (!entry) return;
    setIsProcessing(true);
    setProcessingError(null);
    try {
      let svgString = "";

      if (ignorePreprocess) {
        if (entry.imageBlob.type === "image/svg+xml") {
          svgString = await entry.imageBlob.text();
        } else {
          throw new Error("Input image is not an SVG. Please disable 'Ignore Preprocessing' or use an SVG source.");
        }
      } else {
        const imageUrlToTrace = URL.createObjectURL(entry.imageBlob);

        if (vectorizeEngine === "potrace") {
          const Potrace = (await import("potrace-js/src/index.js")) as any;
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = imageUrlToTrace;
          });

          const width = img.width;
          const height = img.height;

          if (vectorizePreset === "bw") {
            const pathList = Potrace.traceImage(img, {
              turnpolicy: turnpolicy,
              turdsize: turdsize,
              optcurve: true,
              alphamax: alphamax,
              opttolerance: opttolerance,
            });

            svgString = Potrace.getSVG(pathList, 1);
            // Replace hardcoded dimensions with original ones
            svgString = svgString.replace(
              /<svg id="svg" version="1.1" width="846" height="352"/i,
              `<svg id="svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`
            );
          } else {
            // Color multi-pass stacking vectorization
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get 2D canvas context.");
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, width, height);
            const pixels = imgData.data;

            // 1. Color Quantization via image-q
            const imageQ = (await import("image-q")) as any;
            const inPointContainer = imageQ.utils.PointContainer.fromUint8Array(new Uint8Array(pixels), width, height);
            const palette = imageQ.buildPaletteSync([inPointContainer], {
              colorDistanceFormula: "euclidean",
              paletteQuantization: "rgbquant",
              colors: numberOfColors,
            });
            const outPointContainer = imageQ.applyPaletteSync(inPointContainer, palette);
            const quantizedPixels = outPointContainer.toUint8Array();

            const pointContainer = palette.getPointContainer();
            const colorsList = pointContainer.getPointArray(); // Array of Point objects
            
            // Sort by luminance (darkest to lightest)
            const sortedColors = [...colorsList];
            sortedColors.sort((a: any, b: any) => {
              const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
              const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
              return lumA - lumB;
            });

            // Map each sorted color's RGB to its index
            const colorMap = new Map<string, number>();
            sortedColors.forEach((c: any, idx: number) => {
              colorMap.set(`${c.r},${c.g},${c.b}`, idx);
            });

            // Helper to get path data d="..."
            const getPathData = (pathList: any[]): string => {
              const bezier = (curve: any, idx: number) => {
                let b = 'C ' + curve.c[idx * 3 + 0].x.toFixed(3) + ' ' +
                    curve.c[idx * 3 + 0].y.toFixed(3) + ',';
                b += curve.c[idx * 3 + 1].x.toFixed(3) + ' ' +
                    curve.c[idx * 3 + 1].y.toFixed(3) + ',';
                b += curve.c[idx * 3 + 2].x.toFixed(3) + ' ' +
                    curve.c[idx * 3 + 2].y.toFixed(3) + ' ';
                return b;
              };

              const segment = (curve: any, idx: number) => {
                let s = 'L ' + curve.c[idx * 3 + 1].x.toFixed(3) + ' ' +
                    curve.c[idx * 3 + 1].y.toFixed(3) + ' ';
                s += curve.c[idx * 3 + 2].x.toFixed(3) + ' ' +
                    curve.c[idx * 3 + 2].y.toFixed(3) + ' ';
                return s;
              };

              let d = '';
              for (let i = 0; i < pathList.length; i++) {
                const curve = pathList[i].curve;
                const n = curve.n;
                d += 'M' + curve.c[(n - 1) * 3 + 2].x.toFixed(3) +
                    ' ' + curve.c[(n - 1) * 3 + 2].y.toFixed(3) + ' ';
                for (let j = 0; j < n; j++) {
                  if (curve.tag[j] === "CURVE") {
                    d += bezier(curve, j);
                  } else if (curve.tag[j] === "CORNER") {
                    d += segment(curve, j);
                  }
                }
              }
              return d;
            };

            // 2. Generate and trace layers (Stacking Method)
            let pathsSvgMarkup = "";
            for (let i = 0; i < sortedColors.length; i++) {
              const color = sortedColors[i];
              const bitmap = new Potrace.Bitmap(width, height);

              // Assign pixels
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const pixelIdx = (y * width + x) * 4;
                  const a = pixels[pixelIdx + 3];

                  if (a < 128) {
                    bitmap.data[y * width + x] = 0;
                    continue;
                  }

                  // Get the quantized color for this pixel
                  const r = quantizedPixels[pixelIdx];
                  const g = quantizedPixels[pixelIdx + 1];
                  const b = quantizedPixels[pixelIdx + 2];
                  const closestIdx = colorMap.get(`${r},${g},${b}`) ?? 0;

                  // Stacking: Include this pixel if it belongs to layer i or any layer on top of it (closestIdx >= i)
                  if (closestIdx >= i) {
                    bitmap.data[y * width + x] = 1;
                  } else {
                    bitmap.data[y * width + x] = 0;
                  }
                }
              }

              const pathList = Potrace.traceBitmap(bitmap, {
                turnpolicy: turnpolicy,
                turdsize: turdsize,
                optcurve: true,
                alphamax: alphamax,
                opttolerance: opttolerance,
              });

              const d = getPathData(pathList);
              if (d.trim()) {
                const hexColor = "#" + [color.r, color.g, color.b].map(x => x.toString(16).padStart(2, "0")).join("");
                pathsSvgMarkup += `<path d="${d}" fill="${hexColor}" fill-rule="evenodd" stroke="none" />\n`;
              }
            }

            svgString = `<svg id="svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n${pathsSvgMarkup}</svg>`;
          }

          URL.revokeObjectURL(imageUrlToTrace);
        } else {
          const ImageTracerModule = await import("imagetracerjs");
          const ImageTracer = (ImageTracerModule as any).default || ImageTracerModule;

          const options = {
            ltres: ltres,
            qtres: qtres,
            colorsampling: vectorizePreset === "bw" ? 0 : 2,
            numberofcolors: vectorizePreset === "bw" ? 2 : numberOfColors,
            strokewidth: strokeWidth,
            viewbox: true,
          };

          svgString = await new Promise<string>((resolve, reject) => {
            ImageTracer.imageToSVG(
              imageUrlToTrace,
              (res: string) => {
                URL.revokeObjectURL(imageUrlToTrace);
                if (res) {
                  resolve(res);
                } else {
                  reject(new Error("Failed to generate vector SVG with ImageTracer."));
                }
              },
              options
            );
          });
        }
      }

      if (!svgString) {
        throw new Error("Failed to generate vector SVG.");
      }

      // Apply path simplification and precision formatting
      try {
        const { svgPathSimplify } = (await import("svg-path-simplify")) as any;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, "image/svg+xml");
        const paths = doc.querySelectorAll("path");
        paths.forEach(p => {
          const d = p.getAttribute("d");
          if (d) {
            const simplified = svgPathSimplify(d, {
              getObject: false,
              autoAccuracy: false,
              decimals: decimalPrecision,
              tolerance: simplifyTolerance,
              simplifyBezier: true,
              toRelative: true,
              toShorthands: true,
              minifyD: 0,
            });
            p.setAttribute("d", simplified);
          }
        });
        const serializer = new XMLSerializer();
        svgString = serializer.serializeToString(doc);
      } catch (err) {
        console.error("Path simplification error:", err);
      }

      const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
      const outputUrl = URL.createObjectURL(svgBlob);

      setEditedImageUrl(outputUrl);
      setEditedImageBlob(svgBlob);
      setIsProcessing(false);
    } catch (err: any) {
      setProcessingError(err.message || "An error occurred during vectorization.");
      setIsProcessing(false);
    }
  }, [
    entry,
    ignorePreprocess,
    vectorizeEngine,
    vectorizePreset,
    numberOfColors,
    ltres,
    qtres,
    strokeWidth,
    turnpolicy,
    turdsize,
    alphamax,
    opttolerance,
    simplifyTolerance,
    decimalPrecision,
    setEditedImageUrl,
    setEditedImageBlob,
    setIsProcessing,
    setProcessingError,
  ]);

  // Auto-vectorize when options change
  useEffect(() => {
    if (isEditPanelOpen && editMode === "vectorize" && entry) {
      handleVectorize();
    }
  }, [
    isEditPanelOpen,
    editMode,
    entry,
    ignorePreprocess,
    vectorizeEngine,
    vectorizePreset,
    numberOfColors,
    ltres,
    qtres,
    strokeWidth,
    turnpolicy,
    turdsize,
    alphamax,
    opttolerance,
    simplifyTolerance,
    decimalPrecision,
    handleVectorize,
  ]);

  const settingsUi = (
    <div className="space-y-5">
      {/* Ignore Preprocessing Checkbox */}
      <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface-strong/30 p-3">
        <input
          id="ignorePreprocess"
          type="checkbox"
          checked={ignorePreprocess}
          onChange={(e) => setIgnorePreprocess(e.target.checked)}
          className="size-4 rounded border-border-strong bg-surface-strong accent-accent cursor-pointer"
        />
        <label htmlFor="ignorePreprocess" className="text-xs font-medium text-foreground cursor-pointer select-none">
          Ignore Preprocessing (Input is SVG)
        </label>
      </div>

      {!ignorePreprocess && (
        <>
          {/* Engine Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
              Vector Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVectorizeEngine("imagetracer")}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition ${
                  vectorizeEngine === "imagetracer"
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border-strong bg-surface-strong/30 text-muted hover:border-border hover:bg-surface-strong/50"
                }`}
              >
                ImageTracer
              </button>
              <button
                type="button"
                onClick={() => setVectorizeEngine("potrace")}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition ${
                  vectorizeEngine === "potrace"
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border-strong bg-surface-strong/30 text-muted hover:border-border hover:bg-surface-strong/50"
                }`}
              >
                Potrace
              </button>
            </div>
          </div>

          {/* Preset */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
              Preset Style
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setVectorizePreset("bw");
                  setNumberOfColors(2);
                }}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition ${
                  vectorizePreset === "bw"
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border-strong bg-surface-strong/30 text-muted hover:border-border hover:bg-surface-strong/50"
                }`}
              >
                Black & White
              </button>
              <button
                type="button"
                onClick={() => {
                  setVectorizePreset("color");
                  setNumberOfColors(8);
                }}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition ${
                  vectorizePreset === "color"
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border-strong bg-surface-strong/30 text-muted hover:border-border hover:bg-surface-strong/50"
                }`}
              >
                Color Posterized
              </button>
            </div>
          </div>

          {/* Colors */}
          {vectorizePreset === "color" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                  Number of Colors
                </label>
                <span className="font-mono text-xs text-muted">{numberOfColors}</span>
              </div>
              <input
                type="range"
                min="2"
                max="32"
                value={numberOfColors}
                onChange={(e) => setNumberOfColors(Number(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
              />
            </div>
          )}

          {vectorizeEngine === "imagetracer" ? (
            <>
              {/* Path precision (ltres) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Curve Detail (ltres)
                  </label>
                  <span className="font-mono text-xs text-muted">{ltres}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={ltres}
                  onChange={(e) => setLtres(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>

              {/* Spline precision (qtres) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Spline Detail (qtres)
                  </label>
                  <span className="font-mono text-xs text-muted">{qtres}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={qtres}
                  onChange={(e) => setQtres(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>

              {/* Stroke Width */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Stroke Width
                  </label>
                  <span className="font-mono text-xs text-muted">{strokeWidth}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>
            </>
          ) : (
            <>
              {/* Turd Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Suppress Speckles (turdsize)
                  </label>
                  <span className="font-mono text-xs text-muted">{turdsize} px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={turdsize}
                  onChange={(e) => setTurdsize(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>

              {/* Alphamax */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Corner Threshold (alphamax)
                  </label>
                  <span className="font-mono text-xs text-muted">{alphamax}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.3"
                  step="0.1"
                  value={alphamax}
                  onChange={(e) => setAlphamax(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>

              {/* Opt Tolerance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                    Optimization Tolerance
                  </label>
                  <span className="font-mono text-xs text-muted">{opttolerance}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={opttolerance}
                  onChange={(e) => setOpttolerance(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                />
              </div>

              {/* Turn Policy */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                  Turn Policy
                </label>
                <select
                  value={turnpolicy}
                  onChange={(e: any) => setTurnpolicy(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-strong/30 p-2 text-xs text-foreground transition focus:border-accent outline-none"
                >
                  <option value="right" className="bg-surface-strong">Right</option>
                  <option value="left" className="bg-surface-strong">Left</option>
                  <option value="black" className="bg-surface-strong">Black</option>
                  <option value="white" className="bg-surface-strong">White</option>
                  <option value="minority" className="bg-surface-strong">Minority</option>
                  <option value="majority" className="bg-surface-strong">Majority</option>
                </select>
              </div>
            </>
          )}
        </>
      )}

      <div className="border-t border-border/60 pt-3 mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-accent">
            Post-Processing
          </h4>
          {editedImageBlob?.type === "image/svg+xml" && (
            <span className="text-[10px] font-mono font-bold text-muted-strong bg-surface-strong px-2 py-0.5 rounded">
              {(editedImageBlob.size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        {/* Path Smoothing / Simplification */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
              Smoothing Intensity
            </label>
            <span className="font-mono text-xs text-muted">{simplifyTolerance}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={simplifyTolerance}
            onChange={(e) => setSimplifyTolerance(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
          />
        </div>

        {/* Number / Transform Decimal Precision */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
              Decimal Precision
            </label>
            <span className="font-mono text-xs text-muted">{decimalPrecision}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={decimalPrecision}
            onChange={(e) => setDecimalPrecision(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
          />
        </div>
      </div>

      {processingError && (
        <Alert variant="destructive">
          <AlertDescription className="text-[11px]">{processingError}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const footerUi = (
    <div className="border-t border-border/60 pt-4 space-y-2">
      <Button
        className="w-full text-xs font-semibold"
        size="sm"
        type="button"
        disabled={isProcessing}
        onClick={handleVectorize}
      >
        {isProcessing && <LoaderCircle className="size-3 animate-spin mr-1.5" />}
        Vectorize Image
      </Button>
      {editedImageUrl && (
        <>
          <Button
            className="w-full text-xs font-semibold"
            size="sm"
            variant="outline"
            type="button"
            onClick={handleSaveCopy}
          >
            Save as Copy
          </Button>
          <Button
            className="w-full text-xs text-muted-strong hover:text-foreground"
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              setEditedImageUrl(null);
              setEditedImageBlob(null);
            }}
          >
            Reset Preview
          </Button>
        </>
      )}
    </div>
  );

  return {
    settingsUi,
    footerUi,
    handleVectorize,
  };
}
