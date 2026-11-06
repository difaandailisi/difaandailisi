// generate-profile.mjs —— Profile README 同步生成器。
//
// 数据源：同目录的 profile-data.json（仓库索引、各仓库介绍、许可一览都在里面）。
// 行为：
//   - 有 GITHUB_TOKEN 时，额外发现 owner 名下「未在数据里、也未被排除」的仓库，
//     自动补进索引 / 生成一段基础介绍 / 加入许可表（新建仓库即自动进 Profile）。
//   - 没有令牌时只渲染 profile-data.json 里的内容（本地可离线验证，结果应与线上一致）。
//
// 改动指引：要改某仓库的介绍，编辑 profile-data.json 里对应 entries 的 section 字段；
// 要排除某个仓库（如 fork），把它加进 exclude 数组。不要改本文件来塞文案。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'profile-data.json'), 'utf8'));

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cn(n) {
  if (n <= 10) return CN[n];
  if (n < 20) return '十' + CN[n - 10];
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  return String(n);
}

function formatName(name) {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function discoverAuto() {
  const owner = data.owner;
  const exclude = new Set(data.exclude || []);
  const known = new Set(data.repos.map((r) => r.name));
  const url = `https://api.github.com/users/${owner}/repos?per_page=100&sort=created&direction=desc`;
  const tryFetch = async (headers) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };
  // Actions 自带的 GITHUB_TOKEN 对该用户「全部公开仓库」权限有限；
  // 公开仓库本就免鉴权，鉴权失败自动退回匿名拉取。
  const auth = process.env.GITHUB_TOKEN
    ? { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'profile-sync' }
    : { 'User-Agent': 'profile-sync' };
  let list = await tryFetch(auth);
  if (!list) list = await tryFetch({ 'User-Agent': 'profile-sync' });
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const repo of list) {
    if (repo.fork) continue;
    if (exclude.has(repo.name) || known.has(repo.name)) continue;
    const title = repo.name === owner ? 'Profile' : formatName(repo.name);
    const lic = repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '未声明';
    out.push({
      name: repo.name,
      title,
      url: repo.html_url,
      blurb: repo.description || '（暂无描述，待补充）',
      status: '新建仓库',
      licenseContent: repo.name,
      licenseNote: lic,
      section: `## ${title}\n\n${repo.description || '（暂无描述，待补充）'}\n\n> 本条目由 Profile 同步 Action 自动生成。编辑 profile-data.json 可改为完整介绍。`,
      auto: true,
    });
  }
  return out;
}

const auto = await discoverAuto();
const repos = [...data.repos, ...auto];
const count = repos.length;

const tableRows = repos
  .map((r) => `| **[${r.title}](${r.url})** | ${r.blurb} | ${r.status} |`)
  .join('\n');

const sections = repos.map((r) => r.section).join('\n\n---\n\n');

const licenseRows = [
  ...repos.map((r) => `| ${r.licenseContent} | ${r.licenseNote} |`),
  ...(data.staticLicenseRows || []).map((s) => `| ${s.content} | ${s.license} |`),
].join('\n');

const footer = (data.footer || '').replace(/\n---\s*$/, '');

const readme = [
  '# 瞬间重构 · 纸世界',
  '',
  `${data.lede}`,
  '',
  data.intro,
  '',
  '---',
  '',
  `## ${cn(count)}个仓库`,
  '',
  '| 仓库 | 一句话 | 状态 |',
  '|---|---|---|',
  tableRows,
  '',
  '---',
  '',
  sections,
  '',
  '---',
  '',
  footer,
  '',
  '---',
  '',
  '## 许可一览',
  '',
  '| 内容 | 许可 |',
  '|---|---|',
  licenseRows,
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, 'README.md'), readme.replace(/\n+$/, '\n'), 'utf8');
console.log(`✅ 已生成 README.md：${count} 个仓库（其中自动发现 ${auto.length} 个）`);
