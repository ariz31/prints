import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const mod = await server.ssrLoadModule("/src/App.tsx");
  const html = renderToString(createElement(mod.default));
  const markers = [
    "PRINTS", "Print setup", "Workspace", "Preview", "Images",
    "Print", "Add images", "Preferences"
  ];
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error("Missing app UI marker: " + marker);
  }
  if (html.length < 1500) throw new Error("Rendered application markup is unexpectedly short.");
  console.log("PRINTS application render smoke passed; HTML size", html.length);
} finally {
  await server.close();
}
