import json
import os
import secrets
import smtplib
import sqlite3
import requests
from contextlib import contextmanager
from datetime import date, datetime, timedelta
import locale
from email.message import EmailMessage
from functools import wraps

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        return False
from flask import Flask, abort, flash, g, redirect, render_template, request, session, url_for

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None

import firebase_admin
from firebase_admin import firestore
from firebase_admin import credentials, auth as firebase_auth
load_dotenv()

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("APP_SECRET", "development-only-change-me"),
    DATABASE_URL=os.getenv("DATABASE_URL"),
    DATABASE_PATH=os.getenv("DATABASE_PATH", "fitflow.db"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def init_firebase_admin():
    if firebase_admin._apps:
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if service_account_json:
        cred = credentials.Certificate(json.loads(service_account_json))
    elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        cred = credentials.ApplicationDefault()
    else:
        app.logger.warning(
            "Firebase Admin no configurado: define FIREBASE_SERVICE_ACCOUNT_JSON "
            "o GOOGLE_APPLICATION_CREDENTIALS para poder verificar el login."
        )
        return
    firebase_admin.initialize_app(cred)


init_firebase_admin()


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

try:
    locale.setlocale(locale.LC_TIME, "es_ES.UTF-8")
except locale.Error:
    pass
@app.template_filter('fecha_es')

def fecha_es(fecha):
    if not fecha:
        return ""

    if isinstance(fecha, str):
        fecha = datetime.strptime(fecha, "%Y-%m-%d")

    try:
        return fecha.strftime("%A, %-d de %B de %Y").capitalize()
    except ValueError:
        return fecha.strftime("%A, %d de %B de %Y").capitalize()

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
            CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, firebase_uid TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
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
                firebase_uid TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE,
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
        class_count = connection.execute("SELECT COUNT(*) AS total FROM classes").fetchone()["total"]
        seeded = None
        if class_count == 0:
            seeded = connection.execute("INSERT INTO app_meta (key) VALUES ('initial-classes') ON CONFLICT DO NOTHING RETURNING key").fetchone()
        else:
            connection.execute("INSERT INTO app_meta (key) VALUES ('initial-classes') ON CONFLICT DO NOTHING")
        if seeded:
            tomorrow = date.today() + timedelta(days=1)
            data = [
                ("HYROX", "Clara Moreno", "Un entrenamiento intenso, corto y adictivo para elevar tu energía.", "2026-10-04", "12:30", 45, 12, "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=85"),
                ("Yoga Flow", "Noa Fernández", "Respira, fortalece y recupera el equilibrio con movimientos fluidos.", tomorrow.isoformat(), "18:00", 60, 16, "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=85"),
                ("Cycle Beat", "Marcos Díaz", "Ritmo, resistencia y una sesión que te hará querer volver mañana.", (tomorrow + timedelta(days=1)).isoformat(), "19:15", 50, 10, "https://images.unsplash.com/photo-1591291621164-2c6367723315?auto=format&fit=crop&w=1200&q=85"),
            ]
            connection.executemany("""INSERT INTO classes
                (title, trainer, description, class_date, class_time, duration, capacity, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", data)


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
    if request.method == "POST":
        token = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
        if token != session["csrf_token"]:
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

def generate_password_reset_link(email):
    try:
        reset_link = firebase_auth.generate_password_reset_link(
            email,
            action_code_settings={
                "url": "https://pilas-fitness.onrender.com/restablecer-contrasena",
                "handle_code_in_app": True,
            }
        )

        return reset_link

    except Exception as error:
        app.logger.error(
            "Firebase password reset link error: %s",
            error
        )

        raise RuntimeError(
            "No se pudo generar el enlace de recuperación."
        )


def send_password_reset_email(email, reset_link):
    resend_api_key = os.getenv("RESEND_API_KEY")

    if not resend_api_key:
        raise RuntimeError(
            "Falta la variable RESEND_API_KEY en Render."
        )

    sender = os.getenv(
        "RESEND_FROM",
        "FitFlow <onboarding@resend.dev>"
    )

    html = f"""
    <!doctype html>
    <html lang="es">

    <head>
        <meta charset="utf-8">
        <meta name="viewport"
              content="width=device-width, initial-scale=1.0">

        <title>Restablece tu contraseña · FitFlow</title>
    </head>

    <body style="
        margin:0;
        padding:0;
        background:#eef8f1;
        font-family:Arial, Helvetica, sans-serif;
        color:#083b2a;
    ">

        <!-- CONTENEDOR PRINCIPAL -->

        <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="
                width:100%;
                background:#eef8f1;
                padding:45px 15px;
            "
        >

            <tr>

                <td align="center">

                    <!-- TARJETA -->

                    <table
                        width="100%"
                        cellpadding="0"
                        cellspacing="0"
                        border="0"
                        style="
                            max-width:580px;
                            background:#ffffff;
                            border-radius:20px;
                            overflow:hidden;
                            box-shadow:0 8px 30px rgba(8,59,42,0.08);
                        "
                    >

                        <!-- CABECERA -->

                        <tr>

                            <td
                                align="center"
                                style="
                                    background:#087542;
                                    padding:32px 30px;
                                "
                            >

                                <!-- LOGO -->

                                <table
                                    cellpadding="0"
                                    cellspacing="0"
                                    border="0"
                                >

                                    <tr>

                                        <td
                                            align="center"
                                            valign="middle"
                                            style="
                                                width:42px;
                                                height:42px;
                                                background:#8fdb4d;
                                                border-radius:50%;
                                                color:#083b2a;
                                                font-size:22px;
                                                font-weight:800;
                                                line-height:42px;
                                            "
                                        >
                                            F
                                        </td>

                                        <td
                                            style="
                                                padding-left:12px;
                                                color:#ffffff;
                                                font-size:16px;
                                                font-weight:800;
                                                letter-spacing:3px;
                                            "
                                        >
                                            FITFLOW
                                        </td>

                                    </tr>

                                </table>

                            </td>

                        </tr>


                        <!-- CONTENIDO -->

                        <tr>

                            <td
                                style="
                                    padding:48px 42px 42px;
                                "
                            >

                                <!-- EYEBROW -->

                                <p style="
                                    margin:0 0 14px;
                                    color:#39705a;
                                    font-size:11px;
                                    font-weight:700;
                                    letter-spacing:2.5px;
                                    text-transform:uppercase;
                                ">
                                    FITFLOW MEMBER
                                </p>


                                <!-- TITULO -->

                                <h1 style="
                                    margin:0 0 22px;
                                    color:#083b2a;
                                    font-size:34px;
                                    line-height:1.12;
                                    font-weight:800;
                                    letter-spacing:-1.2px;
                                ">
                                    ¿Has olvidado<br>
                                    tu contraseña?
                                </h1>


                                <!-- TEXTO -->

                                <p style="
                                    margin:0 0 28px;
                                    color:#39705a;
                                    font-size:15px;
                                    line-height:1.7;
                                ">
                                    No pasa nada. Hemos recibido una
                                    solicitud para cambiar la contraseña
                                    de tu cuenta de FitFlow.
                                </p>


                                <!-- CAJA DE CUENTA -->

                                <table
                                    width="100%"
                                    cellpadding="0"
                                    cellspacing="0"
                                    border="0"
                                    style="
                                        margin-bottom:30px;
                                    "
                                >

                                    <tr>

                                        <td
                                            style="
                                                background:#eef8f1;
                                                border-left:4px solid #8fdb4d;
                                                border-radius:8px;
                                                padding:15px 18px;
                                            "
                                        >

                                            <p style="
                                                margin:0 0 5px;
                                                color:#39705a;
                                                font-size:10px;
                                                font-weight:700;
                                                letter-spacing:1.5px;
                                                text-transform:uppercase;
                                            ">
                                                CUENTA
                                            </p>

                                            <p style="
                                                margin:0;
                                                color:#083b2a;
                                                font-size:14px;
                                                font-weight:600;
                                                word-break:break-word;
                                            ">
                                                {email}
                                            </p>

                                        </td>

                                    </tr>

                                </table>


                                <!-- BOTÓN -->

                                <table
                                    width="100%"
                                    cellpadding="0"
                                    cellspacing="0"
                                    border="0"
                                >

                                    <tr>

                                        <td align="center">

                                            <a
                                                href="{reset_link}"
                                                style="
                                                    display:inline-block;
                                                    background:#087542;
                                                    color:#ffffff;
                                                    text-decoration:none;
                                                    padding:16px 28px;
                                                    border-radius:9px;
                                                    font-size:14px;
                                                    font-weight:700;
                                                    letter-spacing:0.1px;
                                                "
                                            >
                                                Restablecer contraseña
                                                &nbsp;→
                                            </a>

                                        </td>

                                    </tr>

                                </table>


                                <!-- SEPARADOR -->

                                <table
                                    width="100%"
                                    cellpadding="0"
                                    cellspacing="0"
                                    border="0"
                                    style="
                                        margin:34px 0 26px;
                                    "
                                >

                                    <tr>

                                        <td
                                            style="
                                                height:1px;
                                                background:#e3f0e7;
                                                font-size:0;
                                                line-height:0;
                                            "
                                        >
                                            &nbsp;
                                        </td>

                                    </tr>

                                </table>


                                <!-- SEGURIDAD -->

                                <table
                                    width="100%"
                                    cellpadding="0"
                                    cellspacing="0"
                                    border="0"
                                >

                                    <tr>

                                        <td
                                            valign="top"
                                            style="
                                                width:34px;
                                                padding-right:12px;
                                            "
                                        >

                                            <div style="
                                                width:32px;
                                                height:32px;
                                                background:#ddf7e5;
                                                border-radius:50%;
                                                text-align:center;
                                                line-height:32px;
                                                color:#087542;
                                                font-size:15px;
                                                font-weight:700;
                                            ">
                                                ✓
                                            </div>

                                        </td>

                                        <td valign="top">

                                            <p style="
                                                margin:0 0 5px;
                                                color:#083b2a;
                                                font-size:13px;
                                                font-weight:700;
                                            ">
                                                ¿No has sido tú?
                                            </p>

                                            <p style="
                                                margin:0;
                                                color:#39705a;
                                                font-size:12px;
                                                line-height:1.6;
                                            ">
                                                Puedes ignorar este correo.
                                                Tu contraseña no cambiará
                                                mientras no utilices este
                                                enlace.
                                            </p>

                                        </td>

                                    </tr>

                                </table>


                                <!-- CADUCIDAD -->

                                <p style="
                                    margin:28px 0 0;
                                    color:#6c8b7b;
                                    font-size:11px;
                                    line-height:1.6;
                                    text-align:center;
                                ">
                                    Por seguridad, este enlace solo puede
                                    utilizarse una vez.
                                </p>

                            </td>

                        </tr>


                        <!-- FOOTER -->

                        <tr>

                            <td
                                align="center"
                                style="
                                    background:#f7fcf8;
                                    border-top:1px solid #e5f0e8;
                                    padding:24px 30px;
                                "
                            >

                                <p style="
                                    margin:0 0 7px;
                                    color:#083b2a;
                                    font-size:12px;
                                    font-weight:800;
                                    letter-spacing:2px;
                                ">
                                    FITFLOW
                                </p>

                                <p style="
                                    margin:0;
                                    color:#6c8b7b;
                                    font-size:10px;
                                    line-height:1.5;
                                ">
                                    Mueve el cuerpo. Cambia el día.
                                </p>

                            </td>

                        </tr>

                    </table>


                    <!-- TEXTO EXTERIOR -->

                    <p style="
                        margin:20px 10px 0;
                        color:#7b9688;
                        font-size:10px;
                        line-height:1.5;
                        text-align:center;
                    ">
                        Este correo se ha enviado automáticamente.
                        Por favor, no respondas a este mensaje.
                    </p>

                </td>

            </tr>

        </table>

    </body>

    </html>
    """

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json"
        },
        json={
            "from": sender,
            "to": [email],
            "subject": "Restablece tu contraseña · FitFlow",
            "html": html
        },
        timeout=15
    )

    if not response.ok:
        app.logger.error(
            "Resend error: %s",
            response.text
        )

        raise RuntimeError(
            "No se pudo enviar el correo de recuperación."
        )

@app.route("/")
def index():
    classes = db().execute("""
        SELECT c.*, c.capacity - COUNT(b.id) AS places_left
        FROM classes c LEFT JOIN bookings b ON b.class_id = c.id
        GROUP BY c.id ORDER BY c.class_date, c.class_time
    """).fetchall()
    return render_template("index.html", classes=classes)


@app.route("/registro")
def register():
    if g.user:
        return redirect(url_for("index"))
    return render_template("auth.html", mode="register")


@app.route("/acceder")
def login():
    if g.user:
        return redirect(url_for("index"))
    return render_template("auth.html", mode="login")
    
@app.post("/recuperar-contrasena")
def recover_password():
    payload = request.get_json(silent=True) or {}

    email = (payload.get("email") or "").strip().lower()

    if not email:
        return {
            "success": False,
            "message": "Introduce tu correo electrónico."
        }, 400

    try:
        reset_link = generate_password_reset_link(email)

        send_password_reset_email(
            email,
            reset_link
        )

    except Exception:
        app.logger.exception(
            "Error enviando correo de recuperación para %s",
            email
        )

        return {
            "success": True,
            "message": (
                "Si existe una cuenta con ese correo, "
                "recibirás un mensaje para restablecer tu contraseña."
            )
        }

    return {
        "success": True,
        "message": (
            "Si existe una cuenta con ese correo, "
            "recibirás un mensaje para restablecer tu contraseña."
        )
    }

@app.post("/sesion")
def crear_sesion():
    payload = request.get_json(silent=True) or {}
    id_token = payload.get("idToken")
    if not id_token:
        abort(400, "Falta el token de Firebase.")
    try:
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception:
        abort(401, "No se pudo verificar la sesión de Firebase.")

    uid = decoded["uid"]
    email = (decoded.get("email") or "").strip().lower()
    name = decoded.get("name") or (email.split("@")[0] if email else "Miembro")

    connection = db()
    user = connection.execute("SELECT * FROM users WHERE firebase_uid = ?", (uid,)).fetchone()
    if user:
        user_id = user["id"]
        connection.execute("UPDATE users SET name = ?, email = ? WHERE id = ?", (name, email, user_id))
    else:
        try:
            cursor = connection.execute(
                "INSERT INTO users (firebase_uid, name, email) VALUES (?, ?, ?) RETURNING id",
                (uid, name, email),
            )
            user_id = cursor.fetchone()["id"]
        except (sqlite3.IntegrityError, psycopg.IntegrityError if psycopg else sqlite3.IntegrityError):
            user_id = connection.execute("SELECT id FROM users WHERE firebase_uid = ?", (uid,)).fetchone()["id"]

    session["user_id"] = user_id
    return {"ok": True}


@app.post("/salir")
def logout():
    session.clear()
    flash("Has cerrado sesión.", "info")
    return redirect(url_for("index"))


@app.post("/api/classes/<int:class_id>/book")
@login_required
def book_class(class_id):
    connection = db()

    connection.execute(
        "BEGIN" if connection.postgres else "BEGIN IMMEDIATE"
    )

    try:
        lock = " FOR UPDATE" if connection.postgres else ""

        fitness_class = connection.execute(
            "SELECT * FROM classes WHERE id = ?" + lock,
            (class_id,)
        ).fetchone()

        if not fitness_class:
            connection.execute("ROLLBACK")

            return {
                "success": False,
                "message": "La clase no existe."
            }, 404

        already_booked = connection.execute(
            """
            SELECT 1
            FROM bookings
            WHERE user_id = ? AND class_id = ?
            """,
            (g.user["id"], class_id)
        ).fetchone()

        if already_booked:
            connection.execute("ROLLBACK")

            return {
                "success": False,
                "message": "Ya tienes una reserva en esta clase."
            }, 409

        booked = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM bookings
            WHERE class_id = ?
            """,
            (class_id,)
        ).fetchone()["total"]

        if booked >= fitness_class["capacity"]:
            connection.execute("ROLLBACK")

            return {
                "success": False,
                "message": "Lo sentimos, esta clase está completa."
            }, 409

        connection.execute(
            """
            INSERT INTO bookings (user_id, class_id)
            VALUES (?, ?)
            """,
            (g.user["id"], class_id)
        )

        connection.execute("COMMIT")

        try:
            send_confirmation(g.user, fitness_class)
        except Exception:
            app.logger.exception(
                "La reserva se creó, pero el email no se pudo enviar."
            )

        return {
            "success": True,
            "message": "¡Plaza reservada correctamente!"
        }, 201

    except Exception:
        connection.execute("ROLLBACK")
        raise

@app.get("/api/classes")
def get_classes():
    classes = db().execute("""
        SELECT
            c.*,
            c.capacity - COUNT(b.id) AS places_left
        FROM classes c
        LEFT JOIN bookings b ON b.class_id = c.id
        GROUP BY c.id
        ORDER BY c.class_date, c.class_time
    """).fetchall()

    return [
        dict(class_item)
        for class_item in classes
    ]

@app.route("/mis-reservas")
@login_required
def dashboard():

    uid = g.user["firebase_uid"]

    firestore_db = firestore.client()

    bookings_ref = (
        firestore_db
        .collection("bookings")
        .where("userId", "==", uid)
    )

    booking_documents = bookings_ref.stream()

    bookings = []

    for booking_doc in booking_documents:

        booking_data = booking_doc.to_dict()

        class_id = booking_data.get("classId")

        if not class_id:
            continue

        class_doc = (
            firestore_db
            .collection("classes")
            .document(class_id)
            .get()
        )

        if not class_doc.exists:
            continue

        class_data = class_doc.to_dict()

        bookings.append({
            "booking_id": booking_doc.id,
            "classId": class_id,
            **class_data
        })

    bookings.sort(
        key=lambda booking: (
            booking.get("date", ""),
            booking.get("time", "")
        )
    )

    return render_template(
        "dashboard.html",
        bookings=bookings
    )
if __name__ == "__main__":
    app.run(debug=True)
