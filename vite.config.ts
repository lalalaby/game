import { defineConfig, type Plugin } from 'vite';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Production build emits only dist/index.html, with JS and site SVGs inlined. */
function singleHtml(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'single-html',
    apply: 'build',
    config() {
      return {
        // Public SVGs are inlined into JS; do not copy them next to the HTML.
        publicDir: false,
        build: {
          assetsInlineLimit: Number.POSITIVE_INFINITY,
          cssCodeSplit: false,
          rollupOptions: {
            output: { inlineDynamicImports: true },
          },
        },
      };
    },
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    transform(code, id) {
      const file = id.split('?')[0]!.replace(/\\/g, '/');
      if (!file.endsWith('/src/game/sites.ts')) return null;
      const sitesDir = join(root, 'public/assets/sites');
      return code.replace(/svg:\s*(['"])\.\/assets\/sites\/([^'"]+)\1/g, (match, _q, name: string) => {
        const path = join(sitesDir, name);
        if (!existsSync(path)) {
          this.warn(`single-html: missing ${path}`);
          return match;
        }
        return `svg: ${JSON.stringify(svgDataUrl(readFileSync(path, 'utf8')))}`;
      });
    },
    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
        const htmlName = Object.keys(bundle).find((n) => n.endsWith('.html'));
        if (!htmlName) throw new Error('single-html: no HTML output');
        const htmlItem = bundle[htmlName]!;
        if (htmlItem.type !== 'asset') throw new Error('single-html: HTML is not an asset');

        let html = String(htmlItem.source);
        const drop: string[] = [];

        for (const [name, item] of Object.entries(bundle)) {
          if (name === htmlName) continue;
          const base = name.split('/').pop()!;
          if (item.type === 'chunk') {
            if (item.code.includes('./assets/sites/')) {
              throw new Error('single-html: site SVG paths were not inlined');
            }
            const js = item.code.replace(/<\/script/gi, '<\\/script');
            const re = new RegExp(`<script[^>]*src=["'][^"']*${escapeRe(base)}["'][^>]*>\\s*</script>`);
            const tag = `<script type="module">${js}</script>`;
            html = re.test(html) ? html.replace(re, tag) : html.replace(/<\/body>/, `${tag}</body>`);
            drop.push(name);
          } else if (name.endsWith('.css')) {
            const css = (typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source))
              .replace(/<\/style/gi, '<\\/style');
            const re = new RegExp(`<link[^>]*href=["'][^"']*${escapeRe(base)}["'][^>]*>`);
            html = re.test(html) ? html.replace(re, `<style>${css}</style>`) : html;
            drop.push(name);
          } else {
            drop.push(name);
          }
        }

        html = html.replace(/<link\s+rel="modulepreload"[^>]*>/g, '');
        htmlItem.source = html;
        for (const name of drop) delete bundle[name];
      },
    },
    closeBundle() {
      if (!existsSync(outDir)) return;
      for (const name of readdirSync(outDir)) {
        if (name === 'index.html') continue;
        rmSync(join(outDir, name), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [singleHtml()],
});
