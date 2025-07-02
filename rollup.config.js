import { rollupPluginHTML as html } from "@web/rollup-plugin-html";
import terser from "@rollup/plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { readFileSync, writeFileSync } from "fs";

export default {
  input: "./index.html",
  output: {
    dir: "dist",
    format: "es",
  },
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false,
      exportConditions: ["browser", "module", "import", "default"],
    }),
    commonjs({
      transformMixedEsModules: true,
    }),
    html({
      minify: false,
      extractAssets: false,
    }),
    {
      name: "inline-js",
      closeBundle: () => {
        const js = readFileSync("dist/main.js", "utf-8");
        let html = readFileSync("dist/index.html", "utf-8");

        html = html.replace(
          `<script type="module" src="./main.js"></script>`,
          `<script type="module">\n${js}\n</script>`
        );

        const base64Html = Buffer.from(html, "utf-8").toString("base64");

        writeFileSync(
          "web4.js",
          `export function web4_get() {
  env.value_return(JSON.stringify({
    contentType: 'text/html; charset=UTF-8',
    body: '${base64Html}'
  }));
}`
        );

        console.log("✅ web4.js contract created successfully!");
      },
    },
  ],
};
