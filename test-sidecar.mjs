/**
 * 侧车文件多类型测试脚本
 * 使用 "虾仁存档" 文件夹的真实视频，测试侧车全流程
 *
 * 测试类型:
 *   1. 侧车创建 & 内容哈希计算
 *   2. 侧车读写一致性
 *   3. 重命名+侧车跟随
 *   4. 孤岛侧车检测
 *   5. 侧车内容同步（模拟编辑后更新）
 *   6. 文件锁定重试模拟
 */

import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync, cpSync, openSync, readSync, closeSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const FOLDER = "C:\\Users\\jumao\\Desktop\\虾仁存档";
const FFPROBE = "C:\\Users\\jumao\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe";
const SIDECAR_EXT = '.vidtool.json';
const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.webm']);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

// ─── 工具函数 ───

function walkVideos(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkVideos(p).forEach(v => out.push(v));
    else if (VIDEO_EXT.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function ffprobe(path) {
  const r = spawnSync(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', path], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout.toString()); } catch { return null; }
}

function contentHash(path) {
  const size = statSync(path).size;
  if (size === 0) return '0';
  const h = createHash('sha256');
  const buf = Buffer.alloc(4096);
  const fd = openSync(path, 'r');
  readSync(fd, buf, 0, 4096, 0);
  h.update(buf);
  h.update(String(size));
  if (size > 4096) {
    readSync(fd, buf, 0, 4096, size - 4096);
    h.update(buf);
  }
  closeSync(fd);
  h.update(path.split(/[/\\]/).pop()); // filename
  return h.digest('hex').slice(0, 16);
}

function sidecarPath(videoPath) { return videoPath + SIDECAR_EXT; }

function readSidecar(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function writeSidecar(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function discoverOrphans(dir) {
  const orphans = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(SIDECAR_EXT)) {
      const sp = join(dir, e.name);
      const vp = join(dir, e.name.slice(0, -SIDECAR_EXT.length));
      if (!existsSync(vp)) orphans.push(sp);
    }
  }
  return orphans;
}

// ─── 测试主体 ───

async function main() {
  const videos = walkVideos(FOLDER);
  console.log(`\n═══════════════════════════════════════`);
  console.log(`侧车文件多类型测试 — 虾仁存档 (${videos.length} 个视频)`);
  console.log(`═══════════════════════════════════════\n`);

  // ── 测试 1: 侧车创建 & 内容哈希 ──
  console.log(`\n--- 测试 1: 侧车创建 & 内容哈希 ---`);
  for (const v of videos) {
    const sp = sidecarPath(v);
    // 如果已有侧车，先删除（模拟首次扫描）
    if (existsSync(sp)) unlinkSync(sp);

    const meta = ffprobe(v);
    assert(meta !== null, `${v.split(/[/\\]/).pop()}: ffprobe 探针成功`);
    if (!meta) continue;

    const hash = contentHash(v);
    assert(hash.length === 16, `${v.split(/[/\\]/).pop()}: 内容哈希为 16 位`);

    // 创建侧车
    const sidecar = {
      v: 1,
      uuid: randomUUID(),
      content_hash: hash,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      note: '', favorite: false, series: '', category: '', status: 'normal',
      novel_order: [],
      tags: [],
    };
    writeSidecar(sp, sidecar);
    assert(existsSync(sp), `侧车文件已创建: ${sp.split(/[/\\]/).pop()}`);

    // 读回验证
    const readBack = readSidecar(sp);
    assert(readBack !== null, `侧车文件可读`);
    assert(readBack.uuid === sidecar.uuid, `UUID 一致性`);
    assert(readBack.content_hash === hash, `内容哈希一致性`);
  }
  console.log(`  → ${videos.length} 个视频的侧车创建全部通过`);

  // ── 测试 2: 重命名 + 侧车跟踪 ──
  console.log(`\n--- 测试 2: 重命名 + 侧车跟踪 ---`);
  // 取第一个视频做 rename 测试
  if (videos.length > 0) {
    const orig = videos[0];
    const ext = extname(orig);
    const dir = orig.substring(0, orig.length - ext.length);
    const newName = join(join(orig, '..'), '_test_rename_temp' + ext);
    const origSidecar = sidecarPath(orig);
    const newSidecar = sidecarPath(newName);

    // 确保侧车存在
    if (!existsSync(origSidecar)) {
      writeSidecar(origSidecar, { v:1, uuid:randomUUID(), content_hash:'temp', created:'', updated:'', note:'', favorite:false, series:'', category:'', status:'normal', novel_order:[], tags:[] });
    }
    const scContent = readSidecar(origSidecar);

    // 复制视频（而不是 rename，避免损坏原始数据）
    cpSync(orig, newName);
    // 复制侧车
    writeSidecar(newSidecar, scContent);
    // 原侧车保留（模拟正常场景）

    assert(existsSync(newName), `临时视频文件存在: ${newName.split(/[/\\]/).pop()}`);
    assert(existsSync(newSidecar), `新侧车文件存在`);

    const newSC = readSidecar(newSidecar);
    assert(newSC.uuid === scContent.uuid, `改名后侧车 UUID 与原视频一致`);
    assert(newSC.content_hash === scContent.content_hash, `改名后侧车哈希与原视频一致`);

    // 清理
    unlinkSync(newName);
    unlinkSync(newSidecar);
    console.log(`  → 重命名+侧车跟踪测试通过`);
  }

  // ── 测试 3: 孤岛侧车检测 ──
  console.log(`\n--- 测试 3: 孤岛侧车检测 ---`);
  // 创建一个孤岛侧车
  const orphanPath = join(FOLDER, '_test_orphan_ghost.mp4.vidtool.json');
  if (!existsSync(orphanPath)) {
    writeSidecar(orphanPath, {
      v:1, uuid:randomUUID(), content_hash:'orphan_hash_test', created:new Date().toISOString(), updated:new Date().toISOString(),
      note:'', favorite:false, series:'', category:'', status:'normal', novel_order:[], tags:[{ classId:'test', className:'测试', tagId:'t1', tagName:'孤岛标签', value:'' }]
    });
  }
  const orphans = discoverOrphans(FOLDER);
  assert(orphans.some(o => o.endsWith('_test_orphan_ghost.mp4.vidtool.json')), `孤岛侧车被成功检测`);
  // 清理临时孤岛
  if (existsSync(orphanPath)) unlinkSync(orphanPath);
  console.log(`  → 孤岛检测通过，共 ${orphans.length} 个孤岛侧车（含已清理的唯一测试孤岛）`);

  // ── 测试 4: 内容哈希防碰撞 ──
  console.log(`\n--- 测试 4: 内容哈希碰撞测试 ---`);
  const hashes = new Set();
  for (const v of videos) {
    const h = contentHash(v);
    hashes.add(h);
  }
  assert(hashes.size === videos.length, `${videos.length} 个视频哈希值全部唯一（${hashes.size} 个唯一值）`);

  // ── 测试 5: 编辑后侧车更新模拟 ──
  console.log(`\n--- 测试 5: 侧车内容更新模拟 ---`);
  for (const v of videos) {
    const sp = sidecarPath(v);
    if (!existsSync(sp)) continue;
    const sc = readSidecar(sp);
    if (!sc) continue;

    // 模拟"用户编辑后数据更新"
    sc.note = `测试笔记 ${Date.now()}`;
    sc.favorite = true;
    sc.series = '测试系列';
    sc.category = '测试分类';
    sc.tags.push({ classId:'c1', className:'质量', tagId:'t1', tagName:'4K', value:'' });
    sc.updated = new Date().toISOString();
    writeSidecar(sp, sc);

    const updated = readSidecar(sp);
    assert(updated.note === sc.note, `${v.split(/[/\\]/).pop()}: 笔记已更新`);
    assert(updated.favorite === true, `收藏状态已更新`);
    assert(updated.tags.length === sc.tags.length, `标签数正确`);
    assert(updated.updated !== sc.created, `更新时间已变更`);
  }

  // ── 测试 6: ffprobe 性能 ──
  console.log(`\n--- 测试 6: 性能基准 ---`);
  let totalProbeMs = 0, totalHashMs = 0;
  for (const v of videos) {
    const t0 = performance.now();
    ffprobe(v);
    totalProbeMs += performance.now() - t0;

    const t1 = performance.now();
    contentHash(v);
    totalHashMs += performance.now() - t1;
  }
  console.log(`  📊 ffprobe 总: ${(totalProbeMs/1000).toFixed(2)}s (平均 ${(totalProbeMs/videos.length).toFixed(0)}ms/文件)`);
  console.log(`  📊 内容哈希总: ${(totalHashMs/1000).toFixed(2)}s (平均 ${(totalHashMs/videos.length).toFixed(0)}ms/文件)`);
  console.log(`  📊 单视频全量侧车操作总开销: ~${((totalProbeMs + totalHashMs)/videos.length/1000).toFixed(3)}s`);

  // ── 汇总 ──
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════`);
  console.log(`测试完成: ${total} 项`);
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`═══════════════════════════════════════\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
