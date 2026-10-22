import type { SVGProps } from "react";
import {
  Archive, Check, ChevronDown, CircleHelp, ClipboardCheck, Crop,
  Download, FileInput, FilePlus2, FileText, FolderOpen, Images,
  LayoutDashboard, LayoutTemplate, Plus, Printer, RectangleHorizontal,
  RefreshCw, RotateCcw, RotateCw, Ruler, Save, Settings2,
  SlidersHorizontal, Trash2, Undo2, Upload, Workflow, X,
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
  redo: RotateCw,
  reset: RotateCcw,
  plus: Plus,
  preflight: ClipboardCheck,
} as const;

export type StudioIconName = keyof typeof icons;
export default function StudioIcon({
  name, size = 20, ...props
}: { name: StudioIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "children">) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" {...props} />;
}
