import { memo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SheetPage, Placement, Orientation, TrimStyle } from "../../../domain/models/sheet.ts";
import type { PhotoAsset } from "../../../domain/models/asset.ts";
import type { TrimLine } from "../../../domain/geometry/cutMarks.ts";
import { cornerCutLines } from "../../../domain/geometry/cutMarks.ts";
import { NOTEPAD_CUT_GUIDE_STYLE } from "../logic/notepadLayout.ts";
import { pageUtilization } from "../logic/layout.ts";
import { formatPreviewCaption } from "../logic/previewCaption.ts";
import { shapeClipPath, shapePolygonMm } from "../../crop/index.ts";
import FrameSvg from "../../frames/index.ts";
import { fontCssName } from "../../../platform/fonts/fontAssets.ts";
import BoundedNumberField from "../../../shared/components/BoundedNumberField.tsx";

export interface SheetPreviewProps {
  page: SheetPage;
  paper: { widthMm: number; heightMm: number };
  paperLabel: string;
  orientation: Orientation;
  sheetCount: number;
  totalCopies: number;
  printCoverage?: string;
  items: ReadonlyArray<PhotoAsset>;
  previews: Record<string, string>;
  guides: boolean;
  trimStyle: TrimStyle;
  index: number;
  arrange: boolean;
  marginMm: number;
  notepadCuts?: readonly TrimLine[];
  onRotate: (itemId: string, copyIndex: number) => void;
  onMove: (itemId: string, copyIndex: number, xMm: number, yMm: number) => void;
  selectedCopy?: { itemId: string; copyIndex: number } | null;
  onSelectCopy?: (itemId: string, copyIndex: number) => void;
}

interface DragState {
  id: string;
  copy: number;
  pointer: number;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  deltaPxX: number;
  deltaPxY: number;
}

export function areSheetPreviewPropsEqual(prev: SheetPreviewProps, next: SheetPreviewProps): boolean {
  if (prev.index !== next.index) return false;
  if (prev.sheetCount !== next.sheetCount) return false;
  if (prev.totalCopies !== next.totalCopies) return false;
  if (prev.paperLabel !== next.paperLabel) return false;
  if (prev.orientation !== next.orientation) return false;
  if (prev.guides !== next.guides) return false;
  if (prev.trimStyle !== next.trimStyle) return false;
  if (prev.arrange !== next.arrange) return false;
  if (prev.selectedCopy?.itemId !== next.selectedCopy?.itemId ||
      prev.selectedCopy?.copyIndex !== next.selectedCopy?.copyIndex) return false;
  if (prev.marginMm !== next.marginMm) return false;
  if (prev.printCoverage !== next.printCoverage) return false;

  // Paper numeric equality
  if (prev.paper.widthMm !== next.paper.widthMm || prev.paper.heightMm !== next.paper.heightMm) {
    return false;
  }

  // Page placements equality
  if (prev.page !== next.page) {
    if (prev.page.pageNumber !== next.page.pageNumber) return false;
    if (prev.page.placements.length !== next.page.placements.length) return false;
    for (let i = 0; i < prev.page.placements.length; i++) {
      const p1 = prev.page.placements[i];
      const p2 = next.page.placements[i];
      if (
        p1.itemId !== p2.itemId ||
        p1.copyIndex !== p2.copyIndex ||
        p1.xMm !== p2.xMm ||
        p1.yMm !== p2.yMm ||
        p1.widthMm !== p2.widthMm ||
        p1.heightMm !== p2.heightMm ||
        p1.rotated !== p2.rotated ||
        p1.serial?.text !== p2.serial?.text
      ) {
        return false;
      }
    }
  }

  // Item instances placed on this page
  if (prev.items !== next.items) {
    for (const p of next.page.placements) {
      const prevItem = prev.items.find(it => it.id === p.itemId);
      const nextItem = next.items.find(it => it.id === p.itemId);
      if (prevItem !== nextItem) return false;
    }
  }

  // Preview URLs for items on this page
  if (prev.previews !== next.previews) {
    for (const p of next.page.placements) {
      if (prev.previews[p.itemId] !== next.previews[p.itemId]) return false;
    }
  }

  // Notepad cut lines
  if (prev.notepadCuts !== next.notepadCuts) {
    if (!prev.notepadCuts || !next.notepadCuts) return false;
    if (prev.notepadCuts.length !== next.notepadCuts.length) return false;
  }

  return true;
}

function SheetPreviewComponent({
  page,
  paper,
  paperLabel,
  orientation,
  sheetCount,
  totalCopies,
  printCoverage,
  items,
  previews,
  guides,
  trimStyle,
  index,
  arrange,
  marginMm,
  notepadCuts,
  onRotate,
  onMove,
  selectedCopy,
  onSelectCopy,
}: SheetPreviewProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const activeTapPointers = useRef(new Map<number, { x: number; y: number }>());
  const suppressTap = useRef(false);
  const [draft, setDraft] = useState<{ id: string; copy: number; xMm: number; yMm: number; deltaPxX: number; deltaPxY: number } | null>(null);
  const [selected, setSelected] = useState<{ id: string; copy: number } | null>(null);

  const selectedPlacement = page.placements.find(p => p.itemId === selected?.id && p.copyIndex === selected.copy);
  const activeSelection = arrange ? { itemId: selected?.id, copyIndex: selected?.copy } : selectedCopy;
  const lookup = new Map(items.map(item => [item.id, item]));
  const selectablePlacements = page.placements.filter(placement => lookup.has(placement.itemId));

  function placeForPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = sheetRef.current?.getBoundingClientRect();
    if (!drag || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const deltaPxX = event.clientX - drag.clientX;
    const deltaPxY = event.clientY - drag.clientY;
    return {
      id: drag.id,
      copy: drag.copy,
      deltaPxX,
      deltaPxY,
      xMm: drag.originX + (deltaPxX / bounds.width) * paper.widthMm,
      yMm: drag.originY + (deltaPxY / bounds.height) * paper.heightMm,
    };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!arrange) {
      const start = activeTapPointers.current.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
        suppressTap.current = true;
      }
      return;
    }
    if (dragRef.current?.pointer !== event.pointerId) return;
    const next = placeForPointer(event);
    if (next) setDraft(next);
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>, cancel = false) {
    if (!arrange) {
      activeTapPointers.current.delete(event.pointerId);
      if (cancel) suppressTap.current = true;
      return;
    }
    if (dragRef.current?.pointer !== event.pointerId) return;
    const next = placeForPointer(event);
    dragRef.current = null;
    setDraft(null);
    if (!cancel && next) onMove(next.id, next.copy, next.xMm, next.yMm);
  }

  function nudge(event: ReactKeyboardEvent<HTMLDivElement>, p: Placement) {
    if (!arrange) {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!direction || !selectablePlacements.length) return;
      event.preventDefault();
      const current = selectablePlacements.findIndex(candidate =>
        candidate.itemId === p.itemId && candidate.copyIndex === p.copyIndex);
      const nextIndex = (current + direction + selectablePlacements.length) % selectablePlacements.length;
      const next = selectablePlacements[nextIndex];
      onSelectCopy?.(next.itemId, next.copyIndex);
      sheetRef.current?.querySelectorAll<HTMLElement>(".placed[role=button]")[nextIndex]?.focus();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const change = moves[event.key];
    if (!change) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 1;
    onMove(p.itemId, p.copyIndex, p.xMm + change[0] * step, p.yMm + change[1] * step);
  }

  return (
    <div className="sheet-wrap" style={{ "--sheet-controls-height": arrange ? "136px" : "36px" } as CSSProperties}>
      <div
        ref={sheetRef}
        className={"sheet" + (arrange ? " sheet-arrange" : "")}
        role="group"
        aria-label={"Preview of sheet " + (index + 1)}
        style={{
          aspectRatio: String(paper.widthMm) + " / " + String(paper.heightMm),
          "--sheet-ratio":paper.widthMm/paper.heightMm,
        } as CSSProperties}
      >
        {arrange && (
          <div
            className="print-safe-boundary"
            aria-label={"Print-safe margins: " + marginMm + " mm"}
            style={{
              left: (marginMm / paper.widthMm) * 100 + "%",
              top: (marginMm / paper.heightMm) * 100 + "%",
              right: (marginMm / paper.widthMm) * 100 + "%",
              bottom: (marginMm / paper.heightMm) * 100 + "%",
            }}
          />
        )}

        {page.placements.map(placement => {
          const item = lookup.get(placement.itemId);
          if (!item) return null;
          const moving = draft?.id === placement.itemId && draft.copy === placement.copyIndex;
          const isSelected = activeSelection?.itemId === placement.itemId && activeSelection?.copyIndex === placement.copyIndex;

          // GPU-accelerated CSS transform translation during interactive drag
          const transformStyle = moving && draft
            ? `translate3d(${draft.deltaPxX}px, ${draft.deltaPxY}px, 0)`
            : undefined;

          return (
            <div
              key={placement.itemId + "-" + placement.copyIndex}
              className={
                "placed" +
                (arrange ? " movable-print" : " selectable-print") +
                (isSelected ? " is-selected" : "") +
                (guides && !notepadCuts && trimStyle === "outline" && (!item.cropShape || item.cropShape === "rectangle")
                  ? " with-guides"
                  : "")
              }
              role="button"
              tabIndex={arrange || isSelected ||
                (!activeSelection?.itemId && selectablePlacements[0] === placement) ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={(arrange ? "Move " : "Edit ") + item.name + " copy " + (placement.copyIndex + 1)}
              onFocus={() => { if (arrange) setSelected({ id: placement.itemId, copy: placement.copyIndex }); }}
              onClick={() => {
                if (!arrange && !suppressTap.current) onSelectCopy?.(placement.itemId, placement.copyIndex);
              }}
              onKeyDown={event => {
                if (!arrange && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectCopy?.(placement.itemId, placement.copyIndex);
                } else {
                  nudge(event, placement);
                }
              }}
              onPointerDown={event => {
                if (!arrange) {
                  if (event.pointerType === "mouse" && event.button !== 0) return;
                  if (activeTapPointers.current.size === 0) suppressTap.current = false;
                  activeTapPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                  if (activeTapPointers.current.size > 1) suppressTap.current = true;
                  return;
                }
                if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
                event.preventDefault();
                setSelected({ id: placement.itemId, copy: placement.copyIndex });
                event.currentTarget.focus();
                dragRef.current = {
                  id: placement.itemId,
                  copy: placement.copyIndex,
                  pointer: event.pointerId,
                  originX: placement.xMm,
                  originY: placement.yMm,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  deltaPxX: 0,
                  deltaPxY: 0,
                };
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  dragRef.current = null;
                }
              }}
              onPointerMove={move}
              onPointerUp={event => finish(event)}
              onPointerCancel={event => finish(event, true)}
              onLostPointerCapture={event => finish(event, true)}
              style={{
                left: String((placement.xMm / paper.widthMm) * 100) + "%",
                top: String((placement.yMm / paper.heightMm) * 100) + "%",
                width: String((placement.widthMm / paper.widthMm) * 100) + "%",
                height: String((placement.heightMm / paper.heightMm) * 100) + "%",
                clipPath: shapeClipPath(item.cropShape, !!placement.rotated),
                transform: transformStyle,
                willChange: moving ? "transform" : undefined,
                zIndex: moving ? 10 : undefined,
              }}
            >
              {previews[item.id] ? (
                <img
                  src={previews[item.id]}
                  alt=""
                  draggable={false}
                  style={
                    placement.rotated
                      ? {
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          width: (placement.heightMm / placement.widthMm) * 100 + "%",
                          height: (placement.widthMm / placement.heightMm) * 100 + "%",
                          maxWidth: "none",
                          transform: "translate(-50%, -50%) rotate(90deg)",
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="photo-loading" aria-label="Preparing exact crop preview" />
              )}

              {(item.layers ?? [])
                .filter(layer => layer.visible)
                .map(layer =>
                  layer.kind === "frame" ? (
                    <div
                      key={layer.id}
                      className="print-layer print-layer-frame"
                      style={{ inset: 0, opacity: layer.opacity ?? 1 }}
                    >
                      <FrameSvg
                        frameId={layer.frameId}
                        widthMm={item.widthMm}
                        heightMm={item.heightMm}
                        weight={layer.weight}
                        inset={layer.inset}
                        spacing={layer.spacing}
                        color={layer.color}
                      />
                    </div>
                  ) : (
                    <div
                      key={layer.id}
                      className={"print-layer print-layer-" + layer.kind}
                      style={{
                        left: layer.x * 100 + "%",
                        top: layer.y * 100 + "%",
                        width: layer.width * 100 + "%",
                        height: layer.height * 100 + "%",
                        color: layer.color,
                        opacity: layer.opacity ?? 1,
                        backgroundColor: layer.kind === "text" ? "transparent" : layer.color,
                        fontSize:
                          layer.kind === "text"
                            ? String(((layer.fontSizePt / 72) * 25.4) / item.widthMm * 100) + "cqw"
                            : undefined,
                        fontFamily: layer.kind === "text" ? fontCssName(layer) : undefined,
                        whiteSpace: layer.kind === "text" ? "pre" : undefined,
                        textAlign: layer.kind === "text" ? layer.align ?? "left" : undefined,
                        lineHeight: layer.kind === "text" ? layer.lineHeightFactor ?? 1.2 : undefined,
                        WebkitTextStroke:
                          layer.kind === "text" && layer.outlinePt
                            ? String(((layer.outlinePt * 2) / 72) * 25.4 / item.widthMm * 100) +
                              "cqw " +
                              (layer.outlineColor ?? "#ffffff")
                            : undefined,
                        textShadow:
                          layer.kind === "text" && layer.shadowPt
                            ? String(((layer.shadowPt / 72) * 25.4) / item.widthMm * 100) +
                              "cqw " +
                              String(((layer.shadowPt / 72) * 25.4) / item.widthMm * 100) +
                              "cqw " +
                              (layer.shadowColor ?? "#333333")
                            : undefined,
                      }}
                    >
                      {layer.kind === "text" ? layer.text : null}
                    </div>
                  )
                )}

              {placement.serial&&<span
                className="mode-serial"
                style={{
                  left: placement.serial.xPercent + "%",
                  top: placement.serial.yPercent + "%",
                  fontSize:
                    "clamp(5px," +
                    (((placement.serial.fontSizePt * 25.4) / 72) / placement.widthMm) * 100 +
                    "cqw,28px)",
                }}
              >
                {placement.serial.text}
              </span>}
            </div>
          );
        })}

        {guides &&
          page.placements.some(p => lookup.get(p.itemId)?.cropShape && lookup.get(p.itemId)?.cropShape !== "rectangle") && (
            <svg
              className="corner-cut-overlay"
              aria-hidden="true"
              viewBox={"0 0 " + paper.widthMm + " " + paper.heightMm}
              preserveAspectRatio="none"
            >
              {page.placements
                .filter(p => lookup.get(p.itemId)?.cropShape && lookup.get(p.itemId)?.cropShape !== "rectangle")
                .map(p => {
                  const item = lookup.get(p.itemId)!;
                  const moved = draft?.id === p.itemId && draft.copy === p.copyIndex;
                  const current = moved && draft ? { ...p, xMm: draft.xMm, yMm: draft.yMm } : p;
                  const points = shapePolygonMm(
                    item.cropShape,
                    current.xMm,
                    current.yMm,
                    current.widthMm,
                    current.heightMm,
                    !!current.rotated
                  );
                  return (
                    <polygon
                      key={p.itemId + "-" + p.copyIndex}
                      points={points.map(pt => pt.x + "," + pt.y).join(" ")}
                      fill="none"
                      stroke="#b5b9ba"
                      strokeWidth=".12"
                    />
                  );
                })}
            </svg>
          )}

        {guides && !notepadCuts && trimStyle === "corner" && (
          <svg
            className="corner-cut-overlay"
            aria-hidden="true"
            viewBox={"0 0 " + paper.widthMm + " " + paper.heightMm}
            preserveAspectRatio="none"
          >
            {page.placements
              .flatMap(p => {
                const moved = draft?.id === p.itemId && draft.copy === p.copyIndex;
                const positioned = moved && draft ? { ...p, xMm: draft.xMm, yMm: draft.yMm } : p;
                return lookup.get(p.itemId)?.cropShape && lookup.get(p.itemId)?.cropShape !== "rectangle"
                  ? []
                  : cornerCutLines(positioned);
              })
              .map((line, i) => (
                <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#46514f" strokeWidth=".12" />
              ))}
          </svg>
        )}

        {guides && notepadCuts && (
          <svg
            className="corner-cut-overlay"
            aria-hidden="true"
            viewBox={"0 0 " + paper.widthMm + " " + paper.heightMm}
            preserveAspectRatio="none"
          >
            {notepadCuts.map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={NOTEPAD_CUT_GUIDE_STYLE.color}
                strokeWidth={NOTEPAD_CUT_GUIDE_STYLE.previewStrokeMm}
              />
            ))}
          </svg>
        )}
      </div>

      {arrange && (
        <div className="sheet-arrange-inspector">
          {selectedPlacement ? (
            <>
              <BoundedNumberField
                label="Copy X (mm)"
                value={selectedPlacement.xMm}
                min={marginMm}
                max={paper.widthMm - marginMm - selectedPlacement.widthMm}
                step={0.1}
                onCommit={x => onMove(selectedPlacement.itemId, selectedPlacement.copyIndex, x, selectedPlacement.yMm)}
              />
              <BoundedNumberField
                label="Copy Y (mm)"
                value={selectedPlacement.yMm}
                min={marginMm}
                max={paper.heightMm - marginMm - selectedPlacement.heightMm}
                step={0.1}
                onCommit={y => onMove(selectedPlacement.itemId, selectedPlacement.copyIndex, selectedPlacement.xMm, y)}
              />
              <button
                className="secondary-button"
                disabled={(lookup.get(selectedPlacement.itemId)?.layers ?? []).some(l => l.visible)}
                title="Quarter-turn rotation is available for photo-only designs"
                onClick={() => onRotate(selectedPlacement.itemId, selectedPlacement.copyIndex)}
              >
                Rotate 90°
              </button>
            </>
          ) : (
            <span className="hint">Select a copy to set its position in millimeters.</span>
          )}
          <span className="sheet-measurement" aria-live="polite">
            {draft
              ? draft.xMm.toFixed(1) + " × " + draft.yMm.toFixed(1) + " mm"
              : selectedPlacement
              ? selectedPlacement.widthMm + " × " + selectedPlacement.heightMm + " mm"
              : ""}
          </span>
        </div>
      )}

      <div className="sheet-caption" role="note">
        {formatPreviewCaption({
          paperLabel,
          orientation,
          sheetIndex: index + 1,
          sheetCount,
          itemCount: page.placements.length,
          copies: totalCopies,
          printCoverage,
          utilizationPercent: Math.round(
            pageUtilization(page, {
              paperWidthMm: paper.widthMm,
              paperHeightMm: paper.heightMm,
              marginMm: 0,
              gapMm: 0,
            }) * 100
          ),
        })}
      </div>
    </div>
  );
}

export const SheetPreview = memo(SheetPreviewComponent, areSheetPreviewPropsEqual);
export default SheetPreview;
