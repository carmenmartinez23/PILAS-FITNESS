const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const admin = require("firebase-admin");

const {
    google
} = require("googleapis");

const {
    Resend
} = require("resend");

const {
    defineSecret
} = require("firebase-functions/params");


/* =========================================================
   FIREBASE
========================================================= */

admin.initializeApp();

const db =
    admin.firestore();


/* =========================================================
   SECRETS
========================================================= */

const resendApiKey =
    defineSecret("RESEND_API_KEY");

const googleServiceAccountJson =
    defineSecret("GOOGLE_SERVICE_ACCOUNT_JSON");


/* =========================================================
   GOOGLE SHEETS
========================================================= */

const SPREADSHEET_ID =
    "TU_SPREADSHEET_ID";

const CLASES_SHEET =
    "CLASES";

const RESERVAS_SHEET =
    "RESERVAS";

const CANCELACIONES_SHEET =
    "CANCELACIONES";

const CUENTAS_SHEET =
    "CUENTAS";


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


/* =========================================================
   ASEGURAR PESTAÑA CLASES
========================================================= */

async function asegurarPestanaClases(sheets) {

    const response =
        await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });

    const existe =
        response.data.sheets?.some(
            sheet =>
                sheet.properties?.title ===
                CLASES_SHEET
        );

    if (existe) {
        return;
    }

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
        range: `${CLASES_SHEET}!A1:K1`,
        valueInputOption: "USER_ENTERED",
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
                "activa",
                "TIPO"
            ]]
        }
    });
}


/* =========================================================
   LEER CLASES DESDE GOOGLE SHEETS
========================================================= */

async function obtenerClasesDesdeSheets() {

    const sheets =
        obtenerClienteSheets();

    await asegurarPestanaClases(sheets);

    const response =
        await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${CLASES_SHEET}!A:K`,
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

        /* -----------------------------------------
           CAPACIDAD
        ----------------------------------------- */

        const capacityRaw =
            String(row[6] ?? "").trim();

        let capacity = null;

        if (capacityRaw !== "") {

            const parsedCapacity =
                Number(capacityRaw);

            if (
                Number.isFinite(parsedCapacity) &&
                parsedCapacity > 0
            ) {
                capacity =
                    parsedCapacity;
            }
        }


        /* -----------------------------------------
           DESCRIPCIÓN
        ----------------------------------------- */

        const description =
            String(row[7] || "").trim();


        /* -----------------------------------------
           IMAGEN
        ----------------------------------------- */

        const imageUrl =
            String(row[8] || "").trim();


        /* -----------------------------------------
           ACTIVA
        ----------------------------------------- */

        const activaValue =
            String(row[9] ?? "")
                .trim()
                .toLowerCase();

        const activa =
            activaValue === "" ||
            activaValue === "true" ||
            activaValue === "sí" ||
            activaValue === "si" ||
            activaValue === "1";


        /* -----------------------------------------
           TIPO

           K = TIPO

           Valores admitidos:
           CLINICO
           CLÍNICO
           DEPORTIVO
           OTRO
        ----------------------------------------- */

        const tipoRaw =
            String(row[10] ?? "")
                .trim()
                .toUpperCase();

        let tipo = "OTRO";

        if (
            tipoRaw === "CLINICO" ||
            tipoRaw === "CLÍNICO"
        ) {
            tipo = "CLINICO";

        } else if (
            tipoRaw === "DEPORTIVO"
        ) {
            tipo = "DEPORTIVO";
        }


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

            activa,

            tipo

        });
    }

    return classes;
}


/* =========================================================
   SINCRONIZAR SHEETS → FIRESTORE
========================================================= */

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


    /* -----------------------------------------
       DESACTIVAR CLASES QUE YA NO EXISTEN
       EN SHEETS
    ----------------------------------------- */

    const firestoreSnapshot =
        await classesCollection.get();

    firestoreSnapshot.forEach(doc => {

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


    /* -----------------------------------------
       CREAR / ACTUALIZAR CLASES
    ----------------------------------------- */

    for (const classData of classes) {

        const classRef =
            classesCollection.doc(
                classData.id
            );

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

                tipo:
                    classData.tipo,

                bookedCount:
                    bookedCount

            },
            {
                merge: true
            }
        );
    }


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


/* =========================================================
   SINCRONIZACIÓN MANUAL
========================================================= */

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
                    count: classes.length
                };

            } catch (error) {

                console.error(
                    "Error sincronizando clases:",
                    error
                );

                throw new HttpsError(
                    "internal",
                    "No se han podido sincronizar las clases."
                );
            }
        }
    );


/* =========================================================
   SINCRONIZACIÓN AUTOMÁTICA CADA 5 MINUTOS
========================================================= */

exports.syncClassesAutomatically =
    onSchedule(
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
                    "Error en la sincronización automática:",
                    error
                );

                throw error;
            }
        }
    );


/* =========================================================
   RESERVAR CLASE
========================================================= */

exports.reserveClass =
    onCall(
        {
            secrets: [
                resendApiKey,
                googleServiceAccountJson
            ]
        },
        async request => {

            const data =
                request.data || {};


            /* -----------------------------------------
               DATOS
            ----------------------------------------- */

            const classId =
                String(
                    data.classId ?? ""
                ).trim();

            const name =
                String(
                    data.name ?? ""
                ).trim();

            const phone =
                String(
                    data.phone ?? ""
                ).trim();

            const email =
                String(
                    data.email ?? ""
                ).trim()
                .toLowerCase();

            const birthDate =
                String(
                    data.birthDate ?? ""
                ).trim();

            const entryNumber =
                Number(
                    data.entryNumber
                );


            /* -----------------------------------------
               VALIDACIONES
            ----------------------------------------- */

            if (!classId) {

                throw new HttpsError(
                    "invalid-argument",
                    "La clase indicada no es válida."
                );
            }


            if (
                name.length < 2
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un nombre válido."
                );
            }


            if (
                phone.length < 6
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un número de teléfono válido."
                );
            }


            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                !emailRegex.test(email)
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce un correo electrónico válido."
                );
            }


            if (!birthDate) {

                throw new HttpsError(
                    "invalid-argument",
                    "Introduce tu fecha de nacimiento."
                );
            }


            if (
                !Number.isInteger(entryNumber) ||
                entryNumber < 0 ||
                entryNumber > 1700
            ) {

                throw new HttpsError(
                    "invalid-argument",
                    "El número de entrada debe estar entre 0 y 1700."
                );
            }


            /* -----------------------------------------
               BUSCAR CLASE
            ----------------------------------------- */

            const classRef =
                db
                    .collection("classes")
                    .doc(classId);

            const classSnapshot =
                await classRef.get();

            if (
                !classSnapshot.exists
            ) {

                throw new HttpsError(
                    "not-found",
                    "Esta clase ya no está disponible."
                );
            }


            const classData =
                classSnapshot.data();


            if (
                classData.activa === false
            ) {

                throw new HttpsError(
                    "not-found",
                    "Esta clase ya no está disponible."
                );
            }


            /* -----------------------------------------
               CAPACIDAD
            ----------------------------------------- */

            const capacity =
                classData.capacity === null ||
                classData.capacity === undefined ||
                classData.capacity === ""
                    ? null
                    : Number(
                        classData.capacity
                    );


            /* -----------------------------------------
               RESERVAS EXISTENTES POR ENTRADA
            ----------------------------------------- */

            const entryBookingsSnapshot =
                await db
                    .collection("bookings")
                    .where(
                        "entryNumber",
                        "==",
                        entryNumber
                    )
                    .where(
                        "active",
                        "==",
                        true
                    )
                    .get();


            if (
                !entryBookingsSnapshot.empty
            ) {

                const firstBooking =
                    entryBookingsSnapshot
                        .docs[0]
                        .data();

                const existingEmail =
                    String(
                        firstBooking.email || ""
                    )
                    .trim()
                    .toLowerCase();

                if (
                    existingEmail &&
                    existingEmail !== email
                ) {

                    throw new HttpsError(
                        "already-exists",
                        "Este número de entrada ya está asociado a otro correo electrónico."
                    );
                }
            }


            /* -----------------------------------------
               RESERVAS EXISTENTES POR EMAIL
            ----------------------------------------- */

            const emailBookingsSnapshot =
                await db
                    .collection("bookings")
                    .where(
                        "email",
                        "==",
                        email
                    )
                    .where(
                        "active",
                        "==",
                        true
                    )
                    .get();


            if (
                !emailBookingsSnapshot.empty
            ) {

                const firstBooking =
                    emailBookingsSnapshot
                        .docs[0]
                        .data();

                const existingEntryNumber =
                    Number(
                        firstBooking.entryNumber
                    );

                if (
                    existingEntryNumber !==
                    entryNumber
                ) {

                    throw new HttpsError(
                        "already-exists",
                        "Este correo electrónico ya está asociado a otro número de entrada."
                    );
                }
            }


            /* -----------------------------------------
               MÁXIMO 3 RESERVAS
            ----------------------------------------- */

            if (
                emailBookingsSnapshot.size >= 3
            ) {

                throw new HttpsError(
                    "resource-exhausted",
                    "Ya tienes el máximo de 3 reservas activas."
                );
            }


            /* -----------------------------------------
               MISMA FECHA + MISMA HORA
            ----------------------------------------- */

            const sameSchedule =
                emailBookingsSnapshot.docs.some(
                    doc => {

                        const booking =
                            doc.data();

                        return (
                            booking.classDate ===
                                classData.date &&
                            booking.classTime ===
                                classData.time
                        );
                    }
                );


            if (
                sameSchedule
            ) {

                throw new HttpsError(
                    "already-exists",
                    "Ya tienes una reserva para otra actividad en ese mismo horario."
                );
            }


            /* -----------------------------------------
               CONTADOR
            ----------------------------------------- */

            const bookedCount =
                Number(
                    classData.bookedCount || 0
                );


            console.log(
                "DEBUG RESERVA",
                {
                    classId,
                    capacity,
                    bookedCount,
                    classTitle:
                        classData.title
                }
            );


            /* -----------------------------------------
               COMPROBAR CAPACIDAD
            ----------------------------------------- */

            if (
                capacity !== null &&
                capacity !== undefined &&
                Number.isFinite(capacity) &&
                bookedCount >= capacity
            ) {

                throw new HttpsError(
                    "resource-exhausted",
                    "Lo sentimos, la clase está completa."
                );
            }


            /* -----------------------------------------
               CREAR RESERVA
            ----------------------------------------- */

            const bookingRef =
                db
                    .collection("bookings")
                    .doc();


            await db.runTransaction(
                async transaction => {

                    const freshClass =
                        await transaction.get(
                            classRef
                        );

                    if (
                        !freshClass.exists
                    ) {

                        throw new HttpsError(
                            "not-found",
                            "Esta clase ya no está disponible."
                        );
                    }


                    const freshData =
                        freshClass.data();


                    if (
                        freshData.activa === false
                    ) {

                        throw new HttpsError(
                            "not-found",
                            "Esta clase ya no está disponible."
                        );
                    }


                    const freshCapacity =
                        freshData.capacity === null ||
                        freshData.capacity === undefined ||
                        freshData.capacity === ""
                            ? null
                            : Number(
                                freshData.capacity
                            );


                    const freshBookedCount =
                        Number(
                            freshData.bookedCount || 0
                        );


                    if (
                        freshCapacity !== null &&
                        freshCapacity !== undefined &&
                        Number.isFinite(
                            freshCapacity
                        ) &&
                        freshBookedCount >=
                            freshCapacity
                    ) {

                        throw new HttpsError(
                            "resource-exhausted",
                            "Lo sentimos, la clase está completa."
                        );
                    }


                    transaction.set(
                        bookingRef,
                        {

                            classId,

                            classTitle:
                                freshData.title,

                            classTrainer:
                                freshData.trainer || "",

                            classDate:
                                freshData.date || "",

                            classTime:
                                freshData.time || "",

                            name,

                            phone,

                            email,

                            birthDate,

                            entryNumber,

                            active: true,

                            createdAt:
                                admin.firestore
                                    .FieldValue
                                    .serverTimestamp()

                        }
                    );


                    transaction.update(
                        classRef,
                        {
                            bookedCount:
                                freshBookedCount + 1
                        }
                    );
                }
            );


            /* -----------------------------------------
               GOOGLE SHEETS
            ----------------------------------------- */

            try {

                const sheets =
                    obtenerClienteSheets();

                await sheets.spreadsheets.values.append({
                    spreadsheetId:
                        SPREADSHEET_ID,

                    range:
                        `${RESERVAS_SHEET}!A:K`,

                    valueInputOption:
                        "USER_ENTERED",

                    requestBody: {
                        values: [[

                            new Date()
                                .toLocaleString(
                                    "es-ES",
                                    {
                                        timeZone:
                                            "Europe/Madrid"
                                    }
                                ),

                            name,

                            phone,

                            email,

                            birthDate,

                            entryNumber,

                            classData.title,

                            classData.trainer || "",

                            classData.date || "",

                            classData.time || "",

                            classId

                        ]]
                    }
                });

            } catch (sheetError) {

                console.error(
                    "Error guardando reserva en Google Sheets:",
                    sheetError
                );
            }


            /* -----------------------------------------
               EMAIL
            ----------------------------------------- */

            try {

                const resend =
                    new Resend(
                        resendApiKey.value()
                    );

                await resend.emails.send({

                    from:
                        "REVITALÍZATE <cuentas@pilas-fitness.es>",

                    to: [email],

                    subject:
                        `Reserva confirmada · ${classData.title}`,

                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
                            <div style="background:#087542;padding:24px;text-align:center;">
                                <h1 style="color:white;margin:0;">
                                    REVITALÍZATE
                                </h1>
                            </div>

                            <div style="padding:30px;">
                                <h2>
                                    ¡Reserva confirmada!
                                </h2>

                                <p>
                                    Hola ${name},
                                </p>

                                <p>
                                    Tu plaza ha sido reservada correctamente.
                                </p>

                                <div style="background:#eef8f1;padding:20px;margin:20px 0;">
                                    <strong>${classData.title}</strong><br>
                                    ${classData.trainer || ""}<br>
                                    ${classData.date || ""}<br>
                                    ${classData.time || ""}
                                </div>

                                <p>
                                    <strong>Nº de entrada:</strong>
                                    ${entryNumber}
                                </p>

                                <p>
                                    Guarda este correo como confirmación de tu reserva.
                                </p>
                            </div>
                        </div>
                    `
                });

            } catch (emailError) {

                console.error(
                    "Error enviando email de reserva:",
                    emailError
                );
            }


            return {

                success: true,

                bookingId:
                    bookingRef.id,

                entryNumber

            };
        }
    );