import { sb, esc, cop, CATS } from './common.js';
const $ = s => document.querySelector(s);
const ORDER = Object.keys(CATS);
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let gifts = [], cat = 'Todas', q = '', onlyAvail = false, current = null, busy = false, timer;

async function load() {
  const { data, error } = await sb.from('gifts').select('*');
  if (error) {
    $('#grid').innerHTML = '<div class="empty"><p>No pudimos cargar la lista. Revisa tu conexión a internet.</p><button class="btn" id="retry">Reintentar</button></div>';
    $('#retry').onclick = load;
    return;
  }
  gifts = data.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name, 'es'));
  render();
}

const card = g => {
  const free = g.status === 'disponible';
  const thumb = g.image_url ? `<img src="${esc(g.image_url)}" alt="" loading="lazy">` : `<span>${CATS[g.category] || '🎁'}</span>`;
  return `<article class="card ${free ? '' : 'taken'}"><div class="thumb">${thumb}</div>
  <div class="body"><span class="tag">${esc(g.category)}</span><h3>${esc(g.name)}</h3><p>${esc(g.description)}</p>
  ${g.estimated_price ? `<p class="price">Aprox. ${cop(g.estimated_price)}</p>` : ''}</div>
  ${free ? `<button class="btn" data-id="${g.id}">Quiero regalarlo</button>` : '<p class="state">Otra persona ya lo eligió 💛</p>'}</article>`;
};

function render() {
  const avail = gifts.filter(g => g.status === 'disponible').length;
  $('#nAvail').textContent = avail;
  $('#nTaken').textContent = gifts.length - avail;
  const cats = ['Todas', ...new Set([...ORDER, ...gifts.map(g => g.category)].filter(c => gifts.some(g => g.category === c)))];
  $('#chips').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${c === 'Todas' ? 'Todas' : (CATS[c] || '🎁') + ' ' + esc(c)}</button>`).join('');
  const list = gifts.filter(g => (cat === 'Todas' || g.category === cat) && (!onlyAvail || g.status === 'disponible') && (!q || norm(g.name + ' ' + g.description).includes(norm(q))));
  $('#grid').innerHTML = list.length ? list.map(card).join('') : '<p class="empty">No encontramos regalos con esos filtros.</p>';
}

const showErr = m => { const e = $('#err'); e.textContent = m; e.hidden = !m; };

$('#chips').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; render(); } };
$('#search').oninput = e => { q = e.target.value; render(); };
$('#onlyAvail').onchange = e => { onlyAvail = e.target.checked; render(); };
$('#grid').onclick = e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  current = gifts.find(g => g.id === b.dataset.id); if (!current) return;
  $('#dlgTitle').textContent = current.name; $('#dlgDesc').textContent = current.description || '';
  $('#form').reset(); showErr(''); $('#ok').hidden = false; $('#formView').hidden = false; $('#thanksView').hidden = true;
  $('#dlg').showModal();
};
$('#cancel').onclick = $('#close').onclick = () => $('#dlg').close();

$('#form').onsubmit = async e => {
  e.preventDefault();
  if (busy) return;
  const name = $('#guest').value.trim();
  if (!name) return showErr('Escribe tu nombre para continuar.');
  busy = true; $('#ok').disabled = true; showErr('');
  const { data, error } = await sb.rpc('reserve_gift', { p_gift_id: current.id, p_guest_name: name, p_message: $('#msg').value });
  busy = false; $('#ok').disabled = false;
  if (error) return showErr('No pudimos conectar. Revisa tu internet e inténtalo de nuevo.');
  if (!data.ok) {
    showErr(data.error === 'no_disponible' ? '¡Ups! Alguien acaba de reservar este regalo. Por favor elige otro.' : 'Escribe tu nombre para continuar.');
    if (data.error === 'no_disponible') { $('#ok').hidden = true; load(); }
    return;
  }
  $('#thanksTitle').textContent = `¡Gracias, ${name}!`;
  $('#formView').hidden = true; $('#thanksView').hidden = false;
  load();
};

sb.channel('gifts-live').on('postgres_changes', { event: '*', schema: 'public', table: 'gifts' }, () => { clearTimeout(timer); timer = setTimeout(load, 300); }).subscribe();
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
