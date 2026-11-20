/* WHControl - halaman Total BOQ: satu baris = satu BOQ (site + PO), klik untuk detail material */
const BOQ_PER_PAGE = 20;
const BOQ_REQUIRED = ['subcont', 'region', 'site name', 'po number', 'material name', 'yofc qty'];
const BOQ_STATUS_ORDER = ['RFSC', 'BOQ Opname', 'Redline', 'FO Cut', 'Vandalisme'];
const BOQ_STATUS_STYLE = { 'rfsc': 'bg-lime-50 text-lime-700', 'boq opname': 'bg-sky-50 text-sky-700', 'redline': 'bg-rose-50 text-rose-700', 'fo cut': 'bg-amber-50 text-amber-700', 'vandalisme': 'bg-purple-50 text-purple-700' };
const BOQ_COL = new Intl.Collator(undefined, { numeric: true });
let BOQ_GROUPS = [], BOQ_ROWCOUNT = 0, boqStatus = 'loading', boqError = '', boqCur = [];
let BOQ_SKIP = { sub: 0, other: 0 };
const boqState = { q: '', sub: '', region: '', status: '', mat: '', sort: 'site', page: 1 };
const boqIsAdmin = () => !appState.user || appState.user.subconName === 'ADMIN';
const boqScope = () => boqIsAdmin() ? BOQ_GROUPS : BOQ_GROUPS.filter(b => b.sub === appState.user.subconName);
const boqBadge = s => s ? '<span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ' + (BOQ_STATUS_STYLE[s.toLowerCase()] || 'bg-slate-100 text-slate-600') + '">' + s + '</span>' : '';

async function loadBOQ() {
  try {
    const raw = await loadCSV('data/boq.csv');
    if (!raw.length) throw new Error('File boq.csv kosong.');
    const miss = BOQ_REQUIRED.filter(k => !(k in raw[0]));
    if (miss.length) throw new Error('Kolom tidak ditemukan di boq.csv: ' + miss.join(', '));
    const g = new Map();
    raw.forEach(r => {
      if (isNA(r['subcont'])) { BOQ_SKIP.sub++; return; }
      if (isNA(r['site name']) || isNA(r['material name'])) { BOQ_SKIP.other++; return; }
      const sub = r['subcont'].replace(/\s+/g, ' '), site = r['site name'].replace(/\s+/g, ' '), key = sub + '|' + site;
      const po = isNA(r['po number']) ? '' : r['po number'], st = isNA(r['status']) ? '' : r['status'], ty = isNA(r['site type']) ? '' : r['site type'];
      let b = g.get(key);
      if (!b) { b = { sub, site, city: r['city'] || '', region: isNA(r['region']) ? 'Tanpa Region' : r['region'], type: ty, po, status: st, rows: [], mats: new Set(), cable: 0, device: 0, scable: 0, sdevice: 0 }; g.set(key, b); }
      else { if (!b.po) b.po = po; if (!b.status) b.status = st; if (!b.type) b.type = ty; }
      const mat = r['material name'].trim().toUpperCase(), qty = parseQty(r['yofc qty']), sq = parseQty(r['subcont qty'] || '');
      b.rows.push({ mat, qty, subQty: sq, verified: r['verified'] || '', recon: r['recon date'] || '', remark: /^true$/i.test(r['remark'] || ''),
        link: /^https?:\/\//i.test(r['link doc'] || '') ? r['link doc'].replace(/"/g, '%22') : '' });
      b.mats.add(mat);
      if (isCable(mat)) { b.cable += qty || 0; b.scable += sq || 0; } else { b.device += qty || 0; b.sdevice += sq || 0; }
      BOQ_ROWCOUNT++;
    });
    BOQ_GROUPS = [...g.values()];
    BOQ_GROUPS.forEach(b => { b._s = (b.site + ' ' + b.type + ' ' + b.po + ' ' + b.sub + ' ' + b.city + ' ' + b.region + ' ' + b.status + ' ' + [...b.mats].join(' ')).toLowerCase(); });
    BOQ_GROUPS.sort((a, b) => BOQ_COL.compare(a.site, b.site) || BOQ_COL.compare(a.sub, b.sub));
    boqStatus = 'ready';
    sourceDone([...new Set(BOQ_GROUPS.map(b => b.sub))]);
  } catch (e) {
    boqStatus = 'error'; sourceDone([]);
    boqError = e.message + (location.protocol === 'file:' ? ' Buka lewat alamat web (GitHub Pages), bukan langsung dari file.' : '');
  }
  initBOQ();
}

function initBOQ() {
  const adm = boqIsAdmin(), rows = boqScope();
  const uniq = f => [...new Set(rows.flatMap(f))];
  const fill = (id, label, vals) => { document.getElementById(id).innerHTML = '<option value="">' + label + '</option>' + vals.map(v => '<option value="' + escA(v) + '">' + escA(v) + '</option>').join(''); };
  const so = s => { const i = BOQ_STATUS_ORDER.findIndex(x => x.toLowerCase() === s.toLowerCase()); return i < 0 ? 99 : i; };
  fill('boq-sub', 'Semua Subcont', uniq(b => [b.sub]).sort());
  fill('boq-region', 'Semua Region', uniq(b => [b.region]).sort());
  fill('boq-status', 'Semua Status', uniq(b => [b.status]).filter(Boolean).sort((a, b) => so(a) - so(b) || a.localeCompare(b)));
  fill('boq-mat', 'Semua Material', uniq(b => [...b.mats]).sort((a, b) => BOQ_COL.compare(a, b)));
  document.querySelectorAll('[data-admin]').forEach(e => e.classList.toggle('hidden', !adm));
  document.getElementById('boq-subtitle').textContent = 'Bill of Quantity · ' + (adm ? 'ADMIN · Semua Subcont' : appState.user.subconName);
  document.getElementById('boq-s-sub-l').textContent = adm ? 'Subcont' : 'Jenis Material';
  Object.assign(boqState, { q: '', sub: '', region: '', status: '', mat: '', sort: 'site', page: 1 });
  document.getElementById('boq-q').value = '';
  document.getElementById('boq-sort').value = 'site';
  renderBOQ();
}
function boqSet(k, v) { boqState[k] = v; boqState.page = 1; renderBOQ(); }
function boqPage(d) { boqState.page += d; renderBOQ(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function boqReset() { initBOQ(); }
function boqPick(n) {
  const v = boqState.sub === n ? '' : n;
  document.getElementById('boq-sub').value = v;
  boqSet('sub', v);
}

function renderBOQStatus() {
  const msg = boqStatus === 'loading' ? 'Memuat data BOQ...' : boqError;
  ['boq-s-rows', 'boq-s-site', 'boq-s-cable', 'boq-s-device', 'boq-s-sub'].forEach(id => document.getElementById(id).textContent = '0');
  document.getElementById('boq-recap').classList.add('hidden');
  document.getElementById('boq-info').textContent = '';
  document.getElementById('boq-page').textContent = '';
  document.getElementById('boq-prev').disabled = true;
  document.getElementById('boq-next').disabled = true;
  document.getElementById('boq-cards').innerHTML = '<div class="lg:col-span-2 py-12 px-4 text-center text-sm ' + (boqStatus === 'error' ? 'text-rose-600' : 'text-slate-500') + '">' + msg + '</div>';
}

function renderBOQ() {
  const f = boqState, q = f.q.trim().toLowerCase(), adm = boqIsAdmin();
  if (boqStatus !== 'ready') { renderBOQStatus(); return; }
  const r = boqScope().filter(b => (!f.sub || b.sub === f.sub) && (!f.region || b.region === f.region) && (!f.status || b.status === f.status) && (!f.mat || b.mats.has(f.mat)) && (!q || b._s.includes(q)));
  /* data sudah terurut per site saat dimuat; hanya urutan lain yang perlu diurutkan ulang */
  if (f.sort === 'sub') r.sort((a, b) => BOQ_COL.compare(a.sub, b.sub));
  else if (f.sort === 'kabel-desc') r.sort((a, b) => b.cable - a.cable);
  else if (f.sort === 'perangkat-desc') r.sort((a, b) => b.device - a.device);
  boqCur = r;

  document.getElementById('boq-s-rows').textContent = nf(r.length);
  document.getElementById('boq-s-site').textContent = nf(r.reduce((t, b) => t + b.rows.length, 0));
  document.getElementById('boq-s-cable').textContent = nf(r.reduce((t, b) => t + b.cable, 0));
  document.getElementById('boq-s-device').textContent = nf(r.reduce((t, b) => t + b.device, 0));
  document.getElementById('boq-s-sub').textContent = nf(new Set(r.flatMap(b => adm ? [b.sub] : [...b.mats])).size);

  document.getElementById('boq-recap').classList.toggle('hidden', !adm);
  if (adm) {
    const g = {};
    r.forEach(b => { const o = g[b.sub] || (g[b.sub] = { boq: 0, rows: 0, cable: 0, device: 0 }); o.boq++; o.rows += b.rows.length; o.cable += b.cable; o.device += b.device; });
    const list = Object.entries(g).sort((a, b) => b[1].cable - a[1].cable || b[1].device - a[1].device);
    const c = 'py-2.5 px-4 text-right ';
    document.getElementById('boq-recap-body').innerHTML = list.length ? list.map(([n, o]) =>
      '<tr class="hover:bg-[#e6f2f8]/50 cursor-pointer ' + (f.sub === n ? 'bg-[#e6f2f8]' : '') + '" data-sub="' + escA(n) + '" onclick="boqPick(this.dataset.sub)">' +
      '<td class="py-2.5 px-4 font-semibold text-slate-900">' + n + '</td><td class="' + c + 'text-slate-700">' + nf(o.boq) + '</td><td class="' + c + 'text-slate-700">' + nf(o.rows) + '</td>' +
      '<td class="' + c + 'font-bold text-slate-900">' + nf(o.cable) + '</td><td class="' + c + 'font-bold text-slate-900">' + nf(o.device) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="py-6 text-center text-sm text-slate-500">Tidak ada data.</td></tr>';
  }

  const pages = Math.max(1, Math.ceil(r.length / BOQ_PER_PAGE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const off = (f.page - 1) * BOQ_PER_PAGE, slice = r.slice(off, off + BOQ_PER_PAGE);
  const sk = BOQ_SKIP, notes = [];
  if (sk.sub) notes.push(nf(sk.sub) + ' baris tanpa subcont (#N/A)');
  if (sk.other) notes.push(nf(sk.other) + ' baris tanpa site/material');
  document.getElementById('boq-info').textContent = 'Menampilkan ' + slice.length + ' dari ' + nf(r.length) + ' BOQ' + (adm && notes.length ? ' · Dilewati: ' + notes.join(', ') : '');
  document.getElementById('boq-page').textContent = 'Halaman ' + f.page + ' / ' + pages;
  document.getElementById('boq-prev').disabled = f.page <= 1;
  document.getElementById('boq-next').disabled = f.page >= pages;

  document.getElementById('boq-cards').innerHTML = slice.length ? slice.map((b, i) =>
    '<button type="button" onclick="boqOpen(' + (off + i) + ')" class="text-left bg-white rounded-2xl border border-slate-200 hover:border-[#006699]/50 hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.25)] transition-all p-4 flex items-center justify-between gap-3 cursor-pointer group">' +
    '<div class="min-w-0"><div class="text-[15px] font-extrabold text-slate-900 leading-snug break-words">' + b.site + '</div>' +
    '<div class="text-[13px] text-slate-600 mt-0.5">' + [b.type, 'PO ' + (b.po || '-')].filter(Boolean).join(' &middot; ') + '</div>' +
    (adm ? '<div class="text-xs text-slate-400 mt-0.5 truncate">' + b.sub + (b.city ? ' &middot; ' + b.city : '') + ' &middot; ' + b.region + '</div>' : '') + '</div>' +
    '<div class="flex items-center gap-2.5 shrink-0">' + boqBadge(b.status) + '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover:text-[#006699] group-hover:translate-x-0.5 transition-all"></i></div></button>').join('')
    : '<div class="lg:col-span-2 py-12 text-center text-sm text-slate-500">Tidak ada BOQ yang cocok dengan pencarian atau filter.</div>';
  lucide.createIcons();
}

/* ---- popup detail ---- */
function boqOpen(i) {
  const b = boqCur[i]; if (!b) return;
  const $ = id => document.getElementById(id);
  const dash = v => v ? nf(v) : '-';
  $('boq-d-site').textContent = b.site;
  $('boq-d-sub').textContent = b.sub + (b.city ? ' · ' + b.city : '') + ' · ' + b.region;
  $('boq-d-badge').innerHTML = boqBadge(b.status);
  $('boq-d-meta').innerHTML = '<span>Site type: <b class="text-slate-800">' + (b.type || '-') + '</b></span><span>PO: <b class="text-slate-800">' + (b.po || '-') + '</b></span><span>' + b.rows.length + ' material</span>';
  const td = (v, c) => '<td class="py-2.5 pr-3 ' + (c || '') + '">' + v + '</td>';
  $('boq-d-rows').innerHTML = b.rows.map(x =>
    '<tr>' + td(x.mat, 'font-semibold text-slate-900 whitespace-nowrap') + td(x.qty === null ? '-' : nf(x.qty), 'text-right ' + (x.qty === null ? 'text-slate-300' : 'text-slate-900')) +
    td(x.subQty === null ? '-' : nf(x.subQty), 'text-right ' + (x.subQty === null ? 'text-slate-300' : 'text-slate-900')) +
    td(x.verified || '-', x.verified ? 'text-lime-700 font-semibold' : 'text-slate-300') + td(x.recon || '-', 'whitespace-nowrap ' + (x.recon ? 'text-slate-700' : 'text-slate-300')) +
    td(x.remark ? '<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10.5px] font-bold">Ya</span>' : '-', x.remark ? '' : 'text-slate-300') +
    td(x.link ? '<a href="' + x.link + '" target="_blank" rel="noopener" class="text-[#006699] font-bold hover:underline">Buka</a>' : '-', x.link ? '' : 'text-slate-300') + '</tr>').join('');
  $('boq-d-foot').innerHTML =
    '<tr class="border-t-2 border-slate-200 font-bold text-slate-900"><td class="py-2.5 pr-3">Total kabel</td><td class="py-2.5 pr-3 text-right">' + dash(b.cable) + '</td><td class="py-2.5 pr-3 text-right">' + dash(b.scable) + '</td><td colspan="4"></td></tr>' +
    '<tr class="font-bold text-slate-900"><td class="py-1 pr-3">Total perangkat</td><td class="py-1 pr-3 text-right">' + dash(b.device) + '</td><td class="py-1 pr-3 text-right">' + dash(b.sdevice) + '</td><td colspan="4"></td></tr>';
  $('boq-modal').classList.remove('hidden');
  $('boq-d-body').scrollTop = 0;
  lucide.createIcons();
}
function boqClose() { document.getElementById('boq-modal').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') boqClose(); });

initBOQ();
loadBOQ();
