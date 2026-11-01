#!/usr/bin/env node
// zcode-font.mjs — ZCode 桌面版全局自定义字体(asar 补丁,零依赖,Windows)
//
// 原理:ZCode(Electron)界面字体由 CSS 变量 --font-sans/--font-mono 驱动(Tailwind v4 主题)。
// 本工具向 app.asar 的主入口前置一个 web-contents 钩子,每次窗口加载时 insertCSS 覆盖变量——
// 任何方式启动 ZCode 都生效,无需调试端口、无常驻进程;ZCode 升级后重跑 apply 即可。
//
// 用法:
//   node zcode-font.mjs            自动定位 app.asar,打补丁并布防"退出即换包"
//   node zcode-font.mjs apply      同上
//   node zcode-font.mjs restore    回滚到打补丁前的原包
//   node zcode-font.mjs status     查看当前状态
//   node zcode-font.mjs --asar <路径>   手动指定 app.asar 位置
//
// 退出 ZCode 后由 --swap-worker 子进程自动完成换包(等待退出→备份→替换)。
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MARKER = '/*zcode-font-hook*/';
const UNPACK_GLOB = '**/*.{node,dll,exe}';
const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) || 'apply';

const log = (...m) => console.log('[zcode-font]', ...m);
const die = (m) => { console.error('[zcode-font] 错误:', m); process.exit(1); };
const sh = (c) => execSync(c, { stdio: 'inherit', shell: 'cmd.exe' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveAsar() {
  const i = argv.indexOf('--asar');
  const flag = i !== -1 ? argv[i + 1] : undefined;
  if (flag) { if (!existsSync(flag)) die('--asar 路径不存在: ' + flag); return resolve(flag); }
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const candidates = [
    process.env.ZCODE_ASAR,
    join(local, 'Programs', 'zcode', 'resources', 'app.asar'),
    join(local, 'Programs', 'ZCode', 'resources', 'app.asar'),
    'D:\\Tools\\ZCode\\resources\\app.asar',
    'C:\\Program Files\\ZCode\\resources\\app.asar',
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) die('未找到 app.asar,请用 --asar <路径> 指定(通常在 ZCode 安装目录 resources\\ 下)');
  return hit;
}
const ASAR = resolveAsar();
const BACKUP = ASAR + '.orig-backup';
const NEW = ASAR + '.new';
const WORK = join(ROOT, 'asar-work');
const EXTRACT = join(WORK, 'extracted');
const MAIN_JS = join(EXTRACT, 'out/main/index.js');

const cfg = JSON.parse(readFileSync(join(ROOT, 'font.json'), 'utf8'));
const css =
  `:root,body{--font-sans:${cfg.fontSans}!important;--font-mono:${cfg.fontMono}!important` +
  (cfg.uiFontSize ? `;--ui-font-size:${cfg.uiFontSize}px!important` : '') + '}';

const zcodeRunning = () => {
  try { return execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { shell: 'cmd.exe' }).toString().includes('ZCode.exe'); }
  catch { return false; }
};
const relFiles = (root) => {
  const out = new Set();
  const walk = (d, p) => { for (const f of readdirSync(d)) { const full = join(d, f), rp = p ? p + '/' + f : f; statSync(full).isDirectory() ? walk(full, rp) : out.add(rp); } };
  walk(root, '');
  return out;
};

function extractPatchPack() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(EXTRACT, { recursive: true });
  log('解包原 asar ...');
  sh(`npx -y @electron/asar extract "${ASAR}" "${EXTRACT}"`);
  if (!existsSync(MAIN_JS)) die(`主入口不存在: ${MAIN_JS}(ZCode 结构可能已变化,欢迎提 issue)`);
  let main = readFileSync(MAIN_JS, 'utf8');
  if (main.includes(MARKER)) {
    log('已打过补丁,跳过注入(幂等)。如需重打请先 restore。');
  } else {
    log('前置字体钩子 ...');
    const hook =
      MARKER + '\n' +
      'import{app as __zfontApp}from"electron";\n' +
      'try{__zfontApp.on("web-contents-created",(_e,wc)=>{const __inj=()=>wc.insertCSS(' +
      JSON.stringify(css) +
      ',{cssOrigin:"user"}).catch(()=>{});wc.on("did-finish-load",__inj);});}catch(e){}\n';
    writeFileSync(MAIN_JS, hook + main);
  }
  log('打包(原生件外置) ...');
  sh(`npx -y @electron/asar pack "${EXTRACT}" "${NEW}" --unpack "${UNPACK_GLOB}"`);
  const unpackedDir = ASAR.replace(/app\.asar$/, 'app.asar.unpacked');
  const want = existsSync(unpackedDir) ? relFiles(unpackedDir) : new Set();
  const got = relFiles(NEW + '.unpacked');
  const missing = [...want].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !want.has(x));
  if (missing.length || extra.length) die(`外置文件清单不一致!缺失:${missing} 多余:${extra}`);
  if (!readFileSync(MAIN_JS, 'utf8').startsWith(MARKER)) die('主入口补丁丢失!');
  log(`校验通过:外置 ${got.size} 个文件与原包一致,钩子就位。`);
}

function armSwap() {
  log('布防换包哨兵(等你退出 ZCode 后自动替换,30 分钟内有效)...');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--swap-worker', ASAR], {
    detached: true, stdio: 'ignore',
  });
  child.unref();
  log('完成!现在完全退出 ZCode(含托盘图标),再正常打开即是新字体。');
}

async function swapWorker(asar) {
  const backup = asar + '.orig-backup', newP = asar + '.new';
  log('换包哨兵:等待 ZCode 退出(至多 30 分钟)...');
  const deadline = Date.now() + 30 * 60 * 1000;
  while (zcodeRunning() && Date.now() < deadline) await sleep(2000);
  await sleep(3000);
  copyFileSync(asar, backup);
  for (let i = 0; i < 15; i++) {
    try { renameSync(newP, asar); log('换包完成,重启 ZCode 即生效。备份:' + backup); process.exit(0); }
    catch { await sleep(2000); }
  }
  log('换包失败:文件被占用。请确认 ZCode 已退出后重跑 apply。');
  process.exit(1);
}

async function main() {
  if (argv.includes('--swap-worker')) return swapWorker(argv[argv.indexOf('--swap-worker') + 1]);
  if (cmd === 'status') {
    let patched;
    try { patched = readFileSync(ASAR).includes(MARKER) ? '是' : '否'; } catch { patched = '未知(读取失败)'; }
    console.log('asar        :', ASAR);
    console.log('已打补丁    :', patched);
    console.log('原包备份    :', existsSync(BACKUP) ? BACKUP : '(无)');
    console.log('待换包产物  :', existsSync(NEW) ? NEW + '(哨兵等待中或换包未完成)' : '(无)');
    return;
  }
  if (cmd === 'restore') {
    if (!existsSync(BACKUP)) die('没有备份可回滚(' + BACKUP + ' 不存在)');
    log('等待 ZCode 退出 ...');
    while (zcodeRunning()) await sleep(2000);
    await sleep(3000);
    copyFileSync(BACKUP, ASAR);
    log('已回滚到原包,重启 ZCode 生效。');
    return;
  }
  if (cmd !== 'apply') die(`未知命令:${cmd}(支持 apply/restore/status)`);
  if (zcodeRunning()) log('提示:ZCode 正在运行——没关系,先打补丁,退出后会自动换包。');
  extractPatchPack();
  if (zcodeRunning()) armSwap();
  else {
    copyFileSync(ASAR, BACKUP);
    renameSync(NEW, ASAR);
    log('ZCode 未在运行,已直接换包。启动 ZCode 即生效。备份:' + BACKUP);
  }
}
main();
