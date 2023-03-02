// This script behaves almost the same as webpack.config.js
const { existsSync, statSync, mkdirSync, promises } = require("fs");
const { dirname, join } = require("path");
const fg = require("fast-glob");
const esbuild = require("esbuild");
const SASS = require("sass");

esbuild
  .build({
    entryPoints: {
      "scripts/app.min": "src/scripts/app.js",
    },
    outdir: "public",
    assetNames: "images/other/[name]",
    bundle: true,
    minify: true,
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    logLevel: "info",
    loader: {
      ".js": "jsx",
      ".scss": "empty",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".gif": "dataurl",
      ".svg": "dataurl",
    },
    define: {
      "process.env.BASENAME": '"/Cowardly-Witch"',
    },
    legalComments: "none",
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    entryPoints: {
      "stylesheets/style": "src/scss/style.scss",
    },
    outdir: "public",
    bundle: true,
    minify: true,
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    logLevel: "info",
    loader: {
      ".svg": "dataurl",
    },
    plugins: [
      {
        name: "sass",
        setup({ onResolve, onLoad, onEnd }) {
          const read = promises.readFile;
          const copy = promises.copyFile;
          const pwd = join(process.cwd(), "src/scss");

          const quotedString = /(['"])(.*?)\1/;
          const trailingSlash = /\/$/;

          const files = [];

          function expandGlob(result, cwd) {
            if (!result) return;
            const [match, quote, content] = result;
            const { index: offset, input: line } = result;
            if (!fg.isDynamicPattern(content)) return;
            const pre = line.slice(0, offset);
            const post = line.slice(offset + match.length);
            const dirGlob = fg.sync(content, { cwd });
            return dirGlob
              .map((filename) => "" + pre + quote + filename + quote + post)
              .join("\n");
          }

          onResolve({ filter: /./ }, (args) => {
            if (args.path[0] !== ".") {
              let str = args.path.includes("/")
                ? args.path
                : "_" + args.path + ".scss";
              return { path: join(args.resolveDir, str) };
            }

            if (args.path.endsWith(".svg")) {
              const file = join(pwd, args.path);
              // In fact, all files are under 51200 bytes -- they all becomes dataurl
              if (statSync(file).size < 51200) {
                return { path: join(pwd, args.path) };
              } else {
                files.push(file);
                return { path: args.path, external: true };
              }
            }
          });

          onEnd(() => {
            const visited = {};
            const tasks = [];
            for (const file of files) {
              const dest = join("public", file.slice(file.indexOf("images/")));
              const dir = dirname(dest);
              if (!visited[dir]) {
                visited[dir] = true;
                mkdirSync(dir, { recursive: true });
              }
              tasks.push(copy(file, dest));
            }
            return Promise.all(tasks);
          });

          onLoad({ filter: /./ }, async (args) => {
            if (args.path.endsWith(".scss")) {
              const cwd = dirname(args.path);
              let scss = await read(args.path, "utf8");

              function expandLine(line, payload) {
                if (!(payload && payload.trim())) return line;
                return expandGlob(quotedString.exec(line), cwd) || line;
              }

              scss = scss.replace(/^.*\bimport\b(.*)$/gm, expandLine);

              const { css } = await SASS.compileStringAsync(scss, {
                syntax: "scss",
                style: "compressed",
                loadPaths: [pwd, cwd],
              });

              return { contents: css, loader: "css" };
            }
          });
        },
      },
    ],
  })
  .catch(() => process.exit(1));
