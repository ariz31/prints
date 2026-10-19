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
