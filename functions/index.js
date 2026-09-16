const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { google } = require("googleapis");

initializeApp();

const db = getFirestore();


// ======================================================
// SECRETS
// ======================================================

const resendApiKey =
    defineSecret("RESEND_API_KEY");

const googleServiceAccountJson =
    defineSecret("GOOGLE_SERVICE_ACCOUNT_JSON");


// ======================================================
// GOOGLE SHEETS
// ======================================================

const SPREADSHEET_ID =
    "1Nl_LtlQX-nVc4yUd0yd-HsQwceFXTe9CrUPdsKx449s";

const CLASES_SHEET =
    "CLASES";

const RESERVAS_SHEET =
    "RESERVAS";

const CANCELACIONES_SHEET =
    "CANCELACIONES";


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
                sheet.properties?.title ===
                CLASES_SHEET
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

    // Crear CLASES automáticamente si no existe
    await asegurarPestanaClases(
        sheets
    );

    const response =
        await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${CLASES_SHEET}!A:J`,
            valueRenderOption: "FORMATTED_VALUE"
        });

    const rows =
        response.data.values || [];

    // Si solo existe la cabecera
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

        // Ignorar filas sin ID
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

        const capacity =
            Number(row[6] || 0);

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

    /*
     * IDs que existen actualmente en CLASES.
     */
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
         * NO borramos la clase.
         *
         * Simplemente la desactivamos.
         *
         * Esto evita romper reservas históricas.
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

                /*
                 * Las reservas las controla Firebase.
                 * No vienen desde Google Sheets.
                 */

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

exports.syncClassesFromSheets =
    onCall(
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
// REGISTRAR RESERVA EN GOOGLE SHEETS
// ======================================================

async function registrarReservaEnSheets(
    user,
    fitnessClass
) {

    try {

        const sheets =
            obtenerClienteSheets();

        await sheets.spreadsheets.values.append({

            spreadsheetId:
                SPREADSHEET_ID,

            range:
                `${RESERVAS_SHEET}!A:F`,

            valueInputOption:
                "USER_ENTERED",

            requestBody: {

                values: [[

                    new Date()
                        .toLocaleString("es-ES"),

                    user.name,

                    user.email,

                    fitnessClass.title,

                    fitnessClass.trainer,

                    `${fitnessClass.date} ${fitnessClass.time}`

                ]]
            }
        });

        console.log(
            `Reserva registrada en Google Sheets: ${user.email} - ${fitnessClass.title}`
        );

    } catch (error) {

        /*
         * Un fallo de Google Sheets NO cancela
         * una reserva que ya se ha realizado.
         */

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
    user,
    fitnessClass
) {

    try {

        const sheets =
            obtenerClienteSheets();

        await sheets.spreadsheets.values.append({

            spreadsheetId:
                SPREADSHEET_ID,

            range:
                `${CANCELACIONES_SHEET}!A:F`,

            valueInputOption:
                "USER_ENTERED",

            requestBody: {

                values: [[

                    new Date()
                        .toLocaleString("es-ES"),

                    user.name,

                    user.email,

                    fitnessClass.title,

                    fitnessClass.trainer,

                    `${fitnessClass.date} ${fitnessClass.time}`

                ]]
            }
        });

        console.log(
            `Cancelación registrada en Google Sheets: ${user.email} - ${fitnessClass.title}`
        );

    } catch (error) {

        /*
         * Un fallo de Google Sheets NO cancela
         * una cancelación que ya se ha realizado.
         */

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
    type
}) {

    const isCancellation =
        type === "cancelled";


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
    margin:0;
    color:#6c8b7b;
    font-size:12px;
    line-height:1.6;
    text-align:center;
">
    ${footerMessage}
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
                "confirmed"

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

            // ------------------------------------------
            // AUTENTICACIÓN
            // ------------------------------------------

            if (!request.auth) {

                throw new HttpsError(
                    "unauthenticated",
                    "Debes iniciar sesión para reservar una clase."
                );
            }


            const userId =
                request.auth.uid;


            const {
                classId
            } = request.data;


            // ------------------------------------------
            // USUARIO
            // ------------------------------------------

            const authUser =
                await getAuth()
                    .getUser(userId);


            const user = {

                name:
                    authUser.displayName ||
                    authUser.email?.split("@")[0] ||
                    "Miembro",

                email:
                    authUser.email

            };


            // ------------------------------------------
            // VALIDAR ID
            // ------------------------------------------

            if (
                !classId ||
                typeof classId !== "string"
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "No se ha indicado una clase válida."
                );
            }


            // ------------------------------------------
            // REFERENCIAS
            // ------------------------------------------

            const classRef =
                db
                    .collection("classes")
                    .doc(classId);


            const bookingId =
                `${classId}_${userId}`;


            const bookingRef =
                db
                    .collection("bookings")
                    .doc(bookingId);


            let classDataForEmail =
                null;


            try {

                // --------------------------------------
                // TRANSACCIÓN
                // --------------------------------------

                await db.runTransaction(
                    async (transaction) => {

                        const classSnapshot =
                            await transaction.get(
                                classRef
                            );


                        const bookingSnapshot =
                            await transaction.get(
                                bookingRef
                            );


                        // --------------------------------
                        // CLASE NO EXISTE
                        // --------------------------------

                        if (
                            !classSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "La clase no existe."
                            );
                        }


                        const classData =
                            classSnapshot.data();


                        classDataForEmail = {
                            ...classData
                        };


                        // --------------------------------
                        // CLASE INACTIVA
                        // --------------------------------

                        if (
                            classData.activa === false
                        ) {

                            throw new HttpsError(
                                "failed-precondition",
                                "La clase no está disponible."
                            );
                        }


                        // --------------------------------
                        // RESERVA DUPLICADA
                        // --------------------------------

                        if (
                            bookingSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "already-exists",
                                "Ya tienes reservada esta clase."
                            );
                        }


                        // --------------------------------
                        // CAPACIDAD
                        // --------------------------------

                        const capacity =
                            Number(
                                classData.capacity || 0
                            );


                        const bookedCount =
                            Number(
                                classData.bookedCount || 0
                            );


                        if (
                            bookedCount >= capacity
                        ) {

                            throw new HttpsError(
                                "resource-exhausted",
                                "La clase está completa."
                            );
                        }


                        // --------------------------------
                        // CREAR BOOKING
                        // --------------------------------

                        transaction.set(
                            bookingRef,
                            {

                                userId:
                                    userId,

                                classId:
                                    classId,

                                createdAt:
                                    FieldValue.serverTimestamp()

                            }
                        );


                        // --------------------------------
                        // ACTUALIZAR PLAZAS
                        // --------------------------------

                        transaction.update(
                            classRef,
                            {

                                bookedCount:
                                    bookedCount + 1

                            }
                        );

                    }
                );


                // --------------------------------------
                // EMAIL
                // --------------------------------------

                try {

                    await sendBookingConfirmationEmail(
                        user,
                        classDataForEmail
                    );

                } catch (error) {

                    console.error(
                        "La reserva se creó correctamente, pero no se pudo enviar el email:",
                        error
                    );
                }


                // --------------------------------------
                // GOOGLE SHEETS
                // --------------------------------------

                await registrarReservaEnSheets(
                    user,
                    classDataForEmail
                );


                return {

                    success:
                        true,

                    message:
                        "Reserva realizada correctamente.",

                    bookingId:
                        bookingId

                };


            } catch (error) {

                if (
                    error instanceof HttpsError
                ) {

                    throw error;
                }


                console.error(
                    "Error realizando reserva:",
                    error
                );


                throw new HttpsError(
                    "internal",
                    "No se ha podido realizar la reserva."
                );
            }
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

            // ------------------------------------------
            // AUTENTICACIÓN
            // ------------------------------------------

            if (!request.auth) {

                throw new HttpsError(
                    "unauthenticated",
                    "Debes iniciar sesión para cancelar una reserva."
                );
            }


            const userId =
                request.auth.uid;


            const {
                classId
            } = request.data;


            // ------------------------------------------
            // USUARIO
            // ------------------------------------------

            const authUser =
                await getAuth()
                    .getUser(userId);


            const user = {

                name:
                    authUser.displayName ||
                    authUser.email?.split("@")[0] ||
                    "Miembro",

                email:
                    authUser.email

            };


            // ------------------------------------------
            // VALIDAR ID
            // ------------------------------------------

            if (
                !classId ||
                typeof classId !== "string"
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "No se ha indicado una clase válida."
                );
            }


            // ------------------------------------------
            // REFERENCIAS
            // ------------------------------------------

            const classRef =
                db
                    .collection("classes")
                    .doc(classId);


            const bookingId =
                `${classId}_${userId}`;


            const bookingRef =
                db
                    .collection("bookings")
                    .doc(bookingId);


            let classDataForEmail =
                null;


            try {

                // --------------------------------------
                // TRANSACCIÓN
                // --------------------------------------

                await db.runTransaction(
                    async (transaction) => {

                        const bookingSnapshot =
                            await transaction.get(
                                bookingRef
                            );


                        const classSnapshot =
                            await transaction.get(
                                classRef
                            );


                        // --------------------------------
                        // RESERVA NO EXISTE
                        // --------------------------------

                        if (
                            !bookingSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "No tienes una reserva para esta clase."
                            );
                        }


                        // --------------------------------
                        // CLASE NO EXISTE
                        // --------------------------------

                        if (
                            !classSnapshot.exists
                        ) {

                            throw new HttpsError(
                                "not-found",
                                "La clase no existe."
                            );
                        }


                        const bookingData =
                            bookingSnapshot.data();


                        // --------------------------------
                        // COMPROBAR PROPIETARIO
                        // --------------------------------

                        if (
                            bookingData.userId !== userId
                        ) {

                            throw new HttpsError(
                                "permission-denied",
                                "No puedes cancelar esta reserva."
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


                        // --------------------------------
                        // BORRAR BOOKING
                        // --------------------------------

                        transaction.delete(
                            bookingRef
                        );


                        // --------------------------------
                        // LIBERAR PLAZA
                        // --------------------------------

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
                // EMAIL
                // --------------------------------------

                try {

                    await sendBookingCancellationEmail(
                        user,
                        classDataForEmail
                    );

                } catch (error) {

                    console.error(
                        "La reserva se canceló correctamente, pero no se pudo enviar el email:",
                        error
                    );
                }


                // --------------------------------------
                // GOOGLE SHEETS
                // --------------------------------------

                await registrarCancelacionEnSheets(
                    user,
                    classDataForEmail
                );


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
