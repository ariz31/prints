import type { SVGProps } from "react";
import {
  Archive, ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleDot, CircleHelp, ClipboardCheck, Copy, Crop, Eraser,
  Download, FileInput, FilePlus2, FileText, FolderOpen, Images,
  Layers3, LayoutDashboard, LayoutTemplate, Move, Plus, Printer, RectangleHorizontal,
  Redo2, RectangleVertical, RefreshCw, RotateCcw, Ruler, Save, Settings2,
  SlidersHorizontal, Square, Trash2, Undo2, Upload, Workflow, X,
} from "lucide-react";

/** Central icon vocabulary: consistent Lucide strokes throughout PRINTS. */
const icons = {
  settings: Settings2,
  preview: LayoutDashboard,
  images: Images,
  print: Printer,
  upload: Upload,
  download: Download,
  help: CircleHelp,
  crop: Crop,
  close: X,
  save: Save,
  paper: FileText,
  orientation: RectangleHorizontal,
  portrait: RectangleVertical,
  advanced: SlidersHorizontal,
  presets: LayoutTemplate,
  workflows: Workflow,
  projects: FolderOpen,
  chevron: ChevronDown,
  ruler: Ruler,
  refresh: RefreshCw,
  new: FilePlus2,
  delete: Trash2,
  open: FolderOpen,
  import: FileInput,
  backup: Archive,
  apply: Check,
  undo: Undo2,
  redo: Redo2,
  reset: RotateCcw,
  plus: Plus,
  preflight: ClipboardCheck,
  edit: SlidersHorizontal,
  background: Eraser,
  layers: Layers3,
  duplicate: Copy,
  record: CircleDot,
  stop: Square,
  up: ArrowUp,
  down: ArrowDown,
  left: ChevronLeft,
  right: ChevronRight,
  arrange: Move,
} as const;

export type StudioIconName = keyof typeof icons;
export default function StudioIcon({
  name, size = 20, ...props
}: { name: StudioIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "children">) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" {...props} />;
}
