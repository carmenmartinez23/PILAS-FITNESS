import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const functions = getFunctions(
    app,
    "us-central1"
);

const syncClassesFunction =
    httpsCallable(
        functions,
        "syncClassesFromSheets"
    );

const reserveClassFunction =
    httpsCallable(
        functions,
        "reserveClass"
    );

const classGrid =
    document.getElementById("class-grid");


/* =========================================================
   CARGAR CLASES
========================================================= */

async function loadClasses() {

    try {

        // -----------------------------------------
        // 1. Google Sheets → Firestore
        // -----------------------------------------

        await syncClassesFunction();


        // -----------------------------------------
        // 2. Leer clases desde Firestore
        // -----------------------------------------

        const snapshot =
            await getDocs(
                collection(db, "classes")
            );

        classGrid.innerHTML = "";

        const classes = [];


        snapshot.forEach(doc => {

            const data = doc.data();

            // Solo mostrar clases activas
            if (data.activa === false) {
                return;
            }

            classes.push({
                id: doc.id,
                ...data
            });

        });


        // -----------------------------------------
        // 3. Ordenar por fecha y hora
        // -----------------------------------------

        classes.sort((a, b) => {

            const dateA =
                `${a.date} ${a.time}`;

            const dateB =
                `${b.date} ${b.time}`;

            return dateA.localeCompare(dateB);

        });


        // -----------------------------------------
        // 4. No hay clases
        // -----------------------------------------

        if (classes.length === 0) {

            classGrid.innerHTML = `
                <p>
                    No hay clases disponibles actualmente.
                </p>
            `;

            return;
        }


        // -----------------------------------------
        // 5. Crear tarjetas
        // -----------------------------------------

        classes.forEach(classItem => {

            const placesLeft =
                Number(classItem.capacity || 0) -
                Number(classItem.bookedCount || 0);

            const isFull =
                placesLeft <= 0;


            const card =
                document.createElement("article");

            card.className =
                "class-card";


            card.innerHTML = `
                <img
                    src="${classItem.imageUrl || ""}"
                    alt="${classItem.title || "Clase"}"
                >

                <div class="card-body">

                    <div class="card-top">

                        <span>
                            ${classItem.duration || ""} MIN
                        </span>

                        <span
                            class="availability ${isFull ? "full" : ""}"
                        >
                            ${
                                isFull
                                    ? "Clase completa"
                                    : `${placesLeft} plazas`
                            }
                        </span>

                    </div>


                    <h3>
                        ${classItem.title || ""}
                    </h3>


                    <p>
                        ${classItem.trainer || ""}
                        ·
                        ${formatDate(classItem.date)}
                        ·
                        ${classItem.time || ""}
                    </p>


                    <p class="description">
                        ${classItem.description || ""}
                    </p>


                    <button
                        class="reserve"
                        data-class-id="${classItem.id}"
                        ${isFull ? "disabled" : ""}
                    >
                        ${
                            isFull
                                ? "Clase completa"
                                : 'Reservar plaza <b>→</b>'
                        }
                    </button>

                </div>
            `;


            classGrid.appendChild(card);

        });


        addReservationEvents();


    } catch (error) {

        console.error(
            "Error cargando las clases:",
            error
        );


        classGrid.innerHTML = `
            <p>
                No se han podido cargar las clases.
                Inténtalo de nuevo.
            </p>
        `;

    }

}


/* =========================================================
   FORMATEAR FECHA
========================================================= */

function formatDate(dateString) {

    if (!dateString) {
        return "";
    }

    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "es-ES",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );

}


/* =========================================================
   EVENTOS DE RESERVA
========================================================= */

function addReservationEvents() {

    const buttons =
        document.querySelectorAll(
            ".reserve"
        );


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const classId =
                    button.dataset.classId;

                reserveClass(classId);

            }
        );

    });

}


/* =========================================================
   RESERVAR CLASE
========================================================= */

function reserveClass(classId) {

    // Evitar crear varios formularios
    const existingModal =
        document.getElementById(
            "reservation-modal"
        );

    if (existingModal) {
        existingModal.remove();
    }


    // -----------------------------------------
    // Crear modal
    // -----------------------------------------

    const modal =
        document.createElement("div");

    modal.id =
        "reservation-modal";

    modal.innerHTML = `
        <div class="reservation-overlay">

            <div class="reservation-box">

                <button
                    type="button"
                    class="reservation-close"
                    id="close-reservation"
                    aria-label="Cerrar"
                >
                    ×
                </button>


                <div class="reservation-header">

                    <span class="eyebrow">
                        RESERVAR CLASE
                    </span>

                    <h2>
                        Completa tus datos
                    </h2>

                    <p>
                        Necesitamos estos datos para
                        registrar tu reserva.
                    </p>

                </div>


                <form id="reservation-form">

                    <div class="form-group">

                        <label for="reservation-name">
                            Nombre completo
                        </label>

                        <input
                            type="text"
                            id="reservation-name"
                            name="name"
                            placeholder="Tu nombre y apellidos"
                            autocomplete="name"
                            required
                        >

                    </div>


                    <div class="form-group">

                        <label for="reservation-phone">
                            Número de teléfono
                        </label>

                        <input
                            type="tel"
                            id="reservation-phone"
                            name="phone"
                            placeholder="Ej. 600 123 456"
                            autocomplete="tel"
                            required
                        >

                    </div>


                    <div class="form-group">

                        <label for="reservation-email">
                            Correo electrónico
                        </label>

                        <input
                            type="email"
                            id="reservation-email"
                            name="email"
                            placeholder="tuemail@ejemplo.com"
                            autocomplete="email"
                            required
                        >

                    </div>


                    <div class="form-group">

                        <label for="reservation-birthdate">
                            Fecha de nacimiento
                        </label>

                        <input
                            type="date"
                            id="reservation-birthdate"
                            name="birthDate"
                            required
                        >

                    </div>


                    <div class="form-group">

                        <label for="reservation-entry">
                            Número de entrada
                        </label>

                        <input
                            type="number"
                            id="reservation-entry"
                            name="entryNumber"
                            placeholder="Entre 1 y 1700"
                            min="1"
                            max="1700"
                            required
                        >

                        <small>
                            Tu número de entrada es personal
                            y está asociado a tu correo electrónico.
                        </small>

                    </div>


                    <div
                        class="reservation-error"
                        id="reservation-error"
                        hidden
                    ></div>


                    <button
                        type="submit"
                        class="primary reservation-submit"
                        id="reservation-submit"
                    >
                        Confirmar reserva →
                    </button>


                    <p class="reservation-legal">
                        Al reservar, confirmas que los datos
                        introducidos son correctos.
                    </p>

                </form>

            </div>

        </div>
    `;


    document.body.appendChild(modal);


    // -----------------------------------------
    // Referencias
    // -----------------------------------------

    const form =
        document.getElementById(
            "reservation-form"
        );

    const closeButton =
        document.getElementById(
            "close-reservation"
        );

    const errorBox =
        document.getElementById(
            "reservation-error"
        );

    const submitButton =
        document.getElementById(
            "reservation-submit"
        );


    // -----------------------------------------
    // Cerrar modal
    // -----------------------------------------

    closeButton.addEventListener(
        "click",
        () => {

            modal.remove();

        }
    );


    const overlay =
        modal.querySelector(
            ".reservation-overlay"
        );


    overlay.addEventListener(
        "click",
        event => {

            if (event.target === overlay) {
                modal.remove();
            }

        }
    );


    // -----------------------------------------
    // Enviar formulario
    // -----------------------------------------

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            errorBox.hidden = true;

            errorBox.textContent = "";


            const formData =
                new FormData(form);


            const name =
                formData
                    .get("name")
                    .trim();


            const phone =
                formData
                    .get("phone")
                    .trim();


            const email =
                formData
                    .get("email")
                    .trim()
                    .toLowerCase();


            const birthDate =
                formData
                    .get("birthDate");


            const entryNumber =
                Number(
                    formData
                        .get("entryNumber")
                );


            // -----------------------------------------
            // Validación básica
            // -----------------------------------------

            if (!name) {

                showReservationError(
                    "Introduce tu nombre completo."
                );

                return;
            }


            if (!phone) {

                showReservationError(
                    "Introduce tu número de teléfono."
                );

                return;
            }


            if (!email) {

                showReservationError(
                    "Introduce tu correo electrónico."
                );

                return;
            }


            if (!birthDate) {

                showReservationError(
                    "Introduce tu fecha de nacimiento."
                );

                return;
            }


            if (
                !Number.isInteger(entryNumber) ||
                entryNumber < 1 ||
                entryNumber > 1700
            ) {

                showReservationError(
                    "El número de entrada debe estar entre 1 y 1700."
                );

                return;
            }


            // -----------------------------------------
            // Estado de envío
            // -----------------------------------------

            submitButton.disabled = true;

            submitButton.textContent =
                "Reservando…";


            try {

                const result =
                    await reserveClassFunction({

                        classId: classId,

                        name: name,

                        phone: phone,

                        email: email,

                        birthDate: birthDate,

                        entryNumber: entryNumber

                    });


                console.log(
                    "Reserva realizada:",
                    result.data
                );


                // -----------------------------------------
                // Reserva correcta
                // -----------------------------------------

                modal.remove();


                alert(
                    "¡Reserva realizada correctamente! " +
                    "Te hemos enviado un correo de confirmación."
                );


                await loadClasses();


            } catch (error) {

                console.error(
                    "Error realizando la reserva:",
                    error
                );


                let message =
                    "No se ha podido realizar la reserva.";


                switch (error.code) {

                    case "functions/already-exists":

                        message =
                            "El número de entrada ya está asociado a otro correo electrónico o ya tienes una reserva incompatible.";

                        break;


                    case "functions/resource-exhausted":

                        message =
                            "Has alcanzado el máximo de 3 reservas activas o la clase está completa.";

                        break;


                    case "functions/not-found":

                        message =
                            "La clase ya no existe.";

                        break;


                    case "functions/invalid-argument":

                        message =
                            "Revisa los datos introducidos.";

                        break;


                    case "functions/failed-precondition":

                        message =
                            "Esta clase ya no está disponible.";

                        break;


                    default:

                        if (
                            error.message &&
                            error.message.includes(
                                "already"
                            )
                        ) {

                            message =
                                "Ya existe una reserva incompatible con estos datos.";

                        }

                        break;

                }


                showReservationError(message);


                submitButton.disabled = false;

                submitButton.textContent =
                    "Confirmar reserva →";

            }

        }
    );


    // -----------------------------------------
    // Mostrar errores
    // -----------------------------------------

    function showReservationError(message) {

        errorBox.textContent =
            message;

        errorBox.hidden =
            false;

    }

}


/* =========================================================
   CARGA INICIAL
========================================================= */

loadClasses();
