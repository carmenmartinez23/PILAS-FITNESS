const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { google } = require("googleapis");

initializeApp();

const db = getFirestore();

// ======================================================
// SECRETS
// ======================================================

const resendApiKey = defineSecret("RESEND_API_KEY");

const googleServiceAccountJson =
    defineSecret("GOOGLE_SERVICE_ACCOUNT_JSON");

// ======================================================
// GOOGLE SHEETS
// ======================================================

const SPREADSHEET_ID =
    "1Nl_LtlQX-nVc4yUd0yd-HsQwceFXTe9CrUPdsKx449s";

const CLASES_SHEET = "CLASES";
const RESERVAS_SHEET = "RESERVAS";
const CANCELACIONES_SHEET = "CANCELACIONES";

// ======================================================
// GOOGLE SHEETS - CONEXIÓN
// ======================================================

function obtenerClienteSheets() {
    const credentials =
        JSON.parse(
            googleServiceAccountJson.value()
        );

    const auth =
        new google.auth.GoogleAuth({
            credentials,
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets"
            ]
        });

    return google.sheets({
        version: "v4",
        auth
    });
}

// ======================================================
// CREAR PESTAÑA CLASES SI NO EXISTE
// ======================================================

async function asegurarPestanaClases(sheets) {
    const spreadsheet =
        await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
            fields: "sheets.properties"
        });

    const existeClases =
        spreadsheet.data.sheets?.some(
            sheet =>
                sheet.properties?.title === CLASES_SHEET
        );

    if (existeClases) {
        return;
    }

    console.log(
        "La pestaña CLASES no existe. Creándola..."
    );

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [
                {
                    addSheet: {
                        properties: {
                            title: CLASES_SHEET
                        }
                    }
                }
            ]
        }
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CLASES_SHEET}!A1:J1`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[
                "id",
                "title",
                "trainer",
                "date",
                "time",
                "duration",
                "capacity",
                "description",
                "imageUrl",
                "activa"
            ]]
        }
    });

    console.log(
        "Pestaña CLASES creada correctamente."
    );
}

// ======================================================
// OBTENER CLASES DESDE GOOGLE SHEETS
// ======================================================

async function obtenerClasesDesdeSheets() {
    const sheets =
        obtenerClienteSheets();

    await asegurarPestanaClases(sheets);

    const response =
        await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${CLASES_SHEET}!A:J`,
            valueRenderOption: "FORMATTED_VALUE"
        });

    const rows =
        response.data.values || [];

    if (rows.length <= 1) {
        return [];
    }

    const classes = [];

    for (
        let i = 1;
        i < rows.length;
        i++
    ) {
        const row =
            rows[i] || [];

        const id =
            String(row[0] || "").trim();

        if (!id) {
            continue;
        }

        const title =
            String(row[1] || "").trim();

        const trainer =
            String(row[2] || "").trim();

        const date =
            String(row[3] || "").trim();

        const time =
            String(row[4] || "").trim();

        const duration =
            Number(row[5] || 0);

        const capacityRaw =
            String(row[6] ?? "").trim();

        let capacity = null;

        if (capacityRaw !== "") {
            const parsedCapacity = Number(capacityRaw);

            if (
                Number.isFinite(parsedCapacity) &&
                parsedCapacity > 0
            ) {
                capacity = parsedCapacity;
            }
        }

        const description =
            String(row[7] || "").trim();

        const imageUrl =
            String(row[8] || "").trim();

        const activaValue =
            String(row[9] ?? "")
                .trim()
                .toLowerCase();

        /*
         * Si la celda está vacía, la consideramos activa.
         *
         * También aceptamos:
         * TRUE
         * true
         * sí
         * si
         * 1
         */

        const activa =
            activaValue === "" ||
            activaValue === "true" ||
            activaValue === "sí" ||
            activaValue === "si" ||
            activaValue === "1";

        classes.push({
            id,
            title,
            trainer,
            date,
            time,
            duration,
            capacity,
            description,
            imageUrl,
            activa
        });
    }

    return classes;
}

// ======================================================
// SINCRONIZAR GOOGLE SHEETS → FIRESTORE
// ======================================================

async function sincronizarClasesConFirestore() {
    const classes =
        await obtenerClasesDesdeSheets();

    const classesCollection =
        db.collection("classes");

    const batch =
        db.batch();

    const sheetClassIds =
        new Set(
            classes.map(
                classData =>
                    classData.id
            )
        );

    // ==================================================
    // CLASES DE FIRESTORE QUE YA NO ESTÁN EN SHEETS
    // ==================================================

    const firestoreSnapshot =
        await classesCollection.get();

    firestoreSnapshot.forEach(doc => {

        /*
         * No borramos la clase.
         * Simplemente la desactivamos.
         */

        if (
            !sheetClassIds.has(doc.id)
        ) {
            batch.set(
                doc.ref,
                {
                    activa: false
                },
                {
                    merge: true
                }
            );
        }
    });

    // ==================================================
    // ACTUALIZAR / CREAR CLASES DE SHEETS
    // ==================================================

    for (
        const classData of classes
    ) {
        const classRef =
            classesCollection.doc(
                classData.id
            );

        /*
         * Recuperamos la clase actual para conservar
         * bookedCount.
         */

        const existing =
            await classRef.get();

        const existingData =
            existing.exists
                ? existing.data()
                : {};

        const bookedCount =
            Number(
                existingData.bookedCount || 0
            );

        batch.set(
            classRef,
            {
                title:
                    classData.title,

                trainer:
                    classData.trainer,

                date:
                    classData.date,

                time:
                    classData.time,

                duration:
                    classData.duration,

                capacity:
                    classData.capacity,

                description:
                    classData.description,

                imageUrl:
                    classData.imageUrl,

                activa:
                    classData.activa,

                bookedCount:
                    bookedCount
            },
            {
                merge: true
            }
        );
    }

    // ==================================================
    // GUARDAR CAMBIOS
    // ==================================================

    if (
        classes.length > 0 ||
        firestoreSnapshot.size > 0
    ) {
        await batch.commit();
    }

    console.log(
        `Clases sincronizadas desde Google Sheets: ${classes.length}`
    );

    return classes;
}

// ======================================================
// CLOUD FUNCTION - SINCRONIZAR CLASES
// ======================================================

exports.syncClassesFromSheets = onCall(
        {
            secrets: [
                googleServiceAccountJson
            ]
        },
        async () => {

            try {

                const classes =
                    await sincronizarClasesConFirestore();

                return {
                    success: true,
                    classesCount:
                        classes.length
                };

            } catch (error) {

                console.error(
                    "Error sincronizando clases desde Google Sheets:",
                    error
                );

                throw new HttpsError(
                    "internal",
                    "No se han podido sincronizar las clases."
                );
            }
        }
    );

// ======================================================
// SINCRONIZACIÓN AUTOMÁTICA GOOGLE SHEETS → FIRESTORE
// ======================================================

exports.syncClassesAutomatically = onSchedule(
    {
        schedule: "every 5 minutes",
        timeZone: "Europe/Madrid",
        secrets: [
            googleServiceAccountJson
        ]
    },
    async () => {
        try {
            const classes =
                await sincronizarClasesConFirestore();

            console.log(
                `Sincronización automática completada: ${classes.length} clases.`
            );
        } catch (error) {
            console.error(
                "Error en la sincronización automática de clases:",
                error
            );

            throw error;
        }
    }
);

// ======================================================
// REGISTRAR RESERVA EN GOOGLE SHEETS
// ======================================================

async function registrarReservaEnSheets(
    booking,
    fitnessClass
) {

    try {

        const sheets =
            obtenerClienteSheets();

        await sheets.spreadsheets.values.append({
            spreadsheetId:
                SPREADSHEET_ID,

            range:
                `${RESERVAS_SHEET}!A:J`,

            valueInputOption:
                "USER_ENTERED",

            requestBody: {
                values: [[

                    new Date()
                        .toLocaleString("es-ES"),

                    booking.entryNumber,

                    booking.name,

                    booking.phone,

                    booking.email,

                    booking.birthDate,

                    fitnessClass.title,

                    fitnessClass.trainer,

                    fitnessClass.date,

                    fitnessClass.time

                ]]
            }
        });

        console.log(
            `Reserva registrada en Google Sheets: ${booking.entryNumber} - ${booking.email} - ${fitnessClass.title}`
        );

    } catch (error) {

        console.error(
            "No se pudo registrar la reserva en Google Sheets:",
            error
        );
    }
}

// ======================================================
// REGISTRAR CANCELACIÓN EN GOOGLE SHEETS
// ======================================================

async function registrarCancelacionEnSheets(
    booking,
    fitnessClass
) {

    try {

        const sheets =
            obtenerClienteSheets();

        await sheets.spreadsheets.values.append({
            spreadsheetId:
                SPREADSHEET_ID,

            range:
                `${CANCELACIONES_SHEET}!A:J`,

            valueInputOption:
                "USER_ENTERED",

            requestBody: {
                values: [[

                    new Date()
                        .toLocaleString("es-ES"),

                    booking.entryNumber,

                    booking.name,

                    booking.phone,

                    booking.email,

                    booking.birthDate,

                    fitnessClass.title,

                    fitnessClass.trainer,

                    fitnessClass.date,

                    fitnessClass.time

                ]]
            }
        });

        console.log(
            `Cancelación registrada en Google Sheets: ${booking.entryNumber} - ${booking.email} - ${fitnessClass.title}`
        );

    } catch (error) {

        console.error(
            "No se pudo registrar la cancelación en Google Sheets:",
            error
        );
    }
}

// ======================================================
// RESEND - ENVIAR EMAIL
// ======================================================

async function sendResendEmail({
    to,
    subject,
    html
}) {

    const apiKey =
        resendApiKey.value();

    const response =
        await fetch(
            "https://api.resend.com/emails",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${apiKey}`,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        from:
                            "REVITALÍZATE <cuentas@pilas-fitness.es>",

                        to: [to],

                        subject:
                            subject,

                        html:
                            html
                    })
            }
        );

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `Resend error ${response.status}: ${errorText}`
        );
    }

    return response.json();
}

// ======================================================
// FORMATEAR FECHA
// ======================================================

function formatSpanishDate(
    dateString
) {

    const date =
        new Date(
            `${dateString}T00:00:00`
        );

    return date.toLocaleDateString(
        "es-ES",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}

// ======================================================
// HTML DE LOS EMAILS
// ======================================================

function createBookingEmailHtml({
    name,
    classData,
    type,
    classId,
    entryNumber,
    email
}) {

    const isCancellation =
        type === "cancelled";

    const cancellationUrl =
        `https://pilas-fitness.onrender.com/cancelar` +
        `?classId=${encodeURIComponent(classId)}` +
        `&entryNumber=${encodeURIComponent(entryNumber)}` +
        `&email=${encodeURIComponent(email)}`;

    const formattedDate =
        formatSpanishDate(
            classData.date
        );

    const eyebrow =
        isCancellation
            ? "RESERVA CANCELADA"
            : "RESERVA CONFIRMADA";

    const title =
        isCancellation
            ? "Tu reserva ha<br>quedado cancelada"
            : "¡Tu plaza está<br>reservada!";

    const message =
        isCancellation
            ? `Hola ${name}, tu reserva para esta clase ha sido cancelada correctamente.`
            : `Hola ${name}, tu reserva se ha realizado correctamente. ¡Te esperamos en clase!`;

    const footerMessage =
        isCancellation
            ? "La plaza queda disponible nuevamente para otro usuario."
            : "Si finalmente no puedes asistir, recuerda cancelar tu reserva desde tu área de miembro.";

    return `

<!doctype html>

<html lang="es">

<head>

    <meta charset="utf-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>
        ${
            isCancellation
                ? "Reserva cancelada"
                : "Reserva confirmada"
        } · REVITALÍZATE
    </title>

</head>

<body style="
    margin:0;
    padding:0;
    background:#eef8f1;
    font-family:Arial, Helvetica, sans-serif;
    color:#083b2a;
">

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        background:#eef8f1;
        padding:45px 15px;
    "
>

<tr>

<td align="center">

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

<td style="
    padding-left:12px;
    color:#ffffff;
    font-size:16px;
    font-weight:800;
    letter-spacing:3px;
">
    REVITALÍZATE
</td>

</tr>

</table>

</td>

</tr>

<!-- CONTENIDO -->

<tr>

<td style="
    padding:48px 42px 42px;
">

<p style="
    margin:0 0 14px;
    color:#39705a;
    font-size:11px;
    font-weight:700;
    letter-spacing:2.5px;
    text-transform:uppercase;
">

    ${eyebrow}

</p>

<h1 style="
    margin:0 0 22px;
    color:#083b2a;
    font-size:34px;
    line-height:1.12;
    font-weight:800;
    letter-spacing:-1.2px;
">

    ${title}

</h1>

<p style="
    margin:0 0 28px;
    color:#39705a;
    font-size:15px;
    line-height:1.7;
">

    ${message}

</p>

<!-- DATOS DE LA CLASE -->

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="margin-bottom:28px;"
>

<tr>

<td style="
    background:#eef8f1;
    border-left:4px solid #8fdb4d;
    border-radius:8px;
    padding:18px;
">

<p style="
    margin:0 0 8px;
    color:#39705a;
    font-size:10px;
    font-weight:700;
    letter-spacing:1.5px;
    text-transform:uppercase;
">

    CLASE

</p>

<p style="
    margin:0 0 14px;
    color:#083b2a;
    font-size:20px;
    font-weight:800;
">

    ${classData.title}

</p>

<p style="
    margin:0 0 6px;
    color:#39705a;
    font-size:13px;
">

    📅 ${formattedDate}

</p>

<p style="
    margin:0 0 6px;
    color:#39705a;
    font-size:13px;
">

    🕐 ${classData.time}

</p>

<p style="
    margin:0;
    color:#39705a;
    font-size:13px;
">

    👤 ${classData.trainer}

</p>

</td>

</tr>

</table>

<p style="
    margin:0 0 22px;
    color:#6c8b7b;
    font-size:12px;
    line-height:1.6;
    text-align:center;
">

    ${footerMessage}

</p>

${
    !isCancellation
        ? `
<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="margin-top:10px;"
>

<tr>

<td align="center">

<a
    href="${cancellationUrl}"
    style="
        display:inline-block;
        background:#083b2a;
        color:#ffffff;
        text-decoration:none;
        font-size:13px;
        font-weight:800;
        letter-spacing:1px;
        padding:15px 26px;
        border-radius:10px;
    "
>
    CANCELAR MI RESERVA
</a>

</td>

</tr>

</table>
<p>
`
        : ""
}    margin:0;
    color:#6c8b7b;
    font-size:12px;
    line-height:1.6;
    text-align:center;
">

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

    REVITALÍZATE

</p>

<p style="
    margin:0;
    color:#6c8b7b;
    font-size:10px;
">

    Mueve el cuerpo. Cambia el día.

</p>

</td>

</tr>

</table>

<p style="
    margin:20px 10px 0;
    color:#7b9688;
    font-size:10px;
    text-align:center;
">

    Este correo se ha enviado automáticamente.

</p>

</td>

</tr>

</table>

</body>

</html>

`;
}

// ======================================================
// EMAIL DE CONFIRMACIÓN
// ======================================================

async function sendBookingConfirmationEmail(
    user,
    classData
) {

    const html =
        createBookingEmailHtml({
            name:
                user.name,

            classData:
                classData,

            type:
                "confirmed",

            classId:
                user.classId,

            entryNumber:
                user.entryNumber,

            email:
                user.email
        });

    await sendResendEmail({

        to:
            user.email,

        subject:
            `Reserva confirmada · ${classData.title}`,

        html:
            html
    });
}

// ======================================================
// EMAIL DE CANCELACIÓN
// ======================================================

async function sendBookingCancellationEmail(
    user,
    classData
) {

    const html =
        createBookingEmailHtml({
            name:
                user.name,

            classData:
                classData,

            type:
                "cancelled"
        });

    await sendResendEmail({

        to:
            user.email,

        subject:
            `Reserva cancelada · ${classData.title}`,

        html:
            html
    });
}

// ======================================================
// RESERVAR CLASE
// ======================================================

exports.reserveClass =
    onCall(
        {
            secrets: [
                resendApiKey,
                googleServiceAccountJson
            ]
        },

        async (request) => {

            const {
                classId,
                name,
                phone,
                email,
                birthDate,
                entryNumber
            } = request.data || {};

            // -----------------------------------------
            // 1. VALIDAR CLASS ID
            // -----------------------------------------

            if (
                classId === undefined ||
                classId === null ||
                String(classId).trim() === ""
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "La clase seleccionada no es válida."
                );
            }

            const normalizedClassId =
                String(classId).trim();

            // -----------------------------------------
            // 2. VALIDAR NOMBRE
            // -----------------------------------------

            if (
                !name ||
                typeof name !== "string" ||
                name.trim().length < 2
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un nombre válido."
                );
            }

            // -----------------------------------------
            // 3. VALIDAR TELÉFONO
            // -----------------------------------------

            if (
                !phone ||
                typeof phone !== "string" ||
                phone.trim().length < 6
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un número de teléfono válido."
                );
            }

            // -----------------------------------------
            // 4. VALIDAR EMAIL
            // -----------------------------------------

            if (
                !email ||
                typeof email !== "string"
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un correo electrónico válido."
                );
            }

            const normalizedEmail =
                email.trim().toLowerCase();

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                !emailRegex.test(
                    normalizedEmail
                )
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un correo electrónico válido."
                );
            }

            // -----------------------------------------
            // 5. VALIDAR FECHA DE NACIMIENTO
            // -----------------------------------------

            if (
                !birthDate ||
                typeof birthDate !== "string"
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce tu fecha de nacimiento."
                );
            }

            const parsedBirthDate =
                new Date(
                    `${birthDate}T00:00:00`
                );

            if (
                Number.isNaN(
                    parsedBirthDate.getTime()
                )
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "La fecha de nacimiento no es válida."
                );
            }

            // -----------------------------------------
            // 6. VALIDAR NÚMERO DE ENTRADA
            // -----------------------------------------

            if (
                entryNumber === undefined ||
                entryNumber === null ||
                String(entryNumber).trim() === ""
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Debes indicar tu número de entrada."
                );
            }

            const normalizedEntryNumber =
                String(entryNumber).trim();

            const entryNumberValue =
                Number(
                    normalizedEntryNumber
                );

            /*
             * 0 = cliente de prueba
             * 1-1700 = clientes reales
             */

            if (
                !Number.isInteger(
                    entryNumberValue
                ) ||
                entryNumberValue < 0 ||
                entryNumberValue > 1700
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "El número de entrada debe estar entre 0 y 1700."
                );
            }

            const normalizedPhone =
                phone.trim();

            const normalizedName =
                name.trim();

            // -----------------------------------------
            // 7. OBTENER CLASE
            // -----------------------------------------

            const classRef =
                db
                    .collection("classes")
                    .doc(normalizedClassId);

            const classSnapshot =
                await classRef.get();

            if (!classSnapshot.exists) {

                throw new HttpsError(
                    "not-found",
                    "La clase no existe."
                );
            }

            const classData =
                classSnapshot.data();

            if (
                classData.activa === false
            ) {

                throw new HttpsError(
                    "failed-precondition",
                    "Esta clase ya no está disponible."
                );
            }

            // -----------------------------------------
            // 8. COMPROBAR CAPACIDAD
            // -----------------------------------------

            const capacity =
                classData.capacity === null ||
                classData.capacity === undefined ||
                classData.capacity === ""
                    ? null
                    : Number(classData.capacity);

            // -----------------------------------------
            // 9. BUSCAR RESERVAS DEL NÚMERO
            // -----------------------------------------

            const bookingsSnapshot =
                await db
                    .collection("bookings")
                    .where(
                        "entryNumber",
                        "==",
                        entryNumberValue
                    )
                    .where(
                        "status",
                        "==",
                        "active"
                    )
                    .get();

            // -----------------------------------------
            // 10. COMPROBAR EMAIL DEL NÚMERO
            // -----------------------------------------

            if (
                bookingsSnapshot.size > 0
            ) {

                const firstBooking =
                    bookingsSnapshot.docs[0]
                        .data();

                if (
                    firstBooking.email !==
                    normalizedEmail
                ) {

                    throw new HttpsError(
                        "already-exists",
                        "Este número de entrada ya está asociado a otro correo electrónico."
                    );
                }
            }

            // -----------------------------------------
            // 11. BUSCAR RESERVAS DEL EMAIL
            // -----------------------------------------

            const emailBookingsSnapshot =
                await db
                    .collection("bookings")
                    .where(
                        "email",
                        "==",
                        normalizedEmail
                    )
                    .where(
                        "status",
                        "==",
                        "active"
                    )
                    .get();

            // -----------------------------------------
            // 12. COMPROBAR QUE EL EMAIL NO USA
            //     OTRO NÚMERO DE ENTRADA
            // -----------------------------------------

            if (
                emailBookingsSnapshot.size > 0
            ) {

                const firstEmailBooking =
                    emailBookingsSnapshot.docs[0]
                        .data();

                if (
                    Number(
                        firstEmailBooking.entryNumber
                    ) !==
                    entryNumberValue
                ) {

                    throw new HttpsError(
                        "already-exists",
                        "Este correo electrónico ya está asociado a otro número de entrada."
                    );
                }
            }

            // -----------------------------------------
            // 13. MÁXIMO 3 RESERVAS ACTIVAS
            // -----------------------------------------

            if (
                emailBookingsSnapshot.size >= 3
            ) {

                throw new HttpsError(
                    "resource-exhausted",
                    "Ya tienes el máximo de 3 reservas activas."
                );
            }

            // -----------------------------------------
            // 14. COMPROBAR MISMO HORARIO
            // -----------------------------------------

            const sameSchedule =
                emailBookingsSnapshot.docs
                    .some(doc => {

                        const booking =
                            doc.data();

                        return (
                            booking.classDate ===
                                classData.date &&

                            booking.classTime ===
                                classData.time
                        );
                    });

            if (sameSchedule) {

                throw new HttpsError(
                    "already-exists",
                    "Ya tienes una reserva en este horario."
                );
            }

            // -----------------------------------------
            // 15. COMPROBAR PLAZAS ACTUALES
            // -----------------------------------------

            const placesSnapshot =
                await classRef.get();

            const currentClassData =
                placesSnapshot.data();

            const bookedCount =
                Number(
                    currentClassData.bookedCount || 0
                );
            console.log("DEBUG RESERVA", {
                classId: normalizedClassId,
                capacity,
                bookedCount,
                classTitle: classData.title
            });
            if (
                capacity !== null &&
                capacity !== undefined &&
                bookedCount >= capacity
            ) {
                throw new HttpsError(
                    "resource-exhausted",
                    "Lo sentimos, la clase está completa."
                );
            }


            // -----------------------------------------
            // 16. CREAR RESERVA
            // -----------------------------------------

            const bookingId =
                crypto.randomUUID();

            const bookingRef =
                db
                    .collection("bookings")
                    .doc(bookingId);

            const booking = {

                bookingId,

                normalizedClassId,

                entryNumber:
                    entryNumberValue,

                name:
                    normalizedName,

                phone:
                    normalizedPhone,

                email:
                    normalizedEmail,

                birthDate,

                classDate:
                    classData.date,

                classTime:
                    classData.time,

                status:
                    "active",

                createdAt:
                    FieldValue.serverTimestamp()
            };

            // -----------------------------------------
            // 17. TRANSACCIÓN
            // -----------------------------------------

            await db.runTransaction(
                async transaction => {

                    const classTransactionSnapshot =
                        await transaction.get(
                            classRef
                        );

                    if (
                        !classTransactionSnapshot.exists
                    ) {

                        throw new HttpsError(
                            "not-found",
                            "La clase no existe."
                        );
                    }

                    const transactionClassData =
                        classTransactionSnapshot.data();

                    if (
                        transactionClassData.activa === false
                    ) {

                        throw new HttpsError(
                            "failed-precondition",
                            "Esta clase ya no está disponible."
                        );
                    }

                    const transactionCapacity =
                        transactionClassData.capacity === null ||
                        transactionClassData.capacity === undefined ||
                        transactionClassData.capacity === ""
                            ? null
                            : Number(
                                transactionClassData.capacity
                            );

                    const transactionBookedCount =
                        Number(
                            transactionClassData.bookedCount || 0
                        );

                    /*
                    * Si capacity es null significa:
                    *
                    * - capacidad vacía
                    * - PARA LOS ALLÍ PRESENTES
                    * - sin límite de plazas
                    *
                    * En esos casos no comprobamos si está llena.
                    */

                    if (
                        transactionCapacity !== null &&
                        transactionBookedCount >= transactionCapacity
                    ) {
                        throw new HttpsError(
                            "resource-exhausted",
                            "Lo sentimos, la clase está completa."
                        );
                    }

                    transaction.set(
                        bookingRef,
                        booking
                    );

                    transaction.update(
                        classRef,
                        {
                            bookedCount:
                                transactionBookedCount + 1
                        }
                    );
                }
            );

            // -----------------------------------------
            // 18. GOOGLE SHEETS
            // -----------------------------------------

            await registrarReservaEnSheets(
                booking,
                classData
            );

            // -----------------------------------------
            // 19. EMAIL
            // -----------------------------------------

            try {

                await sendBookingConfirmationEmail(
                    {
                        name:
                            normalizedName,

                        email:
                            normalizedEmail,

                        entryNumber:
                            entryNumberValue,

                        bookingId,

                        classId:
                            normalizedClassId
                    },
                    classData
                );

            } catch (error) {

                console.error(
                    "La reserva se creó correctamente, pero no se pudo enviar el email:",
                    error
                );
            }

            // -----------------------------------------
            // 20. RESPUESTA
            // -----------------------------------------

            return {

                success:
                    true,

                message:
                    "Reserva realizada correctamente.",

                bookingId,

                entryNumber:
                    entryNumberValue
            };
        }
    );

// ======================================================
// CANCELAR RESERVA
// ======================================================

exports.cancelClass =
    onCall(
        {
            secrets: [
                resendApiKey,
                googleServiceAccountJson
            ]
        },

        async (request) => {

            const {
                classId,
                entryNumber,
                email
            } = request.data || {};

            // ------------------------------------------
            // 1. VALIDAR CLASS ID
            // ------------------------------------------

            if (
                classId === undefined ||
                classId === null ||
                String(classId).trim() === ""
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "La clase seleccionada no es válida."
                );
            }

            const normalizedClassId =
                String(classId).trim();

            // ------------------------------------------
            // 2. VALIDAR NÚMERO DE ENTRADA
            // ------------------------------------------

            if (
                entryNumber === undefined ||
                entryNumber === null ||
                String(entryNumber).trim() === ""
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Debes indicar tu número de entrada."
                );
            }

            const entryNumberValue =
                Number(entryNumber);

            /*
             * 0 = cliente de prueba
             * 1-1700 = clientes reales
             */

            if (
                !Number.isInteger(
                    entryNumberValue
                ) ||
                entryNumberValue < 0 ||
                entryNumberValue > 1700
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "El número de entrada debe estar entre 0 y 1700."
                );
            }

            // ------------------------------------------
            // 3. VALIDAR EMAIL
            // ------------------------------------------

            if (
                !email ||
                typeof email !== "string"
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Debes indicar tu correo electrónico."
                );
            }

            const normalizedEmail =
                email
                    .trim()
                    .toLowerCase();

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                !emailRegex.test(
                    normalizedEmail
                )
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "El correo electrónico no es válido."
                );
            }

            // ------------------------------------------
            // 4. REFERENCIA A LA CLASE
            // ------------------------------------------

            const classRef =
                db
                    .collection("classes")
                    .doc(normalizedClassId);

            // ------------------------------------------
            // 5. BUSCAR RESERVA
            // ------------------------------------------

            const bookingsSnapshot =
                await db
                    .collection("bookings")
                    .where(
                        "normalizedClassId",
                        "==",
                        normalizedClassId
                    )
                    .where(
                        "entryNumber",
                        "==",
                        entryNumberValue
                    )
                    .where(
                        "email",
                        "==",
                        normalizedEmail
                    )
                    .where(
                        "status",
                        "==",
                        "active"
                    )
                    .limit(1)
                    .get();

            if (
                bookingsSnapshot.empty
            ) {

                throw new HttpsError(
                    "not-found",
                    "No se ha encontrado una reserva con esos datos."
                );
            }

            const bookingDoc =
                bookingsSnapshot.docs[0];

            const bookingRef =
                bookingDoc.ref;

            const bookingData =
                bookingDoc.data();

            let classDataForEmail =
                null;

            // ------------------------------------------
            // 6. CANCELAR EN TRANSACCIÓN
            // ------------------------------------------

            try {

                await db.runTransaction(
                    async transaction => {

                        const bookingSnapshot =
                            await transaction.get(
                                bookingRef
                            );

                        const classSnapshot =
                            await transaction.get(
                                classRef
                            );

                        if (
                            !bookingSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "La reserva ya no existe."
                            );
                        }

                        if (
                            !classSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "La clase ya no existe."
                            );
                        }

                        const currentBooking =
                            bookingSnapshot.data();

                        if (
                            currentBooking.status !==
                            "active"
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "Esta reserva ya ha sido cancelada."
                            );
                        }

                        const classData =
                            classSnapshot.data();

                        classDataForEmail = {
                            ...classData
                        };

                        const bookedCount =
                            Number(
                                classData.bookedCount || 0
                            );

                        // ----------------------------------
                        // MARCAR RESERVA COMO CANCELADA
                        // ----------------------------------

                        transaction.update(
                            bookingRef,
                            {
                                status:
                                    "cancelled",

                                cancelledAt:
                                    FieldValue.serverTimestamp()
                            }
                        );

                        // ----------------------------------
                        // LIBERAR PLAZA
                        // ----------------------------------

                        transaction.update(
                            classRef,
                            {
                                bookedCount:
                                    Math.max(
                                        0,
                                        bookedCount - 1
                                    )
                            }
                        );
                    }
                );

                // --------------------------------------
                // 7. GOOGLE SHEETS
                // --------------------------------------

                const bookingForSheets = {
                    ...bookingData,

                    status:
                        "cancelled"
                };

                await registrarCancelacionEnSheets(
                    bookingForSheets,
                    classDataForEmail
                );

                // --------------------------------------
                // 8. EMAIL
                // --------------------------------------

                try {

                    await sendBookingCancellationEmail(
                        bookingData,
                        classDataForEmail
                    );

                } catch (error) {

                    console.error(
                        "La reserva se canceló correctamente, pero no se pudo enviar el email:",
                        error
                    );
                }

                // --------------------------------------
                // 9. RESPUESTA
                // --------------------------------------

                return {

                    success:
                        true,

                    message:
                        "Reserva cancelada correctamente."
                };

            } catch (error) {

                if (
                    error instanceof HttpsError
                ) {
                    throw error;
                }

                console.error(
                    "Error cancelando reserva:",
                    error
                );

                throw new HttpsError(
                    "internal",
                    "No se ha podido cancelar la reserva."
                );
            }
        }
    );
