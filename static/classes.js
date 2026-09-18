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


/* =========================================================
   FIREBASE
   ========================================================= */

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


/* =========================================================
   ELEMENTOS
   ========================================================= */

const classGrid =
    document.getElementById("class-grid");


/* =========================================================
   HORARIOS PRINCIPALES
   =========================================================
   
   Estos son los horarios que quieres mostrar
   como principales.

   Cualquier otro horario que aparezca en Google Sheets
   se mostrará automáticamente en "OTROS HORARIOS".
   ========================================================= */

const MAIN_SCHEDULES = [
    {
        id: "10:30-11:10",
        label: "10:30-11:10"
    },
    {
        id: "11:30-12:10",
        label: "11:30-12:10"
    },
    {
        id: "12:30-13:10",
        label: "12:30-13:10"
    }
];


/* =========================================================
   VARIABLES
   ========================================================= */

let allClasses = [];

let selectedSchedule = null;


/* =========================================================
   CARGAR CLASES
   ========================================================= */

async function loadClasses() {

    try {

        /*
         * Google Sheets es la fuente principal.
         * Primero sincronizamos y después leemos Firestore.
         */

        await syncClassesFunction();


        const snapshot = await getDocs(
            collection(db, "classes")
        );


        allClasses = [];


        snapshot.forEach(doc => {

            const data = doc.data();


            /*
             * No mostramos clases desactivadas.
             */

            if (data.activa === false) {
                return;
            }


            allClasses.push({
                id: doc.id,
                ...data
            });

        });


        /*
         * Ordenamos primero por fecha
         * y después por hora.
         */

        allClasses.sort((a, b) => {

            const dateA =
                `${a.date || ""} ${normalizeTime(a.time)}`;

            const dateB =
                `${b.date || ""} ${normalizeTime(b.time)}`;

            return dateA.localeCompare(dateB);

        });


        renderSchedules();


    } catch (error) {

        console.error(
            "Error cargando las clases:",
            error
        );


        if (classGrid) {

            classGrid.innerHTML = `
                <div class="schedule-empty">
                    <p class="eyebrow">
                        ERROR
                    </p>

                    <h3>
                        No se han podido cargar las clases.
                    </h3>

                    <p>
                        Inténtalo de nuevo.
                    </p>
                </div>
            `;

        }

    }

}


/* =========================================================
   NORMALIZAR HORARIOS
   =========================================================

   Convierte diferentes formatos a uno único.

   Ejemplos:

   10,30-12,00
   10:30-12:00
   10,30 - 12,00
   10:30 - 12:00

   Todos terminan siendo:

   10:30-12:00
   ========================================================= */

function normalizeTime(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }


    let time = String(value)
        .trim();


    if (!time) {
        return "";
    }


    /*
     * Comas decimales de la hora:
     *
     * 10,30 → 10:30
     */

    time = time.replace(
        /(\d{1,2}),(\d{2})/g,
        "$1:$2"
    );


    /*
     * Quitamos todos los espacios.
     */

    time = time.replace(
        /\s/g,
        ""
    );


    /*
     * Normalizamos posibles guiones.
     */

    time = time.replace(
        /–/g,
        "-"
    );

    time = time.replace(
        /—/g,
        "-"
    );


    return time;

}


/* =========================================================
   OBTENER TODOS LOS HORARIOS
   ========================================================= */

function getAvailableSchedules() {

    const schedules = new Map();


    allClasses.forEach(classItem => {

        const normalized =
            normalizeTime(classItem.time);


        /*
         * Las clases sin horario no entran aquí.
         */

        if (!normalized) {
            return;
        }


        if (!schedules.has(normalized)) {

            schedules.set(
                normalized,
                {
                    id: normalized,
                    label: normalized
                }
            );

        }

    });


    return Array.from(
        schedules.values()
    );

}


/* =========================================================
   OBTENER HORARIOS PRINCIPALES
   ========================================================= */

function getMainSchedules() {

    return MAIN_SCHEDULES.filter(
        schedule => {

            return allClasses.some(
                classItem =>
                    normalizeTime(
                        classItem.time
                    ) === schedule.id
            );

        }
    );

}


/* =========================================================
   OBTENER OTROS HORARIOS
   ========================================================= */

function getOtherSchedules() {

    const mainIds =
        MAIN_SCHEDULES.map(
            schedule => schedule.id
        );


    const schedules =
        getAvailableSchedules();


    return schedules
        .filter(
            schedule =>
                !mainIds.includes(
                    schedule.id
                )
        )
        .sort(
            (a, b) =>
                a.id.localeCompare(b.id)
        );

}


/* =========================================================
   OBTENER CLASES DE UN HORARIO
   ========================================================= */

function getClassesForSchedule(
    schedule
) {

    return allClasses.filter(
        classItem => {

            const classTime =
                normalizeTime(
                    classItem.time
                );


            return (
                classTime === schedule.id
            );

        }
    );

}


/* =========================================================
   OBTENER CLASES SIN HORARIO
   ========================================================= */

function getClassesWithoutSchedule() {

    return allClasses.filter(
        classItem => {

            return !normalizeTime(
                classItem.time
            );

        }
    );

}


/* =========================================================
   CREAR BOTÓN DE HORARIO
   ========================================================= */

function createScheduleButton(
    schedule
) {

    const classesForSchedule =
        getClassesForSchedule(
            schedule
        );


    const button =
        document.createElement("button");


    button.type = "button";

    button.className =
        "schedule-button";


    if (
        selectedSchedule ===
        schedule.id
    ) {

        button.classList.add(
            "selected"
        );

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


    return button;

}


/* =========================================================
   RENDERIZAR HORARIOS
   ========================================================= */

function renderSchedules() {

    const section =
        document.getElementById(
            "class-schedules"
        );


    if (!section) {

        console.error(
            "No existe el elemento #class-schedules."
        );

        return;

    }


    section.innerHTML = "";


    /* =====================================================
       CABECERA
       ===================================================== */

    const heading =
        document.createElement("div");


    heading.className =
        "schedule-heading";


    heading.innerHTML = `
        <p class="eyebrow">
            ELIGE TU HORARIO
        </p>

        <h3>
            Horarios/actividades
        </h3>
    `;


    section.appendChild(
        heading
    );


    /* =====================================================
       HORARIOS PRINCIPALES
       ===================================================== */

    const mainSchedules =
        getMainSchedules();


    if (mainSchedules.length > 0) {

        const mainTitle =
            document.createElement(
                "p"
            );


        mainTitle.className =
            "schedule-group-title";


        mainTitle.textContent =
            "HORARIOS PRINCIPALES";


        section.appendChild(
            mainTitle
        );


        const mainButtons =
            document.createElement(
                "div"
            );


        mainButtons.className =
            "schedule-buttons";


        mainSchedules.forEach(
            schedule => {

                mainButtons.appendChild(
                    createScheduleButton(
                        schedule
                    )
                );

            }
        );


        section.appendChild(
            mainButtons
        );

    }


    /* =====================================================
       OTROS HORARIOS
       ===================================================== */

    const otherSchedules =
        getOtherSchedules();


    if (otherSchedules.length > 0) {

        const otherTitle =
            document.createElement(
                "p"
            );


        otherTitle.className =
            "schedule-group-title other-schedule-title";


        otherTitle.textContent =
            "OTROS HORARIOS";


        section.appendChild(
            otherTitle
        );


        const otherButtons =
            document.createElement(
                "div"
            );


        otherButtons.className =
            "schedule-buttons";


        otherSchedules.forEach(
            schedule => {

                otherButtons.appendChild(
                    createScheduleButton(
                        schedule
                    )
                );

            }
        );


        section.appendChild(
            otherButtons
        );

    }


    /* =====================================================
       CLASES SIN HORARIO
       ===================================================== */

    const classesWithoutSchedule =
        getClassesWithoutSchedule();


    if (
        classesWithoutSchedule.length > 0
    ) {

        const noScheduleTitle =
            document.createElement(
                "p"
            );


        noScheduleTitle.className =
            "schedule-group-title no-schedule-title";


        noScheduleTitle.textContent =
            "INFORMACIÓN / ACTIVIDADES SIN HORARIO";


        section.appendChild(
            noScheduleTitle
        );


        const noScheduleButton =
            document.createElement(
                "button"
            );


        noScheduleButton.type =
            "button";


        noScheduleButton.className =
            "schedule-button no-schedule-button";


        if (
            selectedSchedule ===
            "__NO_SCHEDULE__"
        ) {

            noScheduleButton.classList.add(
                "selected"
            );

        }


        noScheduleButton.innerHTML = `
            <span>
                Actividades sin horario
            </span>

            <small>
                ${classesWithoutSchedule.length}
                ${
                    classesWithoutSchedule.length === 1
                        ? "actividad"
                        : "actividades"
                }
            </small>

            <b>→</b>
        `;


        noScheduleButton.addEventListener(
            "click",
            () => {

                selectedSchedule =
                    "__NO_SCHEDULE__";

                renderSchedules();

            }
        );


        const noScheduleButtons =
            document.createElement(
                "div"
            );


        noScheduleButtons.className =
            "schedule-buttons";


        noScheduleButtons.appendChild(
            noScheduleButton
        );


        section.appendChild(
            noScheduleButtons
        );

    }


    /* =====================================================
       NADA SELECCIONADO
       ===================================================== */

    if (
        selectedSchedule === null
    ) {

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


    /* =====================================================
       CLASES SIN HORARIO SELECCIONADAS
       ===================================================== */

    if (
        selectedSchedule ===
        "__NO_SCHEDULE__"
    ) {

        renderClasses(
            classesWithoutSchedule
        );

        return;

    }


    /* =====================================================
       CLASES DEL HORARIO SELECCIONADO
       ===================================================== */

    const selectedClasses =
        getClassesForSchedule({
            id: selectedSchedule
        });


    renderClasses(
        selectedClasses
    );

}


/* =========================================================
   RENDERIZAR CLASES
   ========================================================= */

function renderClasses(
    classes
) {

    classGrid.innerHTML = "";


    const selected =
        getAvailableSchedules()
            .find(
                schedule =>
                    schedule.id ===
                    selectedSchedule
            );


    const isNoSchedule =
        selectedSchedule ===
        "__NO_SCHEDULE__";


    /* =====================================================
       CABECERA DEL HORARIO
       ===================================================== */

    const heading =
        document.createElement(
            "div"
        );


    heading.className =
        "selected-schedule-heading";


    let selectedLabel = "";


    if (isNoSchedule) {

        selectedLabel =
            "Actividades sin horario";

    } else {

        selectedLabel =
            selected
                ? selected.label
                : selectedSchedule;

    }


    heading.innerHTML = `
        <div>

            <p class="eyebrow">
                ${
                    isNoSchedule
                        ? "ACTIVIDADES"
                        : "HORARIO SELECCIONADO"
                }
            </p>

            <h2>
                ${selectedLabel || ""}
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


    classGrid.appendChild(
        heading
    );


    const changeButton =
        document.getElementById(
            "change-schedule"
        );


    if (changeButton) {

        changeButton.addEventListener(
            "click",
            () => {

                selectedSchedule =
                    null;

                renderSchedules();

            }
        );

    }


    /* =====================================================
       NO HAY CLASES
       ===================================================== */

    if (
        classes.length === 0
    ) {

        const empty =
            document.createElement(
                "div"
            );


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


        classGrid.appendChild(
            empty
        );


        return;

    }


    /* =====================================================
       CONTENEDOR DE TARJETAS
       ===================================================== */

    const cards =
        document.createElement(
            "div"
        );


    cards.className =
        "class-grid-inner";


    /* =====================================================
       TARJETAS
       ===================================================== */

    classes.forEach(
        classItem => {

            const hasCapacity =
                classItem.capacity !== null &&
                classItem.capacity !== undefined &&
                String(classItem.capacity).trim() !== "" &&
                Number.isFinite(
                    Number(classItem.capacity)
                ) &&
                Number(classItem.capacity) > 0;

            const placesLeft = hasCapacity
                ? Number(classItem.capacity) -
                Number(classItem.bookedCount || 0)
                : null;

            const isFull =
                hasCapacity &&
                placesLeft <= 0;


            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "class-card";


            /*
             * Normalizamos la hora solamente
             * para mostrarla correctamente.
             */

            const displayTime =
                normalizeTime(
                    classItem.time
                );


            card.innerHTML = `
                <img
                    src="${classItem.imageUrl || ""}"
                    alt="${classItem.title || "Clase"}"
                >

                <div class="card-body">

                    <div class="card-top">

                        <span>
                            ${
                                classItem.duration
                                    ? `${classItem.duration} MIN`
                                    : ""
                            }
                        </span>

                        <span
                            class="availability ${
                                isFull ? "full" : ""
                            }"
                        >
                            ${
                                isFull
                                    ? "Clase completa"
                                    : hasCapacity
                                        ? `${placesLeft} plazas`
                                        : "Plazas disponibles"
                            }
                        </span>

                    </div>


                    <h3>
                        ${classItem.title || ""}
                    </h3>


                    <p>
                        ${
                            classItem.trainer || ""
                        }

                        ${
                            classItem.trainer &&
                            classItem.date
                                ? " · "
                                : ""
                        }

                        ${
                            classItem.date
                                ? formatDate(
                                    classItem.date
                                )
                                : ""
                        }

                        ${
                            displayTime
                                ? " · "
                                : ""
                        }

                        ${
                            displayTime
                                ? displayTime
                                : ""
                        }
                    </p>


                    ${
                        classItem.description
                            ? `
                                <p class="description">
                                    ${classItem.description}
                                </p>
                            `
                            : ""
                    }


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
                                    href="/reservar/${encodeURIComponent(
                                        classItem.id
                                    )}"
                                >
                                    Reservar plaza
                                    <b>→</b>
                                </a>
                            `
                    }

                </div>
            `;


            cards.appendChild(
                card
            );

        }
    );


    classGrid.appendChild(
        cards
    );

}


/* =========================================================
   FORMATEAR FECHA
   ========================================================= */

function formatDate(
    value
) {

    if (!value) {
        return "Fecha no disponible";
    }


    const text =
        String(value).trim();


    let day;
    let month;
    let year;


    /*
     * Formato:
     *
     * 2026-10-03
     */

    if (
        /^\d{4}-\d{2}-\d{2}$/.test(
            text
        )
    ) {

        [
            year,
            month,
            day
        ] = text.split("-");

    }


    /*
     * Formato:
     *
     * 03/10/2026
     */

    else if (
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(
            text
        )
    ) {

        [
            day,
            month,
            year
        ] = text.split("/");

    }


    /*
     * Cualquier otro formato.
     */

    else {

        const date =
            new Date(text);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "Fecha no disponible";

        }


        day =
            String(
                date.getDate()
            ).padStart(
                2,
                "0"
            );


        month =
            String(
                date.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        year =
            String(
                date.getFullYear()
            );

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


    const monthIndex =
        Number(month) - 1;


    return `
        ${day}
        de
        ${months[monthIndex]}
        de
        ${year}
    `;

}


/* =========================================================
   INICIAR
   ========================================================= */

loadClasses();
