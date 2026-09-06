# FitFlow

Aplicación web de reservas para clases de gimnasio: registro e inicio de sesión, plazas limitadas que se controlan de forma atómica, agenda personal y correos de confirmación.

## Ejecución local

1. Crea y activa un entorno virtual: `python -m venv .venv`
2. Instala dependencias: `python -m pip install -r requirements.txt`
3. Copia `.env.example` a `.env` y ajusta los datos de correo si procede.
4. Ejecuta: `python app.py`
5. Abre `http://127.0.0.1:5000`

La base de datos SQLite y tres clases de ejemplo se crean en el primer arranque. Sin configuración SMTP, las confirmaciones se registran en la consola; para producción configura un proveedor SMTP y una clave `APP_SECRET` segura.

## Publicación en Render

El archivo `render.yaml` crea una aplicación Flask con dos instancias, una base de datos PostgreSQL en Frankfurt y pool de conexiones. Para publicarla:

1. Sube este directorio a un repositorio de GitHub privado o público.
2. En Render, selecciona **New → Blueprint** y conecta ese repositorio.
3. Confirma el Blueprint. Render creará la base de datos y configurará `DATABASE_URL` y `APP_SECRET` sin exponerlas en Git.
4. En el panel del servicio, añade los valores reales de `BUSINESS_EMAIL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`.
5. Despliega; Render entregará una URL HTTPS. Añade después tu dominio en la sección **Custom Domains**.

La configuración inicia dos instancias para disponer de redundancia. En una cuenta Render Pro se puede cambiar a autoescalado desde la pantalla Scaling cuando el tráfico lo requiera.

## Decisiones técnicas

- **Flask + SQLite:** bajo mantenimiento y suficiente para un primer despliegue. Para alta concurrencia, migra a PostgreSQL y conserva la transacción de reserva.
- **Seguridad:** contraseñas con hash de Werkzeug, sesiones HTTP-only, token CSRF y consultas parametrizadas.
- **Plazas limitadas:** la reserva se ejecuta en una transacción `BEGIN IMMEDIATE`, por lo que dos solicitudes simultáneas no pueden vender la misma última plaza.
