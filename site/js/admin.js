import { sb, esc, cop, CATS, STATUS } from './common.js';
const $ = s => document.querySelector(s);
let gifts = [], res = [], editing = null;

const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; setTimeout(() => t.hidden = true, 3000); };
const show = on => { $('#login').hidden = on; $('#dash').hidden = !on; };
const lerr = m => { $('#lerr').textContent = m; $('#lerr').hidden = !m; };

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(false);
  const { data: ok } = await sb.rpc('is_admin');
  if (!ok) { await sb.auth.signOut(); show(false); return lerr('Esta cuenta no tiene permisos de organizador.'); }
  show(true); refresh();
}

async function refresh() {
  const [g, r] = await Promise.all([
    sb.from('gifts').select('*').order('category').order('name'),
    sb.from('reservations').select('id,gift_id,guest_name,message,status,created_at,gifts(name)').order('created_at', { ascending: false })
  ]);
  if (g.error || r.error) return toast('No se pudieron cargar los datos.');
  gifts = g.data; res = r.data; render();
}

function render() {
  const act = Object.fromEntries(res.filter(r => r.status === 'activa').map(r => [r.gift_id, r]));
  const n = s => gifts.filter(g => g.status === s).length;
  const val = gifts.filter(g => g.status !== 'disponible').reduce((a, g) => a + (g.estimated_price || 0), 0);
  $('#stats').innerHTML = [['Total', gifts.length], ['Disponibles', n('disponible')], ['Reservados', n('reservado')], ['Entregados', n('entregado')], ['Valor reservado', cop(val)]]
    .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#glist').innerHTML = gifts.map(g => `<div class="arow"><div><b>${esc(g.name)}</b><small>${esc(g.category)}${g.estimated_price ? ' · ' + cop(g.estimated_price) : ''}</small>
    ${act[g.id] ? `<small>Reservó: ${esc(act[g.id].guest_name)}</small>` : ''}</div>
    <select data-st="${g.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === g.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <div class="row"><button class="btn ghost" data-edit="${g.id}">Editar</button><button class="btn danger" data-del="${g.id}">Eliminar</button></div></div>`).join('') || '<p class="empty">Aún no hay regalos.</p>';
  $('#rlist').innerHTML = res.map(r => `<div class="arow"><div><b>${esc(r.guest_name)}</b><small>${esc(r.gifts?.name)} · ${new Date(r.created_at).toLocaleString('es-CO')}</small>
    ${r.message ? `<small>“${esc(r.message)}”</small>` : ''}<small>${r.status === 'activa' ? 'Activa' : 'Cancelada'}</small></div>
    ${r.status === 'activa' ? `<div class="row"><button class="btn ghost" data-deliver="${r.gift_id}">Marcar entregado</button><button class="btn danger" data-cancel="${r.id}">Cancelar reserva</button></div>` : ''}</div>`).join('') || '<p class="empty">Aún no hay reservas.</p>';
}

async function rpc(fn, args, okMsg) {
  const { error } = await sb.rpc(fn, args);
  if (error) toast('No se pudo completar la acción.'); else toast(okMsg);
  refresh();
}

$('#lf').onsubmit = async e => {
  e.preventDefault(); lerr('');
  const { error } = await sb.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value });
  if (error) return lerr('Correo o contraseña incorrectos.');
  boot();
};
$('#out').onclick = async () => { await sb.auth.signOut(); show(false); };
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
  $('#tab-gifts').hidden = b.dataset.tab !== 'gifts'; $('#tab-res').hidden = b.dataset.tab !== 'res';
});

$('#f-cat').innerHTML = Object.keys(CATS).map(c => `<option>${esc(c)}</option>`).join('');
function openForm(g) {
  editing = g; $('#gdTitle').textContent = g ? 'Editar regalo' : 'Agregar regalo';
  $('#f-name').value = g?.name || ''; $('#f-cat').value = g?.category || Object.keys(CATS)[0];
  $('#f-price').value = g?.estimated_price ?? ''; $('#f-desc').value = g?.description || ''; $('#f-img').value = g?.image_url || '';
  $('#gerr').hidden = true; $('#gd').showModal();
}
$('#add').onclick = () => openForm(null);
$('#gcancel').onclick = () => $('#gd').close();
$('#gf').onsubmit = async e => {
  e.preventDefault();
  const row = { name: $('#f-name').value.trim(), category: $('#f-cat').value, estimated_price: $('#f-price').value ? +$('#f-price').value : null, description: $('#f-desc').value.trim() || null, image_url: $('#f-img').value.trim() || null };
  const { error } = editing ? await sb.from('gifts').update(row).eq('id', editing.id) : await sb.from('gifts').insert(row);
  if (error) { $('#gerr').textContent = 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.'; $('#gerr').hidden = false; return; }
  $('#gd').close(); toast('Guardado'); refresh();
};

$('#dash').addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.edit) openForm(gifts.find(g => g.id === d.edit));
  if (d.del && confirm('¿Eliminar este regalo? También se borrarán sus reservas.')) {
    const { error } = await sb.from('gifts').delete().eq('id', d.del);
    toast(error ? 'No se pudo eliminar.' : 'Regalo eliminado'); refresh();
  }
  if (d.cancel && confirm('¿Cancelar esta reserva? El regalo volverá a estar disponible.')) rpc('admin_cancel_reservation', { p_id: d.cancel }, 'Reserva cancelada');
  if (d.deliver && confirm('¿Marcar este regalo como entregado?')) rpc('admin_set_status', { p_gift: d.deliver, p_status: 'entregado' }, 'Marcado como entregado');
});
$('#dash').addEventListener('change', e => {
  const id = e.target.dataset.st; if (!id) return;
  if (confirm('¿Cambiar el estado? Si lo dejas "Disponible" se cancela la reserva activa.')) rpc('admin_set_status', { p_gift: id, p_status: e.target.value }, 'Estado actualizado'); else refresh();
});
boot();
