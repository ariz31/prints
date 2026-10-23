# Physical print calibration

PRINTS exports physical coordinates to PDF using 72 points per inch and 25.4 mm per inch. A PDF with the correct MediaBox is necessary but **not sufficient** to guarantee exact physical print dimensions.

## Calibration workflow
1. Choose the printer's actual paper size and orientation (A4/A3/etc.).
2. Download **Printer Calibration Sheet** in Print Setup.
3. Open the PDF using a reader that supports **100% / Actual Size**. Turn off Fit, Shrink, Scale to Margins and borderless expansion unless they are required by the printer.
4. Print on the selected paper and measure the **100 mm horizontal line**, **100 mm vertical line**, and the **50.8 mm square** with a reliable ruler.
5. If either axis is incorrect, check printer scaling, paper presets, driver scaling and printer feed alignment. Some printers scale X/Y differently.
6. Confirm hardware unprintable margins and adjust PRINTS margins accordingly. Repeat the test after printer/driver changes.

## Scope
This is a diagnostic PDF, not an automatic printer driver calibration or correction profile. PDF dimensions are checked in unit tests; the physical results depend on device settings and paper feed. Calibrate each printer/paper configuration used for production.


## Operator proof record template (2026-10-24)

For each print verification, record: date; PRINTS production commit; printer make/model and driver version; ink/media/paper setting; PDF reader; scaling mode (Actual Size 100%); horizontal and vertical ruler measurements; 50.8 mm square X/Y; ID crop dimensions; A3 rotated-placement/margins and trim result; and a note on monitor-to-print color differences. If a test fails, preserve the job settings and defect reproduction, not unconsented customer photo bytes.

An automated Vercel test can validate PDF point coordinates and PNG DPI tags but cannot certify a physical printer, borderless driver mode or media color profile. See [Current-state audit](CURRENT_STATE_2026-10-24.md) and [release acceptance](RELEASE_ACCEPTANCE_2026-10-23.md).
