// Downloads a public list of known VPN/proxy IPv4 ranges (X4BNet/lists_vpn) to
// data/vpn-ipv4.txt, which geo.ts loads at startup when BLOCK_VPN is on.
// Run at deploy time and refresh weekly; ranges change constantly.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL_ = process.env.VPN_LIST_URL ?? 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt';
const target = path.resolve(process.cwd(), 'data/vpn-ipv4.txt');

const response = await fetch(URL_);
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
const text = await response.text();
const ranges = text.split(/\r?\n/).filter((line) => /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(line.trim()));
if (ranges.length < 100) throw new Error(`Refusing to write: only ${ranges.length} valid ranges (expected thousands)`);

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `# source: ${URL_}\n# updated: ${new Date().toISOString()}\n${ranges.join('\n')}\n`);
console.log(`Wrote ${ranges.length} ranges to ${target}`);
