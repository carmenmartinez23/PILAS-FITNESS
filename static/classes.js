import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

/* =========================================================
   FIREBASE
   ========================================================= */

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

/* =========================================================
   ELEMENTOS
   ========================================================= */

const schedulesSection =
    document.getElementById("class-schedules");

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
         * Firestore contiene las clases ya sincronizadas
         * automáticamente desde Google Sheets.
         *
         * No hacemos una sincronización manual aquí para
         * evitar ralentizar la página.
         */

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
         * Ordenamos primero por fecha y después por hora.
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

        if (schedulesSection) {

            schedulesSection.innerHTML = `
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

    time = time.replace(/–/g, "-");
    time = time.replace(/—/g, "-");

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

function getClassesForSchedule(schedule) {

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
   NORMALIZAR TIPO
   ========================================================= */

function normalizeType(value) {

    const type =
        String(value || "")
            .trim()
            .toUpperCase();

    if (type === "CLÍNICO" || type === "CLINICO") {
        return "CLÍNICO";
    }

    if (type === "DEPORTIVO") {
        return "DEPORTIVO";
    }

    return "OTROS";
}

/* =========================================================
   CREAR BOTÓN DE HORARIO
   ========================================================= */

function createScheduleButton(schedule) {

    const classesForSchedule =
        getClassesForSchedule(schedule);

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
                    ? "actividad"
                    : "actividades"
            }
        </small>

        <b>
            ${isSelected ? "↓" : "→"}
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

        content.classList.add("open");

        renderClassesIntoContainer(
            classesForSchedule,
            content,
            schedule.label
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
                schedule.id
            ) {
                selectedSchedule = null;
            } else {
                selectedSchedule =
                    schedule.id;
            }

            renderSchedules();
        }
    );

    wrapper.appendChild(button);
    wrapper.appendChild(content);

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

    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "schedule-button no-schedule-button";

    const isSelected =
        selectedSchedule === "__NO_SCHEDULE__";

    if (isSelected) {
        button.classList.add("selected");
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
            ${isSelected ? "↓" : "→"}
        </b>
    `;

    const content =
        document.createElement("div");

    content.className =
        "schedule-item-content";

    if (isSelected) {

        content.classList.add("open");

        renderClassesIntoContainer(
            classesWithoutSchedule,
            content,
            "Actividades sin horario"
        );
    }

    button.addEventListener(
        "click",
        () => {

            if (
                selectedSchedule ===
                "__NO_SCHEDULE__"
            ) {
                selectedSchedule = null;
            } else {
                selectedSchedule =
                    "__NO_SCHEDULE__";
            }

            renderSchedules();
        }
    );

    wrapper.appendChild(button);
    wrapper.appendChild(content);

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
            Horarios y actividades
        </h3>
    `;

    section.appendChild(heading);

    /* =====================================================
       HORARIOS PRINCIPALES
       ===================================================== */

    const mainSchedules =
        getMainSchedules();

    if (mainSchedules.length > 0) {

        const mainTitle =
            document.createElement("p");

        mainTitle.className =
            "schedule-group-title";

        mainTitle.textContent =
            "HORARIOS PRINCIPALES";

        section.appendChild(mainTitle);

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

    if (otherSchedules.length > 0) {

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
   CREAR SECCIÓN DE TIPO
   ========================================================= */

function createTypeSection(
    type,
    classes
) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "class-type-section";

    const title =
        document.createElement("div");

    title.className =
        "class-type-title";

    wrapper.appendChild(title);

    const cards =
        document.createElement("div");

    cards.className =
        "class-grid-inner";

    classes.forEach(
        classItem => {

            cards.appendChild(
                createClassCard(
                    classItem
                )
            );
        }
    );

    wrapper.appendChild(cards);

    return wrapper;
}

/* =========================================================
   CREAR TARJETA DE CLASE
   ========================================================= */

function createClassCard(classItem) {

    /*
     * Si capacity es un número positivo,
     * la clase tiene plazas limitadas.
     *
     * Si está vacío/null,
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

    const card =
        document.createElement("article");

    card.className =
        "class-card";

    const displayTime =
        normalizeTime(
            classItem.time
        );

    const type =
        normalizeType(
            classItem.tipo
        );

    card.innerHTML = `
        <img
            src="${escapeHtml(
                classItem.imageUrl || ""
            )}"
            alt="${escapeHtml(
                classItem.title ||
                "Actividad"
            )}"
        >

        <div class="card-body">

            <div class="card-top">

                <span>
                    ${type}
                    ${
                        classItem.duration
                            ? ` · ${classItem.duration} MIN`
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
                ${escapeHtml(
                    classItem.title || ""
                )}
            </h3>

            <p>
                ${escapeHtml(
                    classItem.trainer || ""
                )}

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

                ${displayTime}
            </p>

            ${
                classItem.description
                    ? `
                        <p class="description">
                            ${escapeHtml(
                                classItem.description
                            )}
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
                            <b>→</b>
                        </a>
                    `
            }

        </div>
    `;

    return card;
}

/* =========================================================
   ESCAPAR HTML
   ========================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================
   RENDERIZAR CLASES DENTRO DEL HORARIO
   ========================================================= */

function renderClassesIntoContainer(
    classes,
    container,
    selectedLabel
) {

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

    if (classes.length === 0) {

        const empty =
            document.createElement("div");

        empty.className =
            "schedule-empty";

        empty.innerHTML = `
            <p class="eyebrow">
                SIN ACTIVIDADES
            </p>

            <h3>
                No hay actividades en este horario.
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

    /*
     * Agrupamos por TIPO:
     *
     * DEPORTIVO
     * CLÍNICO
     * OTROS
     */

    const grouped = {
        DEPORTIVO: [],
        "CLÍNICO": [],
        OTROS: []
    };

    classes.forEach(
        classItem => {

            const type =
                normalizeType(
                    classItem.tipo
                );

            if (!grouped[type]) {
                grouped.OTROS.push(
                    classItem
                );
            } else {
                grouped[type].push(
                    classItem
                );
            }
        }
    );

    /*
     * Primero DEPORTIVO,
     * después CLÍNICO,
     * después OTROS.
     */

    [
        "DEPORTIVO",
        "CLÍNICO",
        "OTROS"
    ].forEach(type => {

        if (
            grouped[type].length === 0
        ) {
            return;
        }

        container.appendChild(
            createTypeSection(
                type,
                grouped[type]
            )
        );
    });
}

/* =========================================================
   FORMATEAR FECHA
   ========================================================= */

function formatDate(value) {

    if (!value) {
        return "Fecha no disponible";
    }

    const text =
        String(value).trim();

    let day;
    let month;
    let year;

    /*
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
     * Otros formatos
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
    `
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

/* =========================================================
   INICIAR
   ========================================================= */

loadClasses();
