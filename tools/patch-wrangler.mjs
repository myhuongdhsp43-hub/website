import fs from 'node:fs';
import path from 'node:path';

try {
  const wranglerBin = path.resolve('node_modules/wrangler/bin/wrangler.js');
  if (fs.existsSync(wranglerBin)) {
    let code = fs.readFileSync(wranglerBin, 'utf8');
    if (!code.includes('__PATCHED_WRANGLER_ARGS__')) {
      const target = '...process.argv.slice(2),';
      const replacement = `...(() => {
			/* __PATCHED_WRANGLER_ARGS__ */
			let args = process.argv.slice(2).filter((a) => a !== "--yes");
			if (args.includes("deploy") && !args.includes("--config") && !args.includes("-c")) {
				const distConfig = path.join(process.cwd(), "dist/server/wrangler.json");
				if (require("fs").existsSync(distConfig)) {
					args.push("--config", distConfig);
				}
			}
			return args;
		})(),`;
      if (code.includes(target)) {
        code = code.replace(target, replacement);
        fs.writeFileSync(wranglerBin, code, 'utf8');
        console.log('[patch-wrangler] Successfully patched wrangler CLI args.');
      }
    }
  }
} catch (e) {
  console.warn('[patch-wrangler] Skipping patch:', e.message);
}
