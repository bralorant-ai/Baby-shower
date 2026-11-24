# Lista de regalos · Baby Shower

Sitio estático (HTML + CSS + JS) con Supabase como backend, publicado en GitHub Pages.

```
site/        página pública (index.html), panel (admin.html), css/, js/
sql/         schema.sql: tablas, RLS, funciones y regalos iniciales
.github/     deploy.yml: despliegue automático a GitHub Pages
```

## 1. Configurar Supabase
1. Crea un proyecto en https://supabase.com (plan gratuito).
2. Ve a **SQL Editor**, pega todo `sql/schema.sql` y pulsa **Run**. Crea tablas, seguridad (RLS), reservas atómicas, tiempo real y los 54 regalos iniciales.
3. **Authentication > Providers > Email**: desactiva **Allow new users to sign up** (así nadie más puede crear cuentas).
4. **Authentication > Users > Add user**: crea tu usuario organizador (correo + contraseña, marca *Auto Confirm*). Repite para tu pareja si quieres.
5. Autoriza ese usuario como administrador (SQL Editor):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email in ('tu@correo.com');
   ```
6. **Settings > API**: copia la *Project URL* y la clave **anon / publishable**.

## 2. Variables públicas
Edita `site/js/config.js` con esa URL y esa clave. Es una clave pública, segura de subir al repositorio gracias a RLS. **Nunca uses la `service_role`.**

## 3. Publicar en GitHub Pages
1. Crea un repositorio en GitHub y sube el proyecto a la rama `main`:
   ```bash
   git init && git add . && git commit -m "Baby shower"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPO.git
   git push -u origin main
   ```
2. En el repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Cada `push` a `main` despliega automáticamente. La URL será `https://USUARIO.github.io/REPO/`. El panel está en `.../admin.html`.

## 4. Administrar
Entra a `/admin.html` con tu correo y contraseña.
- **Regalos**: agregar, editar, eliminar (borra también sus reservas) y cambiar estado (*Disponible* cancela la reserva activa).
- **Reservas**: ver quién reservó, su mensaje, cancelar la reserva (el regalo vuelve a estar disponible) o marcarlo como entregado.
- Las estadísticas aparecen arriba. Los invitados nunca ven nombres de otros invitados.

## 5. Cómo funciona la seguridad
- Los invitados solo pueden **leer** `gifts` y llamar a `reserve_gift`. No pueden leer, crear, editar ni borrar reservas.
- `reserve_gift` hace un `UPDATE ... WHERE status='disponible'`: bloquea la fila, así solo una de dos reservas simultáneas tiene éxito; la otra recibe "alguien acaba de reservar este regalo".
- Un índice único parcial garantiza una sola reserva activa por regalo.
- Las operaciones de organizador exigen sesión de Supabase Auth **y** estar en la tabla `admins`, verificado en la base de datos.

## 6. Lista de pruebas recomendada
1. Abre la página en dos navegadores; reserva en uno y comprueba que el otro se actualiza sin recargar.
2. Abre el mismo regalo en ambos, y confirma casi a la vez: solo uno debe aceptarse.
3. Sin sesión, en la consola del navegador, `sb.from('reservations').select()` debe devolver vacío o error.
4. Con un usuario que no esté en `admins`, el panel debe rechazar el acceso.
5. Revisa en el celular (o con las herramientas del navegador a 375 px).
