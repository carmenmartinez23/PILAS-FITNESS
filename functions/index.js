const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

exports.reserveClass = onCall(async (request) => {

    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para reservar una clase."
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

    const classRef = db.collection("classes").doc(classId);
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


exports.cancelClass = onCall(async (request) => {

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
