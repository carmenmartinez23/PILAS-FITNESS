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

const syncClassesFunction = httpsCallable(
functions,
"syncClassesFromSheets"
);

const classGrid = document.getElementById("class-grid");

/* =========================================================
HORARIOS
========================================================= */

const SCHEDULES = [
{
id: "10:30",
label: "10:30 — 11:10"
},
{
id: "11:10",
label: "11:10 — 11:50"
},
{
id: "11:50",
label: "11:50 — 12:30"
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
        const snapshot = await getDocs(
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

            const dateA = `${a.date} ${a.time}`;
            const dateB = `${b.date} ${b.time}`;

            return dateA.localeCompare(dateB);

        });


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
            "No existe el elemento #class-schedules."
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
            selectedSchedule === schedule.id
        ) {

            button.classList.add("selected");

        }


        button.innerHTML = `
            <span>
                ${schedule.label}
            </span>

            <small>
                ${classesForSchedule.length}
                ${
                    classesForSchedule.length === 1
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

            }
        );


        buttons.appendChild(button);

    });


    section.appendChild(buttons);


    /* -----------------------------------------------------
    Todavía no se ha elegido horario
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
    Mostrar clases del horario seleccionado
    ----------------------------------------------------- */

    const selectedClasses =
        getClassesForSchedule({
            id: selectedSchedule
        });


    renderClasses(selectedClasses);

}

/* =========================================================
OBTENER CLASES DEL HORARIO
========================================================= */

function getClassesForSchedule(schedule) {
    return allClasses.filter(classItem => {
    
        if (!classItem.time) {
            return false;
        }
    
    
        /*
         * En Google Sheets la hora puede aparecer como:
         *
         * 10:30
         * 10:30 - 11:10
         * 10:30-11:10
         *
         * Cogemos solamente la hora inicial.
         */
    
        const time =
            String(classItem.time)
                .trim()
                .replace(/\s/g, "")
                .split("-")[0];
    
    
        return time === schedule.id;
    
    });
}

/* =========================================================
MOSTRAR CLASES
========================================================= */

function renderClasses(classes) {
    classGrid.innerHTML = "";


    const selected =
        SCHEDULES.find(
            schedule =>
                schedule.id === selectedSchedule
        );


    /* -----------------------------------------------------
    Cabecera del horario
    ----------------------------------------------------- */

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
                ${selected ? selected.label : ""}
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


    /* -----------------------------------------------------
    No hay clases
    ----------------------------------------------------- */

    if (classes.length === 0) {

        const empty =
            document.createElement("div");

        empty.className =
            "schedule-empty";


        empty.innerHTML = `
            <p class="eyebrow">
                SIN CLASES
            </p>

            <h3>
                No hay clases en este horario.
            </h3>

            <p>
                Prueba seleccionando otra franja horaria.
            </p>
        `;


        classGrid.appendChild(empty);

        return;
    }


    /* -----------------------------------------------------
    Tarjetas
    ----------------------------------------------------- */

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


                ${
                    isFull
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
function formatDate(value) {
    if (!value) return "Fecha no disponible";

    const text = String(value).trim();

    let day, month, year;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        [year, month, day] = text.split("-");
    }

    // DD/MM/YYYY
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
        [day, month, year] = text.split("/");
    }

    else {
        const date = new Date(text);

        if (Number.isNaN(date.getTime())) {
            return "Fecha no disponible";
        }

        day = String(date.getDate()).padStart(2, "0");
        month = String(date.getMonth() + 1).padStart(2, "0");
        year = String(date.getFullYear());
    }

    const months = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre"
    ];

    return `${day} de ${months[Number(month) - 1]} de ${year}`;
}

/* =========================================================
INICIAR
========================================================= */

loadClasses();
