import type { PhotoAsset } from "../core/exportPdf.ts";
import type { DesignLayer } from "../core/layers.ts";
import { newLayer } from "../core/layers.ts";

interface Props {
  item: PhotoAsset;
  onChange: (item: PhotoAsset) => void;
  onClose: () => void;
}
type RectKey = "x" | "y" | "width" | "height";

export default function LayerPanel({ item, onChange, onClose }: Props) {
  const layers = item.layers ?? [];
  function update(next: DesignLayer[]) {
    onChange({ ...item, layers: next });
  }
  function add(kind: DesignLayer["kind"]) {
    update([...layers, newLayer(kind)]);
  }
  function change(id: string, updater: (layer: DesignLayer) => DesignLayer) {
    update(layers.map((layer) => layer.id === id ? updater(layer) : layer));
  }
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= layers.length) return;
    const changed = [...layers];
    [changed[index], changed[target]] = [changed[target], changed[index]];
    update(changed);
  }
  function rectChange(layer: DesignLayer, key: RectKey, percent: number): DesignLayer {
    if (!Number.isFinite(percent)) return layer;
    const value = Math.max(0, Math.min(100, percent)) / 100;
    const candidate = { ...layer, [key]: value };
    if (key === "x") candidate.x = Math.min(candidate.x, 1 - candidate.width);
    if (key === "y") candidate.y = Math.min(candidate.y, 1 - candidate.height);
    if (key === "width") candidate.width = Math.min(1 - candidate.x, Math.max(.01, candidate.width));
    if (key === "height") candidate.height = Math.min(1 - candidate.y, Math.max(.01, candidate.height));
    return candidate;
  }
  function copy(layer: DesignLayer) {
    update([...layers, { ...layer, id: crypto.randomUUID(), name: layer.name + " copy",
      x: Math.min(layer.x + .03, 1 - layer.width), y: Math.min(layer.y + .03, 1 - layer.height) }]);
  }

  return <section className="layers-editor" aria-label="Text and shape design layers">
    <div className="crop-toolbar">
      <div><h2>Design layers</h2>
        <p>{item.name} · Editable text and shapes are duplicated with this print design.</p></div>
      <button className="secondary-button" onClick={onClose}>Close</button>
    </div>
    <div className="background-actions">
      <button className="secondary-button" onClick={() => add("text")}>+ Text</button>
      <button className="secondary-button" onClick={() => add("rectangle")}>+ Rectangle</button>
      <button className="secondary-button" onClick={() => add("ellipse")}>+ Ellipse</button>
    </div>
    {layers.length === 0 && <p className="hint">Add an editable text label or a geometric shape. Layers appear on every repeated copy of this design.</p>}
    <div className="layer-list">
      {layers.map((layer, index) => <div className="layer-row" key={layer.id}>
        <div className="workflow-step-title">
          <label className="check-row"><input type="checkbox" checked={layer.visible}
            onChange={(e) => change(layer.id, (old) => ({ ...old, visible: e.target.checked }))} />
            {index + 1}. {layer.kind} — {layer.name}</label>
          <div className="step-buttons">
            <button aria-label="Move layer back" disabled={index === 0} onClick={() => move(index, -1)}>↓</button>
            <button aria-label="Move layer forward" disabled={index === layers.length - 1} onClick={() => move(index, 1)}>↑</button>
            <button aria-label="Duplicate layer" onClick={() => copy(layer)}>⧉</button>
            <button aria-label="Remove layer" onClick={() => update(layers.filter((v) => v.id !== layer.id))}>×</button>
          </div>
        </div>
        <div className="layer-controls">
          <label>Layer name
            <input type="text" maxLength={100} value={layer.name}
              onChange={(e) => change(layer.id, (old) => ({ ...old, name: e.target.value }))} />
          </label>
          <label>Color
            <input type="color" value={layer.color}
              onChange={(e) => change(layer.id, (old) => ({ ...old, color: e.target.value }))} />
          </label>
          {(["x", "y", "width", "height"] as const).map((key) =>
            <label key={key}>{key.toUpperCase()} (%)
              <input type="number" min={0} max={100} step={1} value={Math.round(layer[key] * 100)}
                onChange={(e) => change(layer.id, (old) => rectChange(old, key, Number(e.target.value)))} />
            </label>)}
          {layer.kind === "text" && <>
            <label>Text
              <textarea rows={2} maxLength={300} value={layer.text}
                onChange={(e) => change(layer.id, (old) => old.kind === "text"
                  ? { ...old, text: e.target.value } : old)} />
            </label>
            <label>Font size (pt)
              <input type="number" min={4} max={180} value={layer.fontSizePt}
                onChange={(e) => change(layer.id, (old) => old.kind === "text"
                  ? { ...old, fontSizePt: Math.max(4, Math.min(180, Number(e.target.value) || 4)) } : old)} />
            </label>
          </>}
        </div>
      </div>)}
    </div>
    <p className="hint">Layer coordinates are relative to the printed design, not the screen. PDF uses vector text and shapes. Standard PDF Helvetica supports limited character sets; unsupported glyphs will require embedded fonts in a later release.</p>
  </section>;
}
