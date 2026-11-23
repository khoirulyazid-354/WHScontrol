/* WHControl - halaman Total DO: satu baris = satu DO (Outbound Number), klik untuk detail material */
const DO_PER_PAGE = 20;
const DO_REQUIRED = ['outbound date', 'outbound number', 'subcont', 'city', 'region', 'material code', 'material name', 'material description', 'yofc qty'];
const DO_COL = new Intl.Collator(undefined, { numeric: true });
let DO_ROWS = [], DO_GROUPS = [], doStatus = 'loading', doError = '', doSkipped = 0, doCur = [];
const doState = { q: '', sub: '', region: '', mat: '', year: '', sort: 'date-desc', page: 1 };
const doIsAdmin = () => !appState.user || appState.user.subconName === 'ADMIN';
const doScope = () => doIsAdmin() ? DO_GROUPS : DO_GROUPS.filter(d => d.sub === appState.user.subconName);
const doBadge = d => d.rows.every(x => x.verified) ? '<span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap bg-lime-50 text-lime-700">Verified</span>' : '';

/* Memuat data/do.csv lalu mengelompokkan baris material menjadi dokumen DO */
async function loadDO() {
  try {
    const raw = await loadCSV('data/do.csv');
    if (!raw.length) throw new Error('File do.csv kosong.');
    const miss = DO_REQUIRED.filter(k => !(k in raw[0]));
    if (miss.length) throw new Error('Kolom tidak ditemukan di do.csv: ' + miss.join(', '));
    DO_ROWS = raw.map(r => {
      const dt = parseDateID(r['outbound date']), qty = parseQty(r['yofc qty']);
      if (!dt || qty === null || isNA(r['subcont']) || !r['outbound number']) { doSkipped++; return null; }
      return { ts: dt.ts, date: dt.date, yr: dt.yr, no: r['outbound number'], sub: r['subcont'].replace(/\s+/g, ' '), city: r['city'], region: r['region'],
        code: r['material code'], mat: r['material name'], desc: r['material description'], qty, subQty: parseQty(r['subcont qty'] || ''),
        wh: r['outbound origin warehouse'] || '', verified: r['verified'] || '', recon: r['recon date'] || '',
        link: /^https?:\/\//i.test(r['link doc'] || '') ? r['link doc'].replace(/"/g, '%22') : '' };
    }).filter(Boolean);

    const g = new Map();
    DO_ROWS.forEach(x => {
      const k = x.sub + '|' + x.no;
      let d = g.get(k);
      if (!d) { d = { sub: x.sub, no: x.no, ts: x.ts, date: x.date, yr: x.yr, city: x.city, region: x.region, wh: x.wh, rows: [], mats: new Set(), dates: new Set(), cable: 0, device: 0, scable: 0, sdevice: 0 }; g.set(k, d); }
      if (x.ts < d.ts) { d.ts = x.ts; d.date = x.date; d.yr = x.yr; }
      if (!d.wh) d.wh = x.wh;
      d.rows.push(x); d.mats.add(x.mat); d.dates.add(x.date);
      if (isCable(x.mat)) { d.cable += x.qty; d.scable += x.subQty || 0; } else { d.device += x.qty; d.sdevice += x.subQty || 0; }
    });
    DO_GROUPS = [...g.values()];
    DO_GROUPS.forEach(d => { d._s = (d.no + ' ' + d.sub + ' ' + d.city + ' ' + d.region + ' ' + d.wh + ' ' + [...d.dates].join(' ') + ' ' + d.rows.map(x => x.mat + ' ' + x.code + ' ' + x.desc).join(' ')).toLowerCase(); });
    DO_GROUPS.sort((a, b) => b.ts - a.ts || DO_COL.compare(a.no, b.no));
    doStatus = 'ready';
    sourceDone([...new Set(DO_GROUPS.map(d => d.sub))]);
  } catch (e) {
    doStatus = 'error'; sourceDone([]);
    doError = e.message + (location.protocol === 'file:' ? ' Buka lewat alamat web (GitHub Pages), bukan langsung dari file.' : '');
  }
  initDO();
}

function renderDOStatus() {
  const msg = doStatus === 'loading' ? 'Memuat data DO...' : doError;
  ['do-s-rows', 'do-s-out', 'do-s-cable', 'do-s-device', 'do-s-sub'].forEach(id => document.getElementById(id).textContent = '0');
  document.getElementById('do-recap').classList.add('hidden');
  document.getElementById('do-info').textContent = '';
  document.getElementById('do-page').textContent = '';
  document.getElementById('do-prev').disabled = true;
  document.getElementById('do-next').disabled = true;
  document.getElementById('do-cards').innerHTML = '<div class="lg:col-span-2 py-12 px-4 text-center text-sm ' + (doStatus === 'error' ? 'text-rose-600' : 'text-slate-500') + '">' + msg + '</div>';
}

function initDO() {
  const adm = doIsAdmin(), rows = doScope();
  const uniq = f => [...new Set(rows.flatMap(f))];
  const fill = (id, label, vals) => { document.getElementById(id).innerHTML = '<option value="">' + label + '</option>' + vals.map(v => '<option value="' + escA(v) + '">' + escA(v) + '</option>').join(''); };
  fill('do-sub', 'Semua Subcont', uniq(d => [d.sub]).sort());
  fill('do-region', 'Semua Region', uniq(d => [d.region]).sort());
  fill('do-mat', 'Semua Material', uniq(d => [...d.mats]).sort((a, b) => DO_COL.compare(a, b)));
  fill('do-year', 'Semua Tahun', uniq(d => [d.yr]).sort().reverse());
  document.querySelectorAll('[data-admin]').forEach(e => e.classList.toggle('hidden', !adm));
  document.getElementById('do-subtitle').textContent = 'Delivery Order · ' + (adm ? 'ADMIN · Semua Subcont' : appState.user.subconName);
  document.getElementById('do-s-sub-l').textContent = adm ? 'Subcont' : 'Jenis Material';
  Object.assign(doState, { q: '', sub: '', region: '', mat: '', year: '', sort: 'date-desc', page: 1 });
  document.getElementById('do-q').value = '';
  document.getElementById('do-sort').value = 'date-desc';
  renderDO();
}
function doSet(k, v) { doState[k] = v; doState.page = 1; renderDO(); }
function doPage(d) { doState.page += d; renderDO(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function doReset() { initDO(); }
function doPick(n) {
  const v = doState.sub === n ? '' : n;
  document.getElementById('do-sub').value = v;
  doSet('sub', v);
}

function renderDO() {
  const f = doState, q = f.q.trim().toLowerCase(), adm = doIsAdmin();
  if (doStatus !== 'ready') { renderDOStatus(); return; }
  const r = doScope().filter(d => (!f.sub || d.sub === f.sub) && (!f.region || d.region === f.region) && (!f.mat || d.mats.has(f.mat)) && (!f.year || d.yr === f.year) && (!q || d._s.includes(q)));
  /* data sudah terurut terbaru saat dimuat */
  if (f.sort === 'date-asc') r.reverse();
  else if (f.sort === 'sub') r.sort((a, b) => DO_COL.compare(a.sub, b.sub));
  else if (f.sort === 'kabel-desc') r.sort((a, b) => b.cable - a.cable);
  else if (f.sort === 'perangkat-desc') r.sort((a, b) => b.device - a.device);
  doCur = r;

  document.getElementById('do-s-rows').textContent = nf(r.length);
  document.getElementById('do-s-out').textContent = nf(r.reduce((t, d) => t + d.rows.length, 0));
  document.getElementById('do-s-cable').textContent = nf(r.reduce((t, d) => t + d.cable, 0));
  document.getElementById('do-s-device').textContent = nf(r.reduce((t, d) => t + d.device, 0));
  document.getElementById('do-s-sub').textContent = nf(new Set(r.flatMap(d => adm ? [d.sub] : [...d.mats])).size);

  document.getElementById('do-recap').classList.toggle('hidden', !adm);
  if (adm) {
    const g = {};
    r.forEach(d => { const o = g[d.sub] || (g[d.sub] = { n: 0, rows: 0, cable: 0, device: 0 }); o.n++; o.rows += d.rows.length; o.cable += d.cable; o.device += d.device; });
    const list = Object.entries(g).sort((a, b) => b[1].cable - a[1].cable || b[1].device - a[1].device);
    const c = 'py-2.5 px-4 text-right ';
    document.getElementById('do-recap-body').innerHTML = list.length ? list.map(([n, o]) =>
      '<tr class="hover:bg-[#e6f2f8]/50 cursor-pointer ' + (f.sub === n ? 'bg-[#e6f2f8]' : '') + '" data-sub="' + escA(n) + '" onclick="doPick(this.dataset.sub)">' +
      '<td class="py-2.5 px-4 font-semibold text-slate-900">' + n + '</td><td class="' + c + 'text-slate-700">' + nf(o.n) + '</td><td class="' + c + 'text-slate-700">' + nf(o.rows) + '</td>' +
      '<td class="' + c + 'font-bold text-slate-900">' + nf(o.cable) + '</td><td class="' + c + 'font-bold text-slate-900">' + nf(o.device) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="py-6 text-center text-sm text-slate-500">Tidak ada data.</td></tr>';
  }

  const pages = Math.max(1, Math.ceil(r.length / DO_PER_PAGE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const off = (f.page - 1) * DO_PER_PAGE, slice = r.slice(off, off + DO_PER_PAGE);
  document.getElementById('do-info').textContent = 'Menampilkan ' + slice.length + ' dari ' + nf(r.length) + ' DO' + (adm && doSkipped ? ' · Dilewati: ' + nf(doSkipped) + ' baris tidak valid' : '');
  document.getElementById('do-page').textContent = 'Halaman ' + f.page + ' / ' + pages;
  document.getElementById('do-prev').disabled = f.page <= 1;
  document.getElementById('do-next').disabled = f.page >= pages;

  document.getElementById('do-cards').innerHTML = slice.length ? slice.map((d, i) =>
    '<button type="button" onclick="doOpen(' + (off + i) + ')" class="text-left bg-white rounded-2xl border border-slate-200 hover:border-[#006699]/50 hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.25)] transition-all p-4 flex items-center justify-between gap-3 cursor-pointer group">' +
    '<div class="min-w-0"><div class="text-[15px] font-extrabold text-slate-900 leading-snug break-words">' + d.no + '</div>' +
    '<div class="text-[13px] text-slate-600 mt-0.5">' + d.date + (d.wh ? ' &middot; ' + d.wh : '') + ' &middot; ' + d.rows.length + ' material</div>' +
    '<div class="text-xs text-slate-400 mt-0.5 truncate">' + (adm ? d.sub + ' &middot; ' : '') + d.city + ' &middot; ' + d.region + '</div></div>' +
    '<div class="flex items-center gap-2.5 shrink-0">' + doBadge(d) + '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover:text-[#006699] group-hover:translate-x-0.5 transition-all"></i></div></button>').join('')
    : '<div class="lg:col-span-2 py-12 text-center text-sm text-slate-500">Tidak ada DO yang cocok dengan pencarian atau filter.</div>';
  lucide.createIcons();
}

/* ---- popup detail ---- */
function doOpen(i) {
  const d = doCur[i]; if (!d) return;
  const $ = id => document.getElementById(id);
  const dash = v => v ? nf(v) : '-';
  const dates = [...d.dates];
  $('do-d-no').textContent = d.no;
  $('do-d-sub').textContent = d.sub + ' · ' + d.city + ' · ' + d.region;
  $('do-d-badge').innerHTML = doBadge(d);
  $('do-d-meta').innerHTML = '<span>Tanggal: <b class="text-slate-800">' + dates.join(', ') + '</b></span><span>Gudang asal: <b class="text-slate-800">' + (d.wh || '-') + '</b></span><span>' + d.rows.length + ' material</span>';
  const td = (v, c) => '<td class="py-2.5 pr-3 ' + (c || '') + '">' + v + '</td>';
  $('do-d-rows').innerHTML = d.rows.map(x =>
    '<tr>' + td('<div class="font-semibold text-slate-900 whitespace-nowrap">' + x.mat + '</div><div class="text-[11px] text-slate-400">' + x.code + (x.desc ? ' &middot; ' + x.desc : '') + '</div>') +
    td(nf(x.qty), 'text-right font-semibold text-slate-900') + td(x.subQty === null ? '-' : nf(x.subQty), 'text-right ' + (x.subQty === null ? 'text-slate-300' : 'text-slate-900')) +
    td(x.verified || '-', x.verified ? 'text-lime-700 font-semibold' : 'text-slate-300') + td(x.recon || '-', 'whitespace-nowrap ' + (x.recon ? 'text-slate-700' : 'text-slate-300')) +
    td(x.link ? '<a href="' + x.link + '" target="_blank" rel="noopener" class="text-[#006699] font-bold hover:underline">Buka</a>' : '-', x.link ? '' : 'text-slate-300') + '</tr>').join('');
  $('do-d-foot').innerHTML =
    '<tr class="border-t-2 border-slate-200 font-bold text-slate-900"><td class="py-2.5 pr-3">Total kabel</td><td class="py-2.5 pr-3 text-right">' + dash(d.cable) + '</td><td class="py-2.5 pr-3 text-right">' + dash(d.scable) + '</td><td colspan="3"></td></tr>' +
    '<tr class="font-bold text-slate-900"><td class="py-1 pr-3">Total perangkat</td><td class="py-1 pr-3 text-right">' + dash(d.device) + '</td><td class="py-1 pr-3 text-right">' + dash(d.sdevice) + '</td><td colspan="3"></td></tr>';
  $('do-modal').classList.remove('hidden');
  $('do-d-body').scrollTop = 0;
  lucide.createIcons();
}
function doClose() { document.getElementById('do-modal').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') doClose(); });

initDO();
loadDO();
