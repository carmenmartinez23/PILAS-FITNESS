const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

exports.reserveClass = onCall(async (request) => {

    // ==========================================
    // 1. COMPROBAR QUE EL USUARIO ESTÁ LOGUEADO
    // ==========================================

    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para reservar una clase."
        );
    }

    const userId = request.auth.uid;
    const { classId } = request.data;

    // ==========================================
    // 2. COMPROBAR EL ID DE LA CLASE
    // ==========================================

    if (!classId || typeof classId !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "No se ha indicado una clase válida."
        );
    }

    const classRef = db.collection("classes").doc(classId);

    // Usamos un ID determinista:
    // una persona solo puede tener una reserva
    // para una clase concreta.
    const bookingId = `${classId}_${userId}`;

    const bookingRef = db
        .collection("bookings")
        .doc(bookingId);

    // ==========================================
    // 3. TRANSACCIÓN
    // ==========================================

    try {

        await db.runTransaction(async (transaction) => {

            // Primero LEEMOS los documentos.
            // Firestore exige que las lecturas de una
            // transacción se hagan antes de las escrituras.

            const classSnapshot =
                await transaction.get(classRef);

            const bookingSnapshot =
                await transaction.get(bookingRef);

            // ======================================
            // LA CLASE NO EXISTE
            // ======================================

            if (!classSnapshot.exists) {
                throw new HttpsError(
                    "not-found",
                    "La clase no existe."
                );
            }

            const classData = classSnapshot.data();

            // ======================================
            // YA ESTÁ RESERVADA
            // ======================================

            if (bookingSnapshot.exists) {
                throw new HttpsError(
                    "already-exists",
                    "Ya tienes reservada esta clase."
                );
            }

            // ======================================
            // COMPROBAR PLAZAS
            // ======================================

            const capacity = Number(classData.capacity || 0);
            const bookedCount = Number(classData.bookedCount || 0);

            if (bookedCount >= capacity) {
                throw new HttpsError(
                    "resource-exhausted",
                    "La clase está completa."
                );
            }

            // ======================================
            // CREAR LA RESERVA
            // ======================================

            transaction.set(bookingRef, {
                userId: userId,
                classId: classId,
                createdAt: FieldValue.serverTimestamp()
            });

            // ======================================
            // AUMENTAR LAS PLAZAS OCUPADAS
            // ======================================

            transaction.update(classRef, {
                bookedCount: bookedCount + 1
            });
        });

        // ==========================================
        // RESERVA CORRECTA
        // ==========================================

        return {
            success: true,
            message: "Reserva realizada correctamente.",
            bookingId: bookingId
        };

    } catch (error) {

        // Si es un error que nosotros mismos hemos
        // generado, lo devolvemos al navegador.

        if (error instanceof HttpsError) {
            throw error;
        }

        console.error("Error realizando reserva:", error);

        throw new HttpsError(
            "internal",
            "No se ha podido realizar la reserva."
        );
    }
});