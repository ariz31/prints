import assert from "node:assert/strict";
import {test} from "node:test";
import {formatPreviewCaption,formatPreviewCheckStatus} from "./previewCaption.ts";

test("print caption moves every production summary field beneath the sheet",()=>{
  assert.equal(formatPreviewCaption({
    paperLabel:"A4",orientation:"portrait",sheetIndex:1,sheetCount:2,
    itemCount:6,copies:8,utilizationPercent:50,
  }),"A4 · Portrait · Sheet 1/2 · 6 items · 8 copies · 50% used");
});

test("caption reports custom landscape paper, singular quantities and exact utilization",()=>{
  assert.equal(formatPreviewCaption({
    paperLabel:"297×420 mm",orientation:"landscape",sheetIndex:1,sheetCount:1,
    itemCount:1,copies:1,utilizationPercent:4,
  }),"297×420 mm · Landscape · Sheet 1/1 · 1 item · 1 copy · 4% used");
});

test("print-check status reports both errors and warnings",()=>{
  assert.equal(formatPreviewCheckStatus(2,3),"Print check: 2 errors, 3 warnings");
  assert.equal(formatPreviewCheckStatus(0,1),"Print check: 1 warning");
  assert.equal(formatPreviewCheckStatus(1,0),"Print check: 1 error");
  assert.equal(formatPreviewCheckStatus(0,0),"Print check: Ready");
});
