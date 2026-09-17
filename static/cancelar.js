import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";


const app =
    initializeApp(firebaseConfig);

const functions =
    getFunctions(app);

const cancelClass =
    httpsCallable(
        functions,
        "cancelClass"
    );


// ======================================================
// ELEMENTOS
// ======================================================

const form =
    document.getElementById(
        "cancel-form"
    );

const message =
    document.getElementById(
        "cancel-message"
    );

const submitButton =
    document.querySelector(
        ".cancel-submit"
    );


// ======================================================
// DATOS DE LA RESERVA
// ======================================================

const params =
    new URLSearchParams(
        window.location.search
    );

const classId =
    params.get("classId");

const entryNumber =
    params.get("entryNumber");

const email =
    params.get("email");


// ======================================================
// MENSAJES
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
        `cancel-message ${type}`;
}


// ======================================================
// ERRORES FIREBASE
// ======================================================

function getFirebaseErrorMessage(
    error
) {

    const code =
        error?.code || "";

    switch (code) {

        case "functions/not-found":

            return (
                "No se ha encontrado una reserva " +
                "activa con estos datos."
            );

        case "functions/invalid-argument":

            return (
                "Los datos de la reserva no son válidos."
            );

        case "functions/internal":

            return (
                "Ha ocurrido un error al cancelar " +
                "la reserva. Inténtalo de nuevo."
            );

        case "functions/unavailable":

            return (
                "El servicio no está disponible " +
                "temporalmente. Inténtalo de nuevo."
            );

        default:

            return (
                error?.message ||
                "No se ha podido cancelar la reserva."
            );
    }
}


// ======================================================
// COMPROBAR DATOS DEL ENLACE
// ======================================================

if (
    !classId ||
    entryNumber === null ||
    !email
) {

    showMessage(
        "El enlace de cancelación no es válido."
    );

    if (submitButton) {
        submitButton.disabled = true;
    }
}


// ======================================================
// CANCELAR RESERVA
// ======================================================

if (form) {

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            showMessage("");

            if (
                !classId ||
                entryNumber === null ||
                !email
            ) {

                showMessage(
                    "El enlace de cancelación no es válido."
                );

                return;
            }

            submitButton.disabled = true;

            const buttonText =
                submitButton.querySelector(
                    "span"
                );

            if (buttonText) {
                buttonText.textContent =
                    "Cancelando...";
            }

            try {

                const result =
                    await cancelClass({

                        classId,

                        entryNumber:
                            Number(entryNumber),

                        email:
                            email
                    });


                console.log(
                    "Reserva cancelada:",
                    result.data
                );


                // --------------------------------------
                // MOSTRAR ÉXITO
                // --------------------------------------

                const formContainer =
                    document.getElementById(
                        "cancel-form-container"
                    );

                const successContainer =
                    document.getElementById(
                        "cancel-success"
                    );


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
                    "Error al cancelar:",
                    error
                );

                showMessage(
                    getFirebaseErrorMessage(error),
                    "error"
                );

                submitButton.disabled = false;

                if (buttonText) {
                    buttonText.textContent =
                        "Cancelar reserva";
                }
            }
        }
    );
}