// ==========================================
// FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


// ==========================================
// INICIALIZAR FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// ==========================================
// ELEMENTOS
// ==========================================

const schedulesSection =
    document.getElementById("class-schedules");


// ==========================================
// VARIABLES
// ==========================================

let allClasses = [];


// ==========================================
// NORMALIZAR HORARIO
// ==========================================

function normalizeTime(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    let time =
        String(value).trim();

    if (!time) {
        return "";
    }

    // 10,30 -> 10:30
    time = time.replace(
        /(\d{1,2}),(\d{2})/g,
        "$1:$2"
    );

    // Eliminar espacios
    time = time.replace(
        /\s/g,
        ""
    );

    // Normalizar guiones
    time = time.replace(
        /[–—]/g,
        "-"
    );

    return time;
}


// ==========================================
// PARSEAR FECHA
// ==========================================

function parseDate(dateValue) {

    if (!dateValue) {
        return null;
    }

    const value =
        String(dateValue).trim();


    // --------------------------------------
    // DD/MM/YYYY
    // --------------------------------------

    const europeanMatch =
        value.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );

    if (europeanMatch) {

        const day =
            Number(europeanMatch[1]);

        const month =
            Number(europeanMatch[2]);

        const year =
            Number(europeanMatch[3]);


        const date =
            new Date(
                year,
                month - 1,
                day
            );


        // Comprobar fecha válida
        if (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        ) {
            return date;
        }

        return null;
    }


    // --------------------------------------
    // YYYY-MM-DD
    // --------------------------------------

    const isoMatch =
        value.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

    if (isoMatch) {

        const year =
            Number(isoMatch[1]);

        const month =
            Number(isoMatch[2]);

        const day =
            Number(isoMatch[3]);


        const date =
            new Date(
                year,
                month - 1,
                day
            );


        if (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        ) {
            return date;
        }

        return null;
    }


    return null;
}


// ==========================================
// FORMATEAR FECHA
// ==========================================
//
// 04/10/2026
// ↓
// 4 de octubre de 2026
// ==========================================

function formatDate(dateValue) {

    const date =
        parseDate(dateValue);


    if (!date) {
        return dateValue || "";
    }


    return new Intl.DateTimeFormat(
        "es-ES",
        {
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    ).format(date);
}


// ==========================================
// CARGAR CLASES DESDE FIRESTORE
// ==========================================

async function loadClasses() {

    try {

        if (!schedulesSection) {

            console.error(
                "No se encontró el elemento #class-schedules"
            );

            return;
        }


        // --------------------------------------
        // MENSAJE DE CARGA
        // --------------------------------------

        schedulesSection.innerHTML = `
            <div class="loading-classes">
                Cargando clases...
            </div>
        `;


        // --------------------------------------
        // LEER FIRESTORE
        // --------------------------------------

        const snapshot =
            await getDocs(
                collection(
                    db,
                    "classes"
                ),
            orderBy("orden", "asc")
            );


        const classes = [];


        // ======================================
        // RECORRER CLASES
        // ======================================

        snapshot.forEach((doc) => {

            const data =
                doc.data();


            // ----------------------------------
            // NO MOSTRAR DESACTIVADAS
            // ----------------------------------

            if (
                data.activa === false
            ) {
                return;
            }


            // ----------------------------------
            // CAPACIDAD
            // ----------------------------------

            let capacity = null;


            if (
                data.capacity !== null &&
                data.capacity !== undefined &&
                data.capacity !== ""
            ) {

                const parsedCapacity =
                    Number(data.capacity);


                if (
                    Number.isFinite(
                        parsedCapacity
                    ) &&
                    parsedCapacity > 0
                ) {

                    capacity =
                        parsedCapacity;

                }

            }


            // ----------------------------------
            // ORDEN DE GOOGLE SHEETS
            // ----------------------------------

            let orden =
                Number.MAX_SAFE_INTEGER;


            if (
                data.orden !== undefined &&
                data.orden !== null &&
                data.orden !== ""
            ) {

                const parsedOrden =
                    Number(data.orden);


                if (
                    Number.isFinite(
                        parsedOrden
                    )
                ) {

                    orden =
                        parsedOrden;

                }

            }


            // ==================================
            // IMPORTANTE
            // ==================================
            //
            // USAMOS doc.id COMO ID.
            //
            // Esto es lo que utilizaba tu
            // código antiguo que funcionaba.
            //
            // La reserva espera este ID para
            // buscar:
            //
            // classes/{classId}
            // ==================================

            classes.push({

                // ID REAL DEL DOCUMENTO FIRESTORE
                id: doc.id,

                // Guardamos también el document ID
                firestoreId: doc.id,

                title:
                    String(
                        data.title ?? ""
                    ).trim(),

                trainer:
                    String(
                        data.trainer ?? ""
                    ).trim(),

                date:
                    String(
                        data.date ?? ""
                    ).trim(),

                time:
                    String(
                        data.time ?? ""
                    ).trim(),

                duration:
                    Number(
                        data.duration ?? 0
                    ),

                capacity:
                    capacity,

                description:
                    String(
                        data.description ?? ""
                    ).trim(),

                imageUrl:
                    String(
                        data.imageUrl ?? ""
                    ).trim(),

                activa:
                    data.activa !== false,

                tipo:
                    String(
                        data.tipo ?? ""
                    ).trim(),

                orden:
                    orden,

                bookedCount:
                    Number(
                        data.bookedCount ?? 0
                    )

            });

        });


        // ======================================
        // ORDENAR SEGÚN GOOGLE SHEETS
        // ======================================
        //
        // NO ordenamos por fecha.
        // NO ordenamos por hora.
        // NO ordenamos por TIPO.
        //
        // Se utiliza exactamente el campo
        // "orden" que guarda el backend.
        // ======================================

        classes.sort(
            (a, b) =>
                a.orden - b.orden
        );


        allClasses =
            classes;


        // --------------------------------------
        // MOSTRAR
        // --------------------------------------

        renderSchedules(
            allClasses
        );


    } catch (error) {

        console.error(
            "Error cargando las clases:",
            error
        );


        if (schedulesSection) {

            schedulesSection.innerHTML = `
                <div class="classes-error">
                    No se han podido cargar las clases.
                </div>
            `;

        }

    }

}

// ==========================================
// OBTENER HORARIOS
// ==========================================
//
// Agrupa las clases por HORA DE INICIO
// y ordena los horarios de menor a mayor.
//
// Ejemplo:
//
// 09:45-10:15  → 09:45
// 10:30-11:10  → 10:30
// 10:30-12:00  → 10:30
// 11:30-12:10  → 11:30
// 12:30-13:10  → 12:30
//
// Resultado:
//
// 09:45
// 10:30
// 11:30
// 12:30
// ==========================================
function getSchedules(classes) {
    const schedules = [];

    classes.forEach((classItem) => {
        if (!classItem.time) {
            return;
        }

        const normalizedTime =
            normalizeTime(classItem.time);

        if (!normalizedTime) {
            return;
        }

        // Obtener solamente la hora de inicio
        const startTime =
            normalizedTime.split("-")[0];

        if (!startTime) {
            return;
        }

        // Evitar horarios duplicados
        if (!schedules.includes(startTime)) {
            schedules.push(startTime);
        }
    });

    // Ordenar cronológicamente por hora de inicio
    schedules.sort((a, b) => {
        const [hoursA, minutesA] =
            a.split(":").map(Number);

        const [hoursB, minutesB] =
            b.split(":").map(Number);

        const totalMinutesA =
            hoursA * 60 + minutesA;

        const totalMinutesB =
            hoursB * 60 + minutesB;

        return totalMinutesA - totalMinutesB;
    });

    return schedules;
}

// ==========================================
// RENDERIZAR HORARIOS
// ==========================================

function renderSchedules(classes) {

    if (!schedulesSection) {
        return;
    }


    schedulesSection.innerHTML = "";


    // --------------------------------------
    // HORARIOS
    // --------------------------------------

    const schedules =
        getSchedules(classes);


    // --------------------------------------
    // ACTIVIDADES SIN HORARIO
    // --------------------------------------

    const classesWithoutTime =
        classes.filter(
            (classItem) =>
                !classItem.time
        );


    // ======================================
    // CABECERA
    // ======================================

    const heading =
        document.createElement(
            "div"
        );


    heading.className =
        "schedule-heading";


    heading.innerHTML = `
        <h3>Horarios</h3>

        <p>
            Selecciona un horario para ver las actividades disponibles.
        </p>
    `;


    schedulesSection.appendChild(
        heading
    );


    // ======================================
    // CONTENEDOR DE HORARIOS
    // ======================================

    const buttonsContainer =
        document.createElement(
            "div"
        );


    buttonsContainer.className =
        "schedule-buttons";


    // ======================================
    // CREAR HORARIOS
    // ======================================

    schedules.forEach(
        (schedule) => {

            const scheduleItem =
                document.createElement(
                    "div"
                );


            scheduleItem.className =
                "schedule-item";


            // ----------------------------------
            // BOTÓN HORARIO
            // ----------------------------------

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "schedule-button";


            button.innerHTML = `
                <span>
                    ${schedule}
                </span>

                <small>
                    Ver actividades de este horario
                </small>
            `;


            // ----------------------------------
            // CONTENIDO
            // ----------------------------------

            const content =
                document.createElement(
                    "div"
                );


            content.className =
                "schedule-item-content";


            // ----------------------------------
            // CLASES DEL HORARIO
            // ----------------------------------

            const scheduleClasses = classes.filter(
                    (classItem) => {
                        if (!classItem.time) {
                            return false;
                        }

                        const normalizedTime =
                            normalizeTime(classItem.time);

                        const startTime =
                            normalizedTime.split("-")[0];

                        return startTime === schedule;
                    }
                );

            // ==================================
            // ABRIR / CERRAR
            // ==================================

            button.addEventListener(
                "click",
                () => {

                    const isOpen =
                        content.classList.contains(
                            "open"
                        );


                    // --------------------------
                    // CERRAR OTROS
                    // --------------------------

                    document
                        .querySelectorAll(
                            ".schedule-item-content.open"
                        )
                        .forEach(
                            (element) => {

                                if (
                                    element !== content
                                ) {

                                    element.classList.remove(
                                        "open"
                                    );

                                }

                            }
                        );


                    document
                        .querySelectorAll(
                            ".schedule-button.selected"
                        )
                        .forEach(
                            (element) => {

                                if (
                                    element !== button
                                ) {

                                    element.classList.remove(
                                        "selected"
                                    );

                                }

                            }
                        );


                    // --------------------------
                    // ABRIR / CERRAR ACTUAL
                    // --------------------------

                    if (isOpen) {

                        content.classList.remove(
                            "open"
                        );

                        button.classList.remove(
                            "selected"
                        );

                    } else {

                        content.classList.add(
                            "open"
                        );

                        button.classList.add(
                            "selected"
                        );

                    }

                }
            );


            scheduleItem.appendChild(
                button
            );


            scheduleItem.appendChild(
                content
            );


            buttonsContainer.appendChild(
                scheduleItem
            );

        }
    );


    schedulesSection.appendChild(
        buttonsContainer
    );


    // ======================================
    // ACTIVIDADES SIN HORARIO
    // ======================================

    if (
        classesWithoutTime.length > 0
    ) {

        const noScheduleWrapper =
            document.createElement(
                "div"
            );


        noScheduleWrapper.className =
            "no-schedule-section";


        const noScheduleTitle =
            document.createElement(
                "h3"
            );


        noScheduleTitle.textContent =
            "Información y actividades";


        noScheduleWrapper.appendChild(
            noScheduleTitle
        );


        const noScheduleGrid =
            document.createElement(
                "div"
            );


        noScheduleGrid.className =
            "class-grid-inner";


        // ----------------------------------
        // MISMO ORDEN DEL SHEET
        // ----------------------------------

        classesWithoutTime.forEach(
            (classItem) => {

                noScheduleGrid.appendChild(
                    createClassCard(
                        classItem
                    )
                );

            }
        );


        noScheduleWrapper.appendChild(
            noScheduleGrid
        );


        schedulesSection.appendChild(
            noScheduleWrapper
        );

    }

}


// ==========================================
// RENDERIZAR CLASES
// ==========================================

function renderClassesIntoContainer(
    classes,
    container
) {

    container.innerHTML = "";


    if (!classes.length) {

        container.innerHTML = `
            <div class="no-classes">
                No hay actividades disponibles
                en este horario.
            </div>
        `;

        return;
    }


    const grid =
        document.createElement(
            "div"
        );


    grid.className =
        "class-grid-inner";


    classes.forEach(
        (classItem) => {

            grid.appendChild(
                createClassCard(
                    classItem
                )
            );

        }
    );


    container.appendChild(
        grid
    );

}


// ==========================================
// CREAR TARJETA
// ==========================================

function createClassCard(classItem) {

    const card =
        document.createElement("article");

    card.className =
        "class-card";


    // ======================================
    // IMAGEN
    // ======================================

    if (classItem.imageUrl) {

        const image =
            document.createElement("img");

        image.src =
            classItem.imageUrl;

        image.alt =
            classItem.title ||
            "Actividad";

        image.loading =
            "lazy";

        image.onerror = () => {
            image.style.display = "none";
        };

        card.appendChild(image);
    }


    // ======================================
    // BODY
    // ======================================

    const body =
        document.createElement("div");

    body.className =
        "card-body";


    // ======================================
    // TIPO
    // ======================================

    if (classItem.tipo) {

        const type =
            document.createElement("div");

        type.className =
            "class-type";

        type.textContent =
            classItem.tipo;

        body.appendChild(type);
    }


    // ======================================
    // TÍTULO
    // ======================================

    const title =
        document.createElement("h4");

    title.textContent =
        classItem.title ||
        "Actividad";

    body.appendChild(title);


    // ======================================
    // CENTRO / ENTRENADOR
    // ======================================

    if (classItem.trainer) {

        const trainer =
            document.createElement("div");

        trainer.className =
            "class-trainer";

        trainer.textContent =
            classItem.trainer;

        body.appendChild(trainer);
    }


    // ======================================
    // FECHA
    // ======================================

    if (classItem.date) {

        const date =
            document.createElement("div");

        date.className =
            "class-date";

        date.textContent =
            formatDate(classItem.date);

        body.appendChild(date);
    }


    // ======================================
    // DESCRIPCIÓN
    // ======================================

    if (classItem.description) {

        const description =
            document.createElement("div");

        description.className =
            "class-description";

        description.textContent =
            classItem.description;

        body.appendChild(description);
    }


    // ======================================
    // PLAZAS
    // ======================================

    const capacity =
        document.createElement("div");

    capacity.className =
        "availability";


    const numericCapacity =
        Number(classItem.capacity);

    const hasLimitedCapacity =
        Number.isFinite(numericCapacity) &&
        numericCapacity > 0;

    const bookedCount =
        Number(classItem.bookedCount || 0);


    let isFull = false;


    if (hasLimitedCapacity) {

        const placesLeft =
            Math.max(
                numericCapacity - bookedCount,
                0
            );


        if (placesLeft <= 0) {

            isFull = true;

            capacity.textContent =
                "Clase completa";

            capacity.classList.add("full");

        } else {

            capacity.textContent =
                `${placesLeft} ${
                    placesLeft === 1
                        ? "plaza disponible"
                        : "plazas disponibles"
                }`;
        }

    } else {

        capacity.textContent =
            "Plazas disponibles";
    }


    body.appendChild(capacity);


    // ======================================
    // BOTÓN RESERVAR
    // ======================================

    const actions =
        document.createElement("div");

    actions.className =
        "card-actions";


    if (isFull) {

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "reserve";

        button.disabled =
            true;

        button.textContent =
            "Clase completa";

        actions.appendChild(button);

    } else {

        const reserveLink =
            document.createElement("a");

        reserveLink.className =
            "reserve";

        reserveLink.href =
            `/reservar/${encodeURIComponent(
                classItem.id
            )}`;

        reserveLink.innerHTML = `
            Reservar plaza
            <b>→</b>
        `;

        actions.appendChild(
            reserveLink
        );
    }


    body.appendChild(actions);

    card.appendChild(body);


    return card;
}


// ==========================================
// IR A LA RESERVA
// ==========================================
//
// IMPORTANTE:
//
// La página antigua funcionaba con:
//
// /reservar/ID
//
// Por eso usamos el ID REAL del documento
// de Firestore.
//
// Ejemplo:
//
// /reservar/abc123
// ==========================================

function goToReservation(classItem) {

    try {

        const classId =
            String(
                classItem.id
            ).trim();


        if (!classId) {

            console.error(
                "La clase no tiene ID de Firestore:",
                classItem
            );

            return;
        }


        const url =
            `/reservar/${encodeURIComponent(
                classId
            )}`;


        console.log(
            "Abriendo página de reserva:",
            url
        );


        window.location.href =
            url;


    } catch (error) {

        console.error(
            "Error al abrir la reserva:",
            error
        );

    }

}


// ==========================================
// INICIAR
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadClasses();

    }
);
