import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cop = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
export const CATS = {
  'Descanso y habitación': '🌙', 'Alimentación y lactancia': '🍼', 'Higiene y cuidado': '🛁',
  'Ropa y accesorios': '🧸', 'Paseos y transporte': '🚼', 'Estimulación y entretenimiento': '⭐', 'Regalos especiales': '🎁'
};
export const STATUS = { disponible: 'Disponible', reservado: 'Reservado', entregado: 'Entregado' };
