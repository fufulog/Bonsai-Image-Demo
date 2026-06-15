import { useCallback, useState, useEffect } from "react";
import { Download, LoaderCircle, Share2, Wand2, ArrowLeft, X, Sparkles, Spline } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryEntry } from "@/lib/use-history";
import { useHistory } from "@/lib/use-history";
import { buildMetadata, downloadWithMetadata, injectMetadata } from "@/lib/png-metadata";
import { resolutionById } from "@/lib/resolutions";
import { useVectorizer } from "@/components/vectorize-panel";

interface ResultPanelProps {
  downloadName: string;
  error: string | null;
  imageUrl: string | null;
  isLoading: boolean;
  prompt: string;
  stats: { stepMs: number; totalMs: number; peakMemoryMb: number | null } | null;
  entry: HistoryEntry | null;
  onSaveEditedEntry?: (entry: HistoryEntry) => void;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function ResultPanel({
  downloadName,
  error,
  imageUrl,
  isLoading,
  prompt,
  stats,
  entry,
  onSaveEditedEntry,
}: ResultPanelProps) {
  const { push } = useHistory();
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editMode, setEditMode] = useState<"remove-bg" | "vectorize" | null>(null);

  // Background removal options
  const [color, setColor] = useState("#ffffff");
  const [tolerance, setTolerance] = useState(30);
  const [feather, setFeather] = useState(10);

  // Preview state
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [editedImageBlob, setEditedImageBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Reset edit state when switching generated images
  useEffect(() => {
    setEditedImageUrl(null);
    setEditedImageBlob(null);
    setIsEditPanelOpen(false);
    setEditMode(null);
    setColor("#ffffff");
    setTolerance(30);
    setFeather(10);
  }, [entry?.id]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (editedImageUrl) {
        URL.revokeObjectURL(editedImageUrl);
      }
    };
  }, [editedImageUrl]);

  const handleSaveCopy = useCallback(() => {
    if (!entry || !editedImageBlob) return;
    const isSvg = editedImageBlob.type === "image/svg+xml";
    const newEntry = push({
      prompt: `${entry.prompt} (${isSvg ? "vectorized" : "transparent"})`,
      params: entry.params,
      imageBlob: editedImageBlob,
    });
    if (onSaveEditedEntry) {
      onSaveEditedEntry(newEntry);
    }
    setIsEditPanelOpen(false);
    setEditMode(null);
  }, [entry, editedImageBlob, push, onSaveEditedEntry]);

  const { settingsUi: vectorizeSettings, footerUi: vectorizeFooter } = useVectorizer({
    entry,
    isProcessing,
    setIsProcessing,
    processingError,
    setProcessingError,
    editedImageUrl,
    editedImageBlob,
    setEditedImageUrl,
    setEditedImageBlob,
    handleSaveCopy: handleSaveCopy,
    isEditPanelOpen,
    editMode,
  });

  const handleSave = useCallback(async () => {
    if (!entry) return;
    const blobToSave = editedImageBlob ?? entry.imageBlob;
    if (blobToSave.type === "image/svg+xml") {
      const url = URL.createObjectURL(blobToSave);
      const a = document.createElement("a");
      const svgFilename = downloadName.replace(/\.png$/i, ".svg");
      a.href = url;
      a.download = svgFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      const res = resolutionById(entry.params.resolutionId);
      const meta = buildMetadata(entry, `${res.width}x${res.height}`);
      await downloadWithMetadata(blobToSave, downloadName, meta);
    }
  }, [entry, downloadName, editedImageBlob]);

  const handlePreview = useCallback(async () => {
    if (!entry) return;
    setIsProcessing(true);
    setProcessingError(null);
    try {
      const base64Image = await blobToBase64(entry.imageBlob);
      const res = await fetch("/api/edit/color-to-alpha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: base64Image,
          color,
          tolerance,
          feather,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to process image.");
      }
      const outputBlob = await res.blob();
      const outputUrl = URL.createObjectURL(outputBlob);
      
      if (editedImageUrl) {
        URL.revokeObjectURL(editedImageUrl);
      }
      
      setEditedImageUrl(outputUrl);
      setEditedImageBlob(outputBlob);
    } catch (err: any) {
      setProcessingError(err.message || "An error occurred.");
    } finally {
      setIsProcessing(false);
    }
  }, [entry, color, tolerance, feather, editedImageUrl]);

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border-strong bg-surface-raised p-3 shadow-[var(--panel-shadow)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,var(--halo-a),transparent_22%),radial-gradient(circle_at_82%_18%,var(--halo-b),transparent_18%),linear-gradient(180deg,transparent,rgba(0,0,0,0.04))]" />
        <div className="absolute right-5 top-5 hidden opacity-[0.06] sm:block dark:opacity-[0.12]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden
            src="/brand/bonsai-logo-horizontal-dark.svg"
            className="block h-14 w-auto dark:hidden"
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden
            src="/brand/bonsai-logo-stacked-light.svg"
            className="hidden h-24 w-auto dark:block"
            draggable={false}
          />
        </div>

        {error ? (
          <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-surface-strong px-6 text-center backdrop-blur-md xl:min-h-[520px]">
            <Alert variant="destructive" className="max-w-[520px] text-left">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[1.5rem] bg-surface-strong px-8 text-center backdrop-blur-md xl:min-h-[620px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,var(--accent-soft),transparent_58%)]"
            />
            <span
              aria-hidden
              className="block h-32 w-32 bg-accent motion-safe:animate-[bonsai-breathe_2.4s_ease-in-out_infinite]"
              style={{
                WebkitMaskImage: "url('/brand/bonsai-icon-horizontal-dark.svg')",
                maskImage: "url('/brand/bonsai-icon-horizontal-dark.svg')",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
            <div className="relative mt-8 flex items-center gap-2.5 text-sm font-medium text-foreground">
              <LoaderCircle className="size-4 animate-spin text-accent" />
              <span>Rendering…</span>
            </div>
          </div>
        ) : imageUrl ? (
          <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-surface-strong p-5 backdrop-blur-md sm:p-7 xl:min-h-[620px]">
            <div className="absolute inset-x-8 bottom-8 h-14 rounded-full bg-black/10 blur-3xl light:bg-[rgba(38,44,53,0.08)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={prompt || "Generated image"}
              className="relative z-10 max-h-[min(70vh,900px)] max-w-full rounded-[1.5rem] object-contain shadow-[0_42px_84px_-48px_rgba(0,0,0,0.52)]"
              src={editedImageUrl ?? imageUrl}
            />
            {editedImageUrl && (
              <span className="absolute left-6 top-6 z-20 rounded-full bg-accent/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink shadow-lg">
                Preview ({editedImageBlob?.type === "image/svg+xml" ? `Vector SVG (${(editedImageBlob.size / 1024).toFixed(1)} KB)` : "Transparent"})
              </span>
            )}
          </div>
        ) : (
          <div className="relative min-h-[360px] overflow-hidden rounded-[1.5rem] bg-surface-strong backdrop-blur-md xl:min-h-[520px]" />
        )}

        {/* Sliding Edit Panel */}
        {isEditPanelOpen && entry && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border-strong bg-surface-raised/95 p-6 shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out sm:w-[320px] rounded-r-[1.75rem]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                {editMode && (
                  <button
                    type="button"
                    onClick={() => setEditMode(null)}
                    className="rounded-full p-1 text-muted transition hover:bg-surface-strong hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                <h3 className="font-semibold text-sm text-foreground">
                  {editMode === "remove-bg" ? "Remove Background" : editMode === "vectorize" ? "Vectorize Image" : "Edit Image"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPanelOpen(false)}
                className="rounded-full p-1 text-muted transition hover:bg-surface-strong hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {editMode === null ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setEditMode("remove-bg")}
                    className="flex w-full items-start gap-3 rounded-xl border border-border-strong bg-surface-strong/50 p-3.5 text-left transition hover:border-accent hover:bg-surface-strong"
                  >
                    <Sparkles className="mt-0.5 size-4 text-accent" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">Remove Background</div>
                      <div className="text-[10px] leading-relaxed text-muted-strong mt-1">
                        Convert a solid color backdrop to alpha transparency.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditMode("vectorize")}
                    className="flex w-full items-start gap-3 rounded-xl border border-border-strong bg-surface-strong/50 p-3.5 text-left transition hover:border-accent hover:bg-surface-strong"
                  >
                    <Spline className="mt-0.5 size-4 text-accent" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">Vectorize Image</div>
                      <div className="text-[10px] leading-relaxed text-muted-strong mt-1">
                        Convert the bitmap image into scalable vector graphics (SVG).
                      </div>
                    </div>
                  </button>
                </div>
              ) : editMode === "remove-bg" ? (
                <div className="space-y-5">
                  {/* Color Picker */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                      Target Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="size-9 cursor-pointer rounded-lg border border-border-strong bg-transparent p-0.5"
                      />
                      <Input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-9 font-mono text-xs uppercase"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>

                  {/* Tolerance */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                        Tolerance
                      </label>
                      <span className="font-mono text-xs text-muted">{tolerance}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                    />
                  </div>

                  {/* Feather */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-strong">
                        Feather
                      </label>
                      <span className="font-mono text-xs text-muted">{feather}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={feather}
                      onChange={(e) => setFeather(Number(e.target.value))}
                      className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-strong accent-accent"
                    />
                  </div>

                  {processingError && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-[11px]">{processingError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                vectorizeSettings
              )}
            </div>

            {/* Footer actions for tool */}
            {editMode === "remove-bg" && (
              <div className="border-t border-border/60 pt-4 space-y-2">
                <Button
                  className="w-full text-xs font-semibold"
                  size="sm"
                  type="button"
                  disabled={isProcessing}
                  onClick={handlePreview}
                >
                  {isProcessing && <LoaderCircle className="size-3 animate-spin mr-1.5" />}
                  Preview Changes
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
            )}

            {editMode === "vectorize" && vectorizeFooter}
          </div>
        )}
      </div>

      {imageUrl ? (
        <div className="flex flex-col gap-4 border-t border-border/80 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="max-w-[44ch] text-sm leading-6 text-foreground">{prompt || "Generated image"}</p>
            <p className="text-xs text-muted">
              total {stats ? formatSeconds(stats.totalMs) : "—"} · avg step {stats ? formatSeconds(stats.stepMs) : "—"}
              {stats?.peakMemoryMb != null ? ` · peak ${stats.peakMemoryMb.toFixed(0)} MB` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {entry && (
              <Button size="lg" variant="outline" type="button" onClick={() => setIsEditPanelOpen(true)}>
                <Wand2 className="size-4 text-accent" />
                Edit
              </Button>
            )}
            <ShareButton
              entry={entry}
              downloadName={downloadName}
              prompt={prompt}
              imageUrl={imageUrl}
              editedImageBlob={editedImageBlob}
            />
            <Button size="lg" type="button" onClick={handleSave} disabled={!entry}>
              <Download className="size-4" />
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ShareButton({
  entry,
  imageUrl,
  downloadName,
  prompt,
  editedImageBlob,
}: {
  entry: HistoryEntry | null;
  imageUrl: string;
  downloadName: string;
  prompt: string;
  editedImageBlob?: Blob | null;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Probe support at click time rather than render time so SSR stays
  // deterministic (navigator only exists client-side).
  const detectSupport = useCallback(() => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    if (typeof navigator.canShare !== "function") return false;
    return true;
  }, []);

  const handleShare = useCallback(async () => {
    if (busy) return;
    if (!detectSupport()) {
      setSupported(false);
      return;
    }
    setBusy(true);
    try {
      let blob: Blob;
      let name = downloadName;
      if (entry) {
        if (editedImageBlob && editedImageBlob.type === "image/svg+xml") {
          blob = editedImageBlob;
          name = downloadName.replace(/\.png$/i, ".svg");
        } else {
          const res = resolutionById(entry.params.resolutionId);
          const meta = buildMetadata(entry, `${res.width}x${res.height}`);
          blob = await injectMetadata(entry.imageBlob, meta);
        }
      } else {
        blob = await fetch(imageUrl).then((r) => r.blob());
      }
      const file = new File([blob], name, { type: blob.type || "image/png" });
      const data: ShareData = { files: [file], title: prompt || "Bonsai render" };
      if (!navigator.canShare(data)) {
        setSupported(false);
        return;
      }
      await navigator.share(data);
      setSupported(true);
    } catch {
      // User dismissed the share sheet, or the platform refused mid-flight.
    } finally {
      setBusy(false);
    }
  }, [busy, detectSupport, downloadName, entry, imageUrl, prompt, editedImageBlob]);

  if (supported === false) return null;

  return (
    <Button size="lg" variant="outline" type="button" onClick={handleShare} disabled={busy}>
      <Share2 className="size-4" />
      Share
    </Button>
  );
}
