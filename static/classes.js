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

const classGrid =
    document.getElementById("class-grid");

/* =========================================================
HORARIOS DISPONIBLES
========================================================= */

const SCHEDULES = [
    {
        id: "10:30-11:10",
        label: "10:30 — 11:10",
        start: "10:30"
    },
    {
        id: "11:10-11:50",
        label: "11:10 — 11:50",
        start: "11:10"
    },
    {
        id: "11:50-12:30",
        label: "11:50 — 12:30",
        start: "11:50"
    }
];

let allClasses = [];

let selectedSchedule = null;

/* =========================================================
CARGAR CLASES
========================================================= */

async function loadClasses() {

    try {

        // Google Sheets → Firestore
        await syncClassesFunction();


        // Leer clases desde Firestore
        const snapshot =
            await getDocs(
                collection(db, "classes")
            );


        allClasses = [];


        snapshot.forEach(doc => {

            const data = doc.data();


            // Solo mostrar clases activas
            if (data.activa === false) {
                return;
            }


            allClasses.push({
                id: doc.id,
                ...data
            });

        });


        // Ordenar por fecha y hora
        allClasses.sort((a, b) => {

            const dateA =
                `${a.date} ${a.time}`;

            const dateB =
                `${b.date} ${b.time}`;

            return dateA.localeCompare(dateB);

        });


        // Mostrar selector de horarios
        renderSchedules();


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
SELECTOR DE HORARIOS
========================================================= */

function renderSchedules() {

    const section =
        document.getElementById("class-schedules");


    if (!section) {

        console.error(
            "No existe #class-schedules en el HTML."
        );

        return;
    }


    section.innerHTML = "";


    const heading =
        document.createElement("div");

    heading.className =
        "schedule-heading";

    heading.innerHTML = `
        <p class="eyebrow">
            ELIGE TU HORARIO
        </p>

        <h3>
            ¿Cuándo quieres entrenar?
        </h3>
    `;


    section.appendChild(heading);


    const buttons =
        document.createElement("div");

    buttons.className =
        "schedule-buttons";


    SCHEDULES.forEach(schedule => {

        const classesForSchedule =
            getClassesForSchedule(schedule);


        const button =
            document.createElement("button");


        button.type = "button";

        button.className =
            "schedule-button";


        if (
            selectedSchedule ===
            schedule.id
        ) {

            button.classList.add("selected");

        }


        button.innerHTML = `
            <span>
                ${schedule.label}
            </span>

            <small>
                ${classesForSchedule.length
            }
                ${classesForSchedule.length === 1
                ? "clase"
                : "clases"
            }
            </small>

            <b>→</b>
        `;


        button.addEventListener(
            "click",
            () => {

                selectedSchedule =
                    schedule.id;

                renderSchedules();

                renderClasses(
                    classesForSchedule
                );

            }
        );


        buttons.appendChild(button);

    });


    section.appendChild(buttons);


    // Si no hay horario seleccionado,
    // no mostramos todavía ninguna clase.
    if (selectedSchedule === null) {

        classGrid.innerHTML = `
            <div class="schedule-placeholder">
                <p>
                    Selecciona un horario para ver
                    las clases disponibles.
                </p>
            </div>
        `;

        return;
    }


    const selected =
        SCHEDULES.find(
            schedule =>
                schedule.id === selectedSchedule
        );


    if (selected) {

        renderClasses(
            getClassesForSchedule(selected)
        );

    }

}

/* =========================================================
OBTENER CLASES DE UN HORARIO
========================================================= */

function getClassesForSchedule(schedule) {

    return allClasses.filter(classItem => {

        const classTime =
            normalizeTime(classItem.time);


        return classTime === schedule.start;

    });
    ```

}

/* =========================================================
NORMALIZAR HORA
========================================================= */

function normalizeTime(time) {

```
    if (!time) {
        return "";
    }


    return String(time)
        .trim()
        .replace(/\s/g, "")
        .split("-")[0]
        .trim();
    ```

}

/* =========================================================
MOSTRAR CLASES
========================================================= */

function renderClasses(classes) {

```
    classGrid.innerHTML = "";


    if (classes.length === 0) {

        classGrid.innerHTML = `
        <div class="schedule-empty">

            <p class="eyebrow">
                SIN CLASES
            </p>

            <h3>
                No hay clases en este horario.
            </h3>

            <p>
                Prueba seleccionando otra franja horaria.
            </p>

        </div>
    `;

        return;

    }


    // Título del horario seleccionado
    const selected =
        SCHEDULES.find(
            schedule =>
                schedule.id === selectedSchedule
        );


    const heading =
        document.createElement("div");

    heading.className =
        "selected-schedule-heading";


    heading.innerHTML = `
    <div>
        <p class="eyebrow">
            HORARIO SELECCIONADO
        </p>

        <h2>
            ${selected.label}
        </h2>
    </div>

    <button
        type="button"
        class="change-schedule"
        id="change-schedule"
    >
        Cambiar horario
    </button>
`;


    classGrid.appendChild(heading);


    document
        .getElementById("change-schedule")
        .addEventListener(
            "click",
            () => {

                selectedSchedule = null;

                renderSchedules();

            }
        );


    // Contenedor de tarjetas
    const cards =
        document.createElement("div");

    cards.className =
        "class-grid-inner";


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
                    ${isFull
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


            ${isFull
                ? `
                        <button
                            class="reserve"
                            disabled
                        >
                            Clase completa
                        </button>
                    `
                : `
                        <a
                            class="reserve"
                            href="/reservar/${encodeURIComponent(classItem.id)}"
                        >
                            Reservar plaza <b>→</b>
                        </a>
                    `
            }

        </div>
    `;

        cards.appendChild(card);

    });

    classGrid.appendChild(cards);

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
INICIAR
========================================================= */

loadClasses();
