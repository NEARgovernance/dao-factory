import { rollupPluginHTML as html } from "@web/rollup-plugin-html";
import terser from "@rollup/plugin-terser";
import { readFileSync, writeFileSync } from "fs";

export default {
  input: "./index.html",
  output: { dir: "dist" },
  plugins: [
    html({ minify: true }),
    terser(),
    {
      name: "inline-js",
      closeBundle: () => {
        const js = readFileSync("dist/main.js").toString();

        const html = readFileSync("dist/index.html")
          .toString()
          .replace(
            `<script type="module" src="./main.js"></script>`,
            `<script type="module">${js}</script>`
          );

        writeFileSync(
          "web4.js",
          `
export function web4_get() {
      env.value_return(JSON.stringify({
            contentType: 'text/html; charset=UTF-8',
            body: '${Buffer.from(html).toString("base64")}'
        })
      );
}
      `
        );
      },
    },
  ],
};
