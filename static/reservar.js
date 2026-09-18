import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";


// ======================================================
// FIREBASE
// ======================================================

const app = initializeApp(firebaseConfig);

const functions = getFunctions(app);

const reserveClass =
    httpsCallable(
        functions,
        "reserveClass"
    );


// ======================================================
// ELEMENTOS
// ======================================================

const form =
    document.getElementById(
        "reservation-form"
    );

const formContainer =
    document.getElementById(
        "reservation-form-container"
    );

const successContainer =
    document.getElementById(
        "reservation-success"
    );

const message =
    document.getElementById(
        "reservation-message"
    );

const submitButton =
    document.querySelector(
        ".reservation-submit"
    );

const successEntryNumber =
    document.getElementById(
        "success-entry-number"
    );


// ======================================================
// MOSTRAR MENSAJE
// ======================================================

function showMessage(
    text,
    type = "error"
) {
    if (!message) {
        return;
    }

    message.textContent =
        text;

    message.className =
        `reservation-message ${type}`;
}


// ======================================================
// MENSAJES DE FIREBASE
// ======================================================

function getFirebaseErrorMessage(error) {

    const code =
        error?.code || "";


    switch (code) {

        case "functions/invalid-argument":

            return (
                "Revisa los datos introducidos. Hay algún campo que no es válido."
            );


        case "functions/not-found":

            return (
                "Esta clase ya no está disponible."
            );


        case "functions/already-exists":

            return (
                error.message ||
                "El número de entrada o el correo electrónico ya está asociado a otra reserva."
            );


        case "functions/resource-exhausted":

            return (
                error.message ||
                "No se puede realizar la reserva en este momento."
            );


        case "functions/failed-precondition":

            return (
                error.message ||
                "No puedes realizar esta reserva en este momento."
            );


        case "functions/unavailable":

            return (
                "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos."
            );


        case "functions/internal":

            return (
                "Ha ocurrido un error al realizar la reserva. Inténtalo de nuevo."
            );


        default:

            return (
                error?.message ||
                "No se ha podido realizar la reserva. Inténtalo de nuevo."
            );
    }
}


// ======================================================
// OBTENER ID DE LA CLASE
// ======================================================
//
// Ahora los IDs son:
//
// a1
// a2
// a3
// b1
// b2
// ...
//
// Por tanto NO debemos convertirlos a Number.
//
// Primero intentamos utilizar
// window.RESERVATION_CLASS_ID.
//
// Si no existe o contiene NaN,
// intentamos obtenerlo de la URL:
//
// /reservar/a1
// ======================================================

function getReservationClassId() {

    let classId = "";


    // --------------------------------------
    // 1. ID proporcionado por la página
    // --------------------------------------

    if (
        typeof window.RESERVATION_CLASS_ID ===
            "string"
    ) {

        classId =
            window.RESERVATION_CLASS_ID.trim();

    } else if (
        window.RESERVATION_CLASS_ID !==
            undefined &&
        window.RESERVATION_CLASS_ID !==
            null &&
        !Number.isNaN(
            window.RESERVATION_CLASS_ID
        )
    ) {

        classId =
            String(
                window.RESERVATION_CLASS_ID
            ).trim();

    }


    // --------------------------------------
    // 2. Si no es válido, obtenerlo de URL
    // --------------------------------------

    if (
        !classId ||
        classId.toLowerCase() === "nan" ||
        classId.toLowerCase() === "undefined" ||
        classId.toLowerCase() === "null"
    ) {

        const pathParts =
            window.location.pathname
                .split("/")
                .filter(Boolean);


        /*
         * Esperamos:
         *
         * /reservar/a1
         */

        if (
            pathParts.length >= 2 &&
            pathParts[0] === "reservar"
        ) {

            try {

                classId =
                    decodeURIComponent(
                        pathParts[1]
                    ).trim();

            } catch (error) {

                console.error(
                    "No se pudo interpretar el ID de la clase desde la URL:",
                    error
                );

                classId = "";

            }
        }
    }


    // --------------------------------------
    // 3. Comprobar resultado
    // --------------------------------------

    if (
        !classId ||
        classId.toLowerCase() === "nan" ||
        classId.toLowerCase() === "undefined" ||
        classId.toLowerCase() === "null"
    ) {

        return null;
    }


    return classId;
}


// ======================================================
// ID DE LA CLASE
// ======================================================

const reservationClassId =
    getReservationClassId();


console.log(
    "ID de clase para la reserva:",
    reservationClassId
);


// ======================================================
// COMPROBAR FORMULARIO
// ======================================================

if (!form) {

    console.error(
        "No se encontró #reservation-form"
    );

} else {

    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            // ==========================================
            // LIMPIAR MENSAJE
            // ==========================================

            showMessage("");


            // ==========================================
            // OBTENER CAMPOS
            // ==========================================

            const nameInput =
                document.getElementById(
                    "name"
                );

            const phoneInput =
                document.getElementById(
                    "phone"
                );

            const emailInput =
                document.getElementById(
                    "email"
                );

            const birthDateInput =
                document.getElementById(
                    "birthDate"
                );

            const entryNumberInputElement =
                document.getElementById(
                    "entryNumber"
                );


            const name =
                nameInput?.value
                    ?.trim() || "";


            const phone =
                phoneInput?.value
                    ?.trim() || "";


            const email =
                emailInput?.value
                    ?.trim()
                    .toLowerCase() || "";


            const birthDate =
                birthDateInput?.value
                    ?.trim() || "";


            const entryNumberRaw =
                entryNumberInputElement?.value
                    ?.trim() || "";


            // ==========================================
            // COMPROBAR CAMPOS OBLIGATORIOS
            // ==========================================

            if (
                !name ||
                !phone ||
                !email ||
                !birthDate ||
                entryNumberRaw === ""
            ) {

                showMessage(
                    "Completa todos los campos antes de continuar."
                );

                return;
            }


            // ==========================================
            // NÚMERO DE ENTRADA
            // ==========================================

            const entryNumber =
                Number.parseInt(
                    entryNumberRaw,
                    10
                );


            /*
             * IMPORTANTE:
             *
             * 0 es válido para el cliente
             * de prueba.
             */

            if (
                Number.isNaN(entryNumber) ||
                !Number.isInteger(entryNumber) ||
                entryNumber < 0 ||
                entryNumber > 1700
            ) {

                showMessage(
                    "El número de entrada debe estar entre 0 y 1700."
                );

                return;
            }


            // ==========================================
            // COMPROBAR ID DE LA CLASE
            // ==========================================

            if (
                !reservationClassId
            ) {

                console.error(
                    "No se encontró un ID de clase válido."
                );

                showMessage(
                    "No se ha podido identificar la clase seleccionada."
                );

                return;
            }


            /*
             * Nunca permitimos enviar NaN.
             */

            if (
                String(
                    reservationClassId
                ).toLowerCase() === "nan"
            ) {

                console.error(
                    "El ID de la clase es NaN."
                );

                showMessage(
                    "La clase seleccionada no es válida."
                );

                return;
            }


            // ==========================================
            // DESACTIVAR BOTÓN
            // ==========================================

            submitButton.disabled = true;


            const submitSpan =
                submitButton.querySelector(
                    "span"
                );


            if (submitSpan) {

                submitSpan.textContent =
                    "Reservando...";

            } else {

                submitButton.textContent =
                    "Reservando...";

            }


            // ==========================================
            // DATOS QUE ENVIAMOS
            // ==========================================

            const reservationData = {

                classId:
                    String(
                        reservationClassId
                    ).trim(),

                name:
                    name,

                phone:
                    phone,

                email:
                    email,

                birthDate:
                    birthDate,

                entryNumber:
                    entryNumber
            };


            console.log(
                "Datos enviados a reserveClass:",
                reservationData
            );


            // ==========================================
            // RESERVAR
            // ==========================================

            try {

                const result =
                    await reserveClass(
                        reservationData
                    );


                const data =
                    result.data || {};


                // --------------------------------------
                // NÚMERO MOSTRADO EN ÉXITO
                // --------------------------------------

                if (successEntryNumber) {

                    successEntryNumber.textContent =
                        data.entryNumber ??
                        entryNumber;

                }


                // --------------------------------------
                // MOSTRAR ÉXITO
                // --------------------------------------

                if (formContainer) {
                    formContainer.hidden = true;
                }


                if (successContainer) {
                    successContainer.hidden = false;
                }


                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });


            } catch (error) {

                console.error(
                    "Error al reservar:",
                    error
                );


                showMessage(
                    getFirebaseErrorMessage(
                        error
                    ),
                    "error"
                );


                // --------------------------------------
                // REACTIVAR BOTÓN
                // --------------------------------------

                submitButton.disabled =
                    false;


                const submitSpan =
                    submitButton.querySelector(
                        "span"
                    );


                if (submitSpan) {

                    submitSpan.textContent =
                        "Reservar plaza";

                } else {

                    submitButton.textContent =
                        "Reservar plaza";

                }
            }
        }
    );
}
