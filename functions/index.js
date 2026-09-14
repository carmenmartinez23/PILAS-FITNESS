const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const db = getFirestore();
const resendApiKey = defineSecret("RESEND_API_KEY");
async function sendResendEmail({ to, subject, html }) {

    const apiKey = resendApiKey.value();

    const response = await fetch(
        "https://api.resend.com/emails",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "FitFlow <cuentas@pilas-fitness.es>",
                to: [to],
                subject: subject,
                html: html
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


function formatSpanishDate(dateString) {

    const date =
        new Date(`${dateString}T00:00:00`);

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


function createBookingEmailHtml({
    name,
    classData,
    type
}) {

    const isCancellation =
        type === "cancelled";

    const formattedDate =
        formatSpanishDate(classData.date);

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
        ${isCancellation
            ? "Reserva cancelada"
            : "Reserva confirmada"
        } · FitFlow
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
    FITFLOW
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
    FITFLOW
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
async function sendBookingConfirmationEmail(user, classData) {

    const html =
        createBookingEmailHtml({
            name: user.name,
            classData: classData,
            type: "confirmed"
        });

    await sendResendEmail({
        to: user.email,
        subject: `Reserva confirmada · ${classData.title}`,
        html: html
    });
}


async function sendBookingCancellationEmail(user, classData) {

    const html =
        createBookingEmailHtml({
            name: user.name,
            classData: classData,
            type: "cancelled"
        });

    await sendResendEmail({
        to: user.email,
        subject: `Reserva cancelada · ${classData.title}`,
        html: html
    });
}
exports.reserveClass = onCall(
    { secrets: [resendApiKey] },
    async (request) => {

    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para reservar una clase."
        );
    }

    const userId = request.auth.uid;
    const { classId } = request.data;

    const authUser = await getAuth().getUser(userId);

    const user = {
        name:
            authUser.displayName ||
            authUser.email?.split("@")[0] ||
            "Miembro",
        email: authUser.email
    };
    if (!classId || typeof classId !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "No se ha indicado una clase válida."
        );
    }

    const classRef = db.collection("classes").doc(classId);
    let classDataForEmail = null;
    const bookingId = `${classId}_${userId}`;

    const bookingRef = db
        .collection("bookings")
        .doc(bookingId);

    try {

        await db.runTransaction(async (transaction) => {

            const classSnapshot =
                await transaction.get(classRef);

            const bookingSnapshot =
                await transaction.get(bookingRef);

            if (!classSnapshot.exists) {
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

            if (bookingSnapshot.exists) {
                throw new HttpsError(
                    "already-exists",
                    "Ya tienes reservada esta clase."
                );
            }

            const capacity =
                Number(classData.capacity || 0);

            const bookedCount =
                Number(classData.bookedCount || 0);

            if (bookedCount >= capacity) {
                throw new HttpsError(
                    "resource-exhausted",
                    "La clase está completa."
                );
            }

            transaction.set(bookingRef, {
                userId: userId,
                classId: classId,
                createdAt: FieldValue.serverTimestamp()
            });

            transaction.update(classRef, {
                bookedCount: bookedCount + 1
            });

        });
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
        return {
            success: true,
            message: "Reserva realizada correctamente.",
            bookingId: bookingId
        };

    } catch (error) {

        if (error instanceof HttpsError) {
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
});


exports.cancelClass = onCall(
    { secrets: [resendApiKey] },
    async (request) => {

    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para cancelar una reserva."
        );
    }

    const userId = request.auth.uid;
    const { classId } = request.data;

    if (!classId || typeof classId !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "No se ha indicado una clase válida."
        );
    }

    const classRef =
        db.collection("classes").doc(classId);

    const bookingId =
        `${classId}_${userId}`;

    const bookingRef =
        db.collection("bookings").doc(bookingId);

    try {

        await db.runTransaction(async (transaction) => {

            const bookingSnapshot =
                await transaction.get(bookingRef);

            const classSnapshot =
                await transaction.get(classRef);

            if (!bookingSnapshot.exists) {
                throw new HttpsError(
                    "not-found",
                    "No tienes una reserva para esta clase."
                );
            }

            if (!classSnapshot.exists) {
                throw new HttpsError(
                    "not-found",
                    "La clase no existe."
                );
            }

            const bookingData =
                bookingSnapshot.data();

            if (bookingData.userId !== userId) {
                throw new HttpsError(
                    "permission-denied",
                    "No puedes cancelar esta reserva."
                );
            }

            const classData =
                classSnapshot.data();

            const bookedCount =
                Number(classData.bookedCount || 0);

            transaction.delete(bookingRef);

            transaction.update(classRef, {
                bookedCount: Math.max(0, bookedCount - 1)
            });

        });

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

        return {
            success: true,
            message: "Reserva cancelada correctamente."
        };

    } catch (error) {

        if (error instanceof HttpsError) {
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
});
