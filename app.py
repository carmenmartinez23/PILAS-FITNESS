import os
import secrets
import smtplib
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
import locale
from email.message import EmailMessage
from functools import wraps

try:
    from dotenv import load_dotenv
except ImportError:
    # The app can still run before the optional .env helper is installed.
    def load_dotenv():
        return False
from flask import Flask, abort, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None

load_dotenv()

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("APP_SECRET", "development-only-change-me"),
    DATABASE_URL=os.getenv("DATABASE_URL"),
    DATABASE_PATH=os.getenv("DATABASE_PATH", "fitflow.db"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


class Database:
    """Small adapter keeping local SQLite and production PostgreSQL compatible."""
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, statement, parameters=()):
        if self.postgres:
            statement = statement.replace("?", "%s")
        return self.connection.execute(statement, parameters)

    def executemany(self, statement, parameters):
        if self.postgres:
            statement = statement.replace("?", "%s")
        return self.connection.executemany(statement, parameters)


def db():
    if "db" not in g:
        database_url = app.config["DATABASE_URL"]
        if database_url:
            if psycopg is None:
                raise RuntimeError("Instala las dependencias de requirements.txt para usar PostgreSQL.")
            connection = psycopg.connect(database_url, autocommit=True, row_factory=dict_row)
            g.db = Database(connection, postgres=True)
        else:
            connection = sqlite3.connect(app.config["DATABASE_PATH"], isolation_level=None)
            connection.row_factory = sqlite3.Row
            g.db = Database(connection)
    return g.db

locale.setlocale(locale.LC_TIME, 'es_ES.UTF-8')
@app.template_filter('fecha_es')

def fecha_es(fecha):
    if not fecha:
        return ""
    if isinstance(fecha, str):
        fecha = datetime.strptime(fecha, "%Y-%m-%d")
    return fecha.strftime("%A, %-d de %B de %Y").capitalize()

@app.teardown_appcontext
def close_db(_error=None):
    connection = g.pop("db", None)
    if connection:
        connection.connection.close()


def init_db():
    with app.app_context():
        connection = db()
        if connection.postgres:
            statements = """
            CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS classes (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, trainer TEXT NOT NULL, description TEXT NOT NULL, class_date DATE NOT NULL, class_time TIME NOT NULL, duration INTEGER NOT NULL, capacity INTEGER NOT NULL CHECK(capacity > 0), image_url TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bookings (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, class_id));
            CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY);
            """
            for statement in statements.split(";"):
                if statement.strip():
                    connection.execute(statement)
        else:
            connection.connection.executescript("""
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                trainer TEXT NOT NULL,
                description TEXT NOT NULL,
                class_date TEXT NOT NULL,
                class_time TEXT NOT NULL,
                duration INTEGER NOT NULL,
                capacity INTEGER NOT NULL CHECK(capacity > 0),
                image_url TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, class_id)
            );
            CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY);
            """)
        # The marker makes demo-data creation safe even when several workers start together.
        # The count also protects databases created by older local versions.
        class_count = connection.execute("SELECT COUNT(*) AS total FROM classes").fetchone()["total"]
        seeded = None
        if class_count == 0:
            seeded = connection.execute("INSERT INTO app_meta (key) VALUES ('initial-classes') ON CONFLICT DO NOTHING RETURNING key").fetchone()
        else:
            connection.execute("INSERT INTO app_meta (key) VALUES ('initial-classes') ON CONFLICT DO NOTHING")
        if seeded:
            tomorrow = date.today() + timedelta(days=1)
            data = [
                ("HYROX", "Clara Moreno", "Un entrenamiento intenso, corto y adictivo para elevar tu energía.", "sábado, 4 de octubre de 2025", "12:30", 45, 12, "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=85"),
                ("Yoga Flow", "Noa Fernández", "Respira, fortalece y recupera el equilibrio con movimientos fluidos.", tomorrow.isoformat(), "18:00", 60, 16, "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=85"),
                ("Cycle Beat", "Marcos Díaz", "Ritmo, resistencia y una sesión que te hará querer volver mañana.", (tomorrow + timedelta(days=1)).isoformat(), "19:15", 50, 10, "https://images.unsplash.com/photo-1591291621164-2c6367723315?auto=format&fit=crop&w=1200&q=85"),
            ]
            connection.executemany("""INSERT INTO classes
                (title, trainer, description, class_date, class_time, duration, capacity, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", data)


# Gunicorn imports this module rather than running it as __main__.
init_db()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            flash("Inicia sesión para reservar una clase.", "info")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


@app.before_request
def load_user_and_csrf():
    g.user = None
    if "user_id" in session:
        g.user = db().execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    if request.method == "POST" and request.form.get("csrf_token") != session["csrf_token"]:
        abort(400, "Solicitud no válida. Actualiza la página e inténtalo de nuevo.")


@app.context_processor
def inject_globals():
    return {"csrf_token": session.get("csrf_token")}


def send_confirmation(user, fitness_class):
    business_email = os.getenv("BUSINESS_EMAIL")
    sender = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "no-reply@fitflow.local"))
    details = f"{fitness_class['title']} · {fitness_class['class_date']} a las {fitness_class['class_time']}"
    recipients = [user["email"]] + ([business_email] if business_email else [])
    message = EmailMessage()
    message["Subject"] = f"Reserva confirmada · {fitness_class['title']}"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content(f"Hola {user['name']},\n\nTu plaza está confirmada para: {details}.\n\n¡Nos vemos pronto!\nFitFlow")
    host = os.getenv("SMTP_HOST")
    if not host:
        app.logger.info("SMTP no configurado. Confirmación simulada para %s: %s", recipients, details)
        return
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as server:
        server.starttls()
        server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        server.send_message(message)


@app.route("/")
def index():
    classes = db().execute("""
        SELECT c.*, c.capacity - COUNT(b.id) AS places_left
        FROM classes c LEFT JOIN bookings b ON b.class_id = c.id
        GROUP BY c.id ORDER BY c.class_date, c.class_time
    """).fetchall()
    return render_template("index.html", classes=classes)


@app.route("/registro", methods=["GET", "POST"])
def register():
    if g.user:
        return redirect(url_for("index"))
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if len(name) < 2 or "@" not in email or len(password) < 8:
            flash("Completa los datos: contraseña de al menos 8 caracteres.", "error")
        else:
            try:
                cursor = db().execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id",
                    (name, email, generate_password_hash(password)))
                session["user_id"] = cursor.fetchone()["id"]
                flash("Tu cuenta está lista. ¡Elige tu próxima clase!", "success")
                return redirect(url_for("index"))
            except (sqlite3.IntegrityError, psycopg.IntegrityError if psycopg else sqlite3.IntegrityError):
                flash("Ya existe una cuenta con este correo.", "error")
    return render_template("auth.html", mode="register")


@app.route("/acceder", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("index"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        user = db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user and check_password_hash(user["password_hash"], request.form.get("password", "")):
            session["user_id"] = user["id"]
            return redirect(request.args.get("next") or url_for("index"))
        flash("Correo o contraseña incorrectos.", "error")
    return render_template("auth.html", mode="login")


@app.post("/salir")
def logout():
    session.clear()
    flash("Has cerrado sesión.", "info")
    return redirect(url_for("index"))


@app.post("/clases/<int:class_id>/reservar")
@login_required
def book(class_id):
    connection = db()
    # IMMEDIATE obtains a write lock before counting, avoiding overselling on concurrent requests.
    connection.execute("BEGIN" if connection.postgres else "BEGIN IMMEDIATE")
    try:
        lock = " FOR UPDATE" if connection.postgres else ""
        fitness_class = connection.execute("SELECT * FROM classes WHERE id = ?" + lock, (class_id,)).fetchone()
        if not fitness_class:
            abort(404)
        already_booked = connection.execute("SELECT 1 FROM bookings WHERE user_id = ? AND class_id = ?", (g.user["id"], class_id)).fetchone()
        booked = connection.execute("SELECT COUNT(*) AS total FROM bookings WHERE class_id = ?", (class_id,)).fetchone()["total"]
        if already_booked:
            flash("Ya tienes una reserva en esta clase.", "info")
        elif booked >= fitness_class["capacity"]:
            flash("Lo sentimos, esta clase se ha llenado.", "error")
        else:
            connection.execute("INSERT INTO bookings (user_id, class_id) VALUES (?, ?)", (g.user["id"], class_id))
            connection.execute("COMMIT")
            try:
                send_confirmation(g.user, fitness_class)
            except Exception:
                app.logger.exception("La reserva se creó, pero el email no se pudo enviar")
            flash("¡Plaza reservada! Te enviamos la confirmación por correo.", "success")
            return redirect(url_for("dashboard"))
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    return redirect(url_for("index") + "#clases")


@app.route("/mis-reservas")
@login_required
def dashboard():
    bookings = db().execute("""
        SELECT c.*, b.id AS booking_id FROM bookings b JOIN classes c ON c.id = b.class_id
        WHERE b.user_id = ? ORDER BY c.class_date, c.class_time
    """, (g.user["id"],)).fetchall()
    return render_template("dashboard.html", bookings=bookings)


if __name__ == "__main__":
    app.run(debug=True)
