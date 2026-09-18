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

   Convierte:

   10,30-12,00
   10:30-12:00
   10,30 - 12,00
   10:30 - 12:00

   en:

   10:30-12:00
   ========================================================= */

function normalizeTime(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }


    let time = String(value).trim();


    if (!time) {
        return "";
    }


    /*
     * Convierte comas en dos puntos.
     *
     * 10,30 → 10:30
     */

    time = time.replace(
        /(\d{1,2}),(\d{2})/g,
        "$1:$2"
    );


    /*
     * Quitamos espacios.
     */

    time = time.replace(
        /\s/g,
        ""
    );


    /*
     * Normalizamos guiones.
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


    /*
     * Contenedor completo del horario.
     *
     * Dentro estarán:
     *
     * - botón
     * - clases desplegadas
     */

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "schedule-item";


    /* =====================================================
       BOTÓN
       ===================================================== */

    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "schedule-button";


    const isSelected =
        selectedSchedule === schedule.id;


    if (isSelected) {

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

        <b>
            ${
                isSelected
                    ? "↓"
                    : "→"
            }
        </b>
    `;


    /* =====================================================
       CONTENEDOR DE LAS CLASES
       ===================================================== */

    const content =
        document.createElement("div");

    content.className =
        "schedule-item-content";


    /*
     * Si este horario está seleccionado,
     * ponemos las clases JUSTO debajo del botón.
     */

    if (isSelected) {

        content.classList.add(
            "open"
        );


        renderClassesIntoContainer(
            classesForSchedule,
            content,
            schedule.label
        );

    }


    /* =====================================================
       CLICK DEL BOTÓN
       ===================================================== */

    button.addEventListener(
        "click",
        () => {

            /*
             * Si pulsamos el horario que ya está abierto,
             * lo cerramos.
             */

            if (
                selectedSchedule ===
                schedule.id
            ) {

                selectedSchedule = null;

            }

            /*
             * Si pulsamos otro horario,
             * abrimos ese.
             */

            else {

                selectedSchedule =
                    schedule.id;

            }


            renderSchedules();

        }
    );


    wrapper.appendChild(
        button
    );


    wrapper.appendChild(
        content
    );


    return wrapper;

}


/* =========================================================
   CREAR BOTÓN DE ACTIVIDADES SIN HORARIO
   ========================================================= */

function createNoScheduleButton(
    classesWithoutSchedule
) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "schedule-item";


    /* =====================================================
       BOTÓN
       ===================================================== */

    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "schedule-button no-schedule-button";


    const isSelected =
        selectedSchedule ===
        "__NO_SCHEDULE__";


    if (isSelected) {

        button.classList.add(
            "selected"
        );

    }


    button.innerHTML = `
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

        <b>
            ${
                isSelected
                    ? "↓"
                    : "→"
            }
        </b>
    `;


    /* =====================================================
       CONTENIDO
       ===================================================== */

    const content =
        document.createElement("div");

    content.className =
        "schedule-item-content";


    if (isSelected) {

        content.classList.add(
            "open"
        );


        renderClassesIntoContainer(
            classesWithoutSchedule,
            content,
            "Actividades sin horario"
        );

    }


    /* =====================================================
       CLICK
       ===================================================== */

    button.addEventListener(
        "click",
        () => {

            if (
                selectedSchedule ===
                "__NO_SCHEDULE__"
            ) {

                selectedSchedule =
                    null;

            }

            else {

                selectedSchedule =
                    "__NO_SCHEDULE__";

            }


            renderSchedules();

        }
    );


    wrapper.appendChild(
        button
    );


    wrapper.appendChild(
        content
    );


    return wrapper;

}


/* =========================================================
   RENDERIZAR TODOS LOS HORARIOS
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


    /*
     * Limpiamos todo para volver a construir
     * la estructura.
     */

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


    if (
        mainSchedules.length > 0
    ) {

        const mainTitle =
            document.createElement("p");


        mainTitle.className =
            "schedule-group-title";


        mainTitle.textContent =
            "HORARIOS PRINCIPALES";


        section.appendChild(
            mainTitle
        );


        const mainContainer =
            document.createElement("div");


        mainContainer.className =
            "schedule-buttons";


        mainSchedules.forEach(
            schedule => {

                mainContainer.appendChild(
                    createScheduleButton(
                        schedule
                    )
                );

            }
        );


        section.appendChild(
            mainContainer
        );

    }


    /* =====================================================
       OTROS HORARIOS
       ===================================================== */

    const otherSchedules =
        getOtherSchedules();


    if (
        otherSchedules.length > 0
    ) {

        const otherTitle =
            document.createElement("p");


        otherTitle.className =
            "schedule-group-title other-schedule-title";


        otherTitle.textContent =
            "OTROS HORARIOS";


        section.appendChild(
            otherTitle
        );


        const otherContainer =
            document.createElement("div");


        otherContainer.className =
            "schedule-buttons";


        otherSchedules.forEach(
            schedule => {

                otherContainer.appendChild(
                    createScheduleButton(
                        schedule
                    )
                );

            }
        );


        section.appendChild(
            otherContainer
        );

    }


    /* =====================================================
       ACTIVIDADES SIN HORARIO
       ===================================================== */

    const classesWithoutSchedule =
        getClassesWithoutSchedule();


    if (
        classesWithoutSchedule.length > 0
    ) {

        const noScheduleTitle =
            document.createElement("p");


        noScheduleTitle.className =
            "schedule-group-title no-schedule-title";


        noScheduleTitle.textContent =
            "INFORMACIÓN / ACTIVIDADES SIN HORARIO";


        section.appendChild(
            noScheduleTitle
        );


        const noScheduleContainer =
            document.createElement("div");


        noScheduleContainer.className =
            "schedule-buttons";


        noScheduleContainer.appendChild(
            createNoScheduleButton(
                classesWithoutSchedule
            )
        );


        section.appendChild(
            noScheduleContainer
        );

    }

}


/* =========================================================
   RENDERIZAR CLASES DENTRO DEL HORARIO
   ========================================================= */

function renderClassesIntoContainer(
    classes,
    container,
    selectedLabel
) {

    /* =====================================================
       CABECERA
       ===================================================== */

    const heading =
        document.createElement("div");


    heading.className =
        "selected-schedule-heading";


    heading.innerHTML = `
        <div>

            <p class="eyebrow">
                ${
                    selectedSchedule ===
                    "__NO_SCHEDULE__"
                        ? "ACTIVIDADES"
                        : "HORARIO SELECCIONADO"
                }
            </p>

            <h2>
                ${selectedLabel || ""}
            </h2>

        </div>
    `;


    container.appendChild(
        heading
    );


    /* =====================================================
       NO HAY CLASES
       ===================================================== */

    if (
        classes.length === 0
    ) {

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


        container.appendChild(
            empty
        );


        return;

    }


    /* =====================================================
       CONTENEDOR DE TARJETAS
       ===================================================== */

    const cards =
        document.createElement("div");


    cards.className =
        "class-grid-inner";


    /* =====================================================
       TARJETAS
       ===================================================== */

    classes.forEach(
        classItem => {

            /*
             * Si capacity es un número positivo,
             * la clase tiene plazas limitadas.
             *
             * Si está vacío o contiene un texto como
             * "PARA LOS ALLÍ PRESENTES",
             * se considera ilimitada.
             */

            const hasCapacity =
                classItem.capacity !== null &&
                classItem.capacity !== undefined &&
                String(
                    classItem.capacity
                ).trim() !== "" &&
                Number.isFinite(
                    Number(
                        classItem.capacity
                    )
                ) &&
                Number(
                    classItem.capacity
                ) > 0;


            const placesLeft =
                hasCapacity
                    ? Number(
                        classItem.capacity
                    ) -
                    Number(
                        classItem.bookedCount || 0
                    )
                    : null;


            const isFull =
                hasCapacity &&
                placesLeft <= 0;


            /* =================================================
               TARJETA
               ================================================= */

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "class-card";


            /* =================================================
               HORA
               ================================================= */

            const displayTime =
                normalizeTime(
                    classItem.time
                );


            /* =================================================
               HTML DE LA TARJETA
               ================================================= */

            card.innerHTML = `

                <img
                    src="${
                        classItem.imageUrl || ""
                    }"
                    alt="${
                        classItem.title ||
                        "Clase"
                    }"
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
                                isFull
                                    ? "full"
                                    : ""
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
                        ${
                            classItem.title ||
                            ""
                        }
                    </h3>


                    <p>

                        ${
                            classItem.trainer ||
                            ""
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
                            displayTime ||
                            ""
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
                                    type="button"
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

                                    <b>
                                        →
                                    </b>

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


    container.appendChild(
        cards
    );

}


/* =========================================================
   FORMATEAR FECHA
   =========================================================

   Convierte:

   2026-10-03

   en:

   03 de octubre de 2026
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


    /* =====================================================
       FORMATO:

       2026-10-03
       ===================================================== */

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


    /* =====================================================
       FORMATO:

       03/10/2026
       ===================================================== */

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


    /* =====================================================
       OTROS FORMATOS
       ===================================================== */

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


    /*
     * Si por algún motivo el mes no es válido,
     * evitamos mostrar "undefined".
     */

    if (
        monthIndex < 0 ||
        monthIndex > 11
    ) {

        return `${day}/${month}/${year}`;

    }


    return `
        ${day}
        de
        ${months[monthIndex]}
        de
        ${year}
    `.replace(
        /\s+/g,
        " "
    ).trim();

}


/* =========================================================
   INICIAR
   ========================================================= */

loadClasses();
