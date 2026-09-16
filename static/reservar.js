import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
getFunctions,
httpsCallable
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

const reserveClass = httpsCallable(functions, "reserveClass");

const form = document.getElementById("reservation-form");
const formContainer = document.getElementById("reservation-form-container");
const successContainer = document.getElementById("reservation-success");

const message = document.getElementById("reservation-message");
const submitButton = document.querySelector(".reservation-submit");

const successEntryNumber = document.getElementById("success-entry-number");

function showMessage(text, type = "error") {

message.textContent = text;
message.className = `reservation-message ${type}`;

}

function getFirebaseErrorMessage(error) {
    const code = error?.code || "";

    switch (code) {

        case "functions/invalid-argument":
            return "Revisa los datos introducidos. Hay algún campo que no es válido.";

        case "functions/not-found":
            return "Esta clase ya no está disponible.";

        case "functions/already-exists":
            return error.message ||
                "El número de entrada o el correo electrónico ya está asociado a otra reserva.";

        case "functions/resource-exhausted":
            return "Esta clase está completa o has alcanzado el límite de reservas permitido.";

        case "functions/failed-precondition":
            return error.message ||
                "No puedes realizar esta reserva en este momento.";

        case "functions/unavailable":
            return "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos.";

        case "functions/internal":
            return "Ha ocurrido un error al realizar la reserva. Inténtalo de nuevo.";

        default:
            return error?.message ||
                "No se ha podido realizar la reserva. Inténtalo de nuevo.";
    }
}

form.addEventListener("submit", async (event) => {

    event.preventDefault();

    showMessage("");

    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const birthDate = document.getElementById("birthDate").value;
    const entryNumber = Number(
        document.getElementById("entryNumber").value
    );


    if (!name || !phone || !email || !birthDate || !entryNumber) {
        showMessage("Completa todos los campos antes de continuar.");
        return;
    }


    if (entryNumber <= 0 || entryNumber > 1700) {
        showMessage("El número de entrada debe estar entre 1 y 1700.");
        return;
    }


    submitButton.disabled = true;
    submitButton.querySelector("span").textContent = "Reservando...";


    try {

        const result = await reserveClass({
            classId: window.RESERVATION_CLASS_ID,
            name,
            phone,
            email,
            birthDate,
            entryNumber
        });


        const data = result.data || {};

        successEntryNumber.textContent =
            data.entryNumber || entryNumber;


        formContainer.hidden = true;
        successContainer.hidden = false;


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });


    } catch (error) {

        console.error("Error al reservar:", error);

        showMessage(
            getFirebaseErrorMessage(error),
            "error"
        );

        submitButton.disabled = false;
        submitButton.querySelector("span").textContent = "Reservar plaza";

    }

});
