import StudioIcon from "../../shared/components/StudioIcon.tsx";

export interface MobileTabsProps {
  mobileView: string;
  navigateView: (view: "modes" | "preview" | "images" | "print") => void;
}

export default function MobileTabs({ mobileView, navigateView }: MobileTabsProps) {
  return (
    <nav className="mobile-tabs" aria-label="Mobile workspace navigation">
      <button
        type="button"
        className={mobileView === "modes" ? "active" : ""}
        aria-current={mobileView === "modes" ? "page" : undefined}
        onClick={() => navigateView("modes")}
      >
        <StudioIcon name="presets" size={21} />
        <span>Modes</span>
      </button>
      <button
        type="button"
        className={mobileView === "preview" ? "active" : ""}
        aria-current={mobileView === "preview" ? "page" : undefined}
        onClick={() => navigateView("preview")}
      >
        <StudioIcon name="preview" size={21} />
        <span>Preview</span>
      </button>
      <button
        type="button"
        className={mobileView === "images" ? "active" : ""}
        aria-current={mobileView === "images" ? "page" : undefined}
        onClick={() => navigateView("images")}
      >
        <StudioIcon name="images" size={21} />
        <span>Images</span>
      </button>
      <button
        type="button"
        className={mobileView === "print" ? "active" : ""}
        aria-current={mobileView === "print" ? "page" : undefined}
        onClick={() => navigateView("print")}
      >
        <StudioIcon name="print" size={21} />
        <span>Print</span>
      </button>
    </nav>
  );
}
