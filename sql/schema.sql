-- BABY SHOWER · esquema, seguridad y datos iniciales. Ejecutar completo en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  category text not null,
  estimated_price integer check (estimated_price is null or estimated_price >= 0),
  image_url text,
  status text not null default 'disponible' check (status in ('disponible','reservado','entregado')),
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts(id) on delete cascade,
  guest_name text not null check (length(trim(guest_name)) between 1 and 80),
  message text check (message is null or length(message) <= 500),
  status text not null default 'activa' check (status in ('activa','cancelada')),
  created_at timestamptz not null default now()
);
-- Un regalo solo puede tener UNA reserva activa (red de seguridad a nivel de BD)
create unique index one_active_reservation_per_gift on public.reservations(gift_id) where status = 'activa';

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- RLS
alter table public.gifts enable row level security;
alter table public.reservations enable row level security;
alter table public.admins enable row level security;  -- sin políticas: nadie la lee directamente

create policy "gifts_select_all" on public.gifts for select to anon, authenticated using (true);
create policy "gifts_admin_insert" on public.gifts for insert to authenticated with check (public.is_admin());
create policy "gifts_admin_update" on public.gifts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gifts_admin_delete" on public.gifts for delete to authenticated using (public.is_admin());
create policy "reservations_admin_select" on public.reservations for select to authenticated using (public.is_admin());
-- Sin políticas de escritura en reservations: solo se escribe mediante las funciones de abajo.

revoke all on public.reservations from anon;
revoke insert, update, delete on public.gifts from anon;

-- Reserva ATÓMICA: el UPDATE bloquea la fila; si dos personas llegan a la vez, la segunda
-- espera, vuelve a evaluar "status = 'disponible'" y ya no encuentra fila.
create or replace function public.reserve_gift(p_gift_id uuid, p_guest_name text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;
  update public.gifts set status = 'reservado' where id = p_gift_id and status = 'disponible' returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_disponible');
  end if;
  insert into public.reservations (gift_id, guest_name, message)
  values (p_gift_id, left(trim(p_guest_name), 80), nullif(left(trim(coalesce(p_message, '')), 500), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_cancel_reservation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gift uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.reservations set status = 'cancelada' where id = p_id and status = 'activa' returning gift_id into v_gift;
  if v_gift is not null then update public.gifts set status = 'disponible' where id = v_gift; end if;
end $$;

create or replace function public.admin_set_status(p_gift uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('disponible','reservado','entregado') then raise exception 'estado invalido'; end if;
  if p_status = 'disponible' then
    update public.reservations set status = 'cancelada' where gift_id = p_gift and status = 'activa';
  end if;
  update public.gifts set status = p_status where id = p_gift;
end $$;

revoke all on function public.reserve_gift(uuid, text, text) from public;
revoke all on function public.admin_cancel_reservation(uuid) from public, anon;
revoke all on function public.admin_set_status(uuid, text) from public, anon;
revoke all on function public.is_admin() from public;
grant execute on function public.reserve_gift(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_cancel_reservation(uuid) to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Tiempo real
alter publication supabase_realtime add table public.gifts;

-- Datos iniciales (precios orientativos en COP, editables desde el panel)
insert into public.gifts (name, category, estimated_price, description) values
('Sábanas ajustables para cuna','Descanso y habitación',60000,'Juego de algodón suave y transpirable.'),
('Protector impermeable de colchón','Descanso y habitación',50000,'Cuida el colchón sin perder comodidad.'),
('Saco de dormir para bebé','Descanso y habitación',90000,'Abrigo seguro para las noches.'),
('Mantas de algodón','Descanso y habitación',70000,'Livianas y suaves para el día a día.'),
('Organizador para pañales','Descanso y habitación',60000,'Para tener todo a la mano en la habitación.'),
('Luz nocturna','Descanso y habitación',50000,'Luz tenue para las tomas de la madrugada.'),
('Móvil para cuna','Descanso y habitación',110000,'Figuras suaves y melodías tranquilas.'),
('Monitor de bebé','Descanso y habitación',250000,'Para estar tranquilos aunque estemos en otro cuarto.'),
('Kit de teteros','Alimentación y lactancia',120000,'Varios tamaños con tetinas anticólicos.'),
('Cepillo limpiador de teteros','Alimentación y lactancia',25000,'Para una limpieza fácil y profunda.'),
('Escurridor de teteros','Alimentación y lactancia',60000,'Secado higiénico en la cocina.'),
('Extractor manual de leche','Alimentación y lactancia',130000,'Práctico y cómodo para la lactancia.'),
('Bolsas para almacenar leche materna','Alimentación y lactancia',40000,'Aptas para congelar, caja por 50.'),
('Baberos impermeables','Alimentación y lactancia',35000,'Paquete de baberos fáciles de lavar.'),
('Kit de alimentación de silicona','Alimentación y lactancia',70000,'Plato, cuchara y vaso para empezar sólidos.'),
('Cojín de lactancia','Alimentación y lactancia',120000,'Apoyo cómodo para mamá y bebé.'),
('Termo para agua','Alimentación y lactancia',80000,'Mantiene el agua a buena temperatura.'),
('Bañera para bebé','Higiene y cuidado',120000,'Ergonómica y antideslizante.'),
('Toallas con capucha','Higiene y cuidado',60000,'Suaves y absorbentes.'),
('Cambiador portátil','Higiene y cuidado',80000,'Ideal para cambios fuera de casa.'),
('Kit de cuidado personal','Higiene y cuidado',70000,'Cepillo, peine, cortaúñas y lima.'),
('Termómetro digital','Higiene y cuidado',70000,'Lectura rápida y confiable.'),
('Aspirador nasal','Higiene y cuidado',50000,'Alivia la congestión con suavidad.'),
('Pañales','Higiene y cuidado',90000,'Paquete de pañales etapa recién nacido o 1.'),
('Pañitos húmedos','Higiene y cuidado',40000,'Hipoalergénicos, para pieles sensibles.'),
('Caneca para pañales','Higiene y cuidado',150000,'Con cierre que controla los olores.'),
('Bodies de algodón','Ropa y accesorios',80000,'Paquete de bodies de manga corta y larga.'),
('Pijamas enterizas','Ropa y accesorios',100000,'Cómodas y abrigadas para dormir.'),
('Conjuntos de ropa talla 3-6 meses','Ropa y accesorios',120000,'Ropita fresca y cómoda.'),
('Conjuntos de ropa talla 6-9 meses','Ropa y accesorios',120000,'Para cuando crezca un poquito más.'),
('Medias y gorritos','Ropa y accesorios',40000,'Para mantener bien calentito al bebé.'),
('Babitas de tela','Ropa y accesorios',40000,'Pequeñas y absorbentes.'),
('Muselinas','Ropa y accesorios',60000,'Multiusos: cobija, pañal de tela, sombra.'),
('Cobija liviana para coche','Ropa y accesorios',70000,'Perfecta para los paseos.'),
('Pañalera tipo morral','Paseos y transporte',150000,'Con compartimentos para todo.'),
('Organizador para coche','Paseos y transporte',70000,'Más espacio y orden en cada paseo.'),
('Espejo para silla de carro','Paseos y transporte',50000,'Para ver al bebé mientras manejamos.'),
('Portabebés ergonómico','Paseos y transporte',220000,'Manos libres y cercanía total.'),
('Mosquitero para coche','Paseos y transporte',40000,'Protección liviana contra insectos.'),
('Protector de lluvia para coche','Paseos y transporte',50000,'Para los días lluviosos.'),
('Gimnasio de actividades','Estimulación y entretenimiento',180000,'Arco con juguetes para explorar.'),
('Libros de tela','Estimulación y entretenimiento',60000,'Colores y texturas para los primeros meses.'),
('Tarjetas de estimulación visual','Estimulación y entretenimiento',40000,'Alto contraste para desarrollar la vista.'),
('Sonajeros','Estimulación y entretenimiento',40000,'Sonidos suaves y fáciles de agarrar.'),
('Juguetes sensoriales','Estimulación y entretenimiento',70000,'Texturas y formas para descubrir.'),
('Tapete de juegos','Estimulación y entretenimiento',150000,'Espacio mullido para jugar y gatear.'),
('Cuna','Regalos especiales',600000,'Un regalo grande para compartir entre varios.'),
('Colchón para cuna','Regalos especiales',250000,'Firme y de buena calidad.'),
('Coche','Regalos especiales',900000,'Para pasear con comodidad.'),
('Silla de carro','Regalos especiales',700000,'Seguridad para cada viaje.'),
('Monitor de bebé de gama superior','Regalos especiales',600000,'Con cámara, visión nocturna y sensores.');
