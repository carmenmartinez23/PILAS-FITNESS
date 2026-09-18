// ==========================================
// FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


// ==========================================
// CONFIGURACIÓN FIREBASE
// ==========================================

import { firebaseConfig } from "./firebase-config.js";

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
// UTILIDADES
// ==========================================

function normalizeTime(time) {
    if (!time) return "";

    return String(time)
        .trim()
        .replace(/\s+/g, "")
        .replace(/[–—]/g, "-");
}


// ==========================================
// CONVERTIR FECHA A DATE
// ==========================================

function parseDate(dateValue) {
    if (!dateValue) return null;

    const value = String(dateValue).trim();

    // --------------------------------------
    // dd/mm/yyyy
    // --------------------------------------

    const europeanMatch = value.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

    if (europeanMatch) {
        const day = Number(europeanMatch[1]);
        const month = Number(europeanMatch[2]) - 1;
        const year = Number(europeanMatch[3]);

        const date = new Date(
            year,
            month,
            day
        );

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }


    // --------------------------------------
    // yyyy-mm-dd
    // --------------------------------------

    const isoMatch = value.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]) - 1;
        const day = Number(isoMatch[3]);

        const date = new Date(
            year,
            month,
            day
        );

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    return null;
}


// ==========================================
// FORMATO BONITO DE FECHA
// ==========================================
//
// 04/10/2026
// ↓
// 4 de octubre de 2026
//
// ==========================================

function formatDate(dateValue) {
    const date = parseDate(dateValue);

    if (!date) {
        return dateValue || "";
    }

    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(date);
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


        schedulesSection.innerHTML = `
            <div class="loading-classes">
                Cargando clases...
            </div>
        `;


        // ======================================
        // LEER FIRESTORE
        // ======================================
        //
        // NO sincronizamos aquí con Google Sheets.
        //
        // Firebase Functions se encarga de
        // sincronizar automáticamente cada 5 minutos.
        //
        // ======================================

        const snapshot = await getDocs(
            collection(db, "classes")
        );


        const classes = [];


        snapshot.forEach((doc) => {

            const data = doc.data();


            // ----------------------------------
            // No mostrar clases desactivadas
            // ----------------------------------

            if (data.activa === false) {
                return;
            }


            // ----------------------------------
            // Capacidad
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
                    Number.isFinite(parsedCapacity) &&
                    parsedCapacity > 0
                ) {
                    capacity = parsedCapacity;
                }

            }


            // ----------------------------------
            // Añadir clase
            // ----------------------------------

            classes.push({

                id: String(
                    data.id ?? doc.id
                ),

                title: String(
                    data.title ?? ""
                ).trim(),

                trainer: String(
                    data.trainer ?? ""
                ).trim(),

                date: String(
                    data.date ?? ""
                ).trim(),

                time: String(
                    data.time ?? ""
                ).trim(),

                duration: Number(
                    data.duration ?? 0
                ),

                capacity: capacity,

                description: String(
                    data.description ?? ""
                ).trim(),

                imageUrl: String(
                    data.imageUrl ?? ""
                ).trim(),

                activa:
                    data.activa !== false,

                // --------------------------------
                // NUEVO: TIPO
                // --------------------------------

                tipo: String(
                    data.tipo ?? ""
                ).trim(),

                // --------------------------------
                // ORDEN DEL GOOGLE SHEET
                // --------------------------------

                orden:
                    data.orden !== undefined &&
                    data.orden !== null
                        ? Number(data.orden)
                        : Number.MAX_SAFE_INTEGER,

                // --------------------------------
                // RESERVAS
                // --------------------------------

                bookedCount: Number(
                    data.bookedCount ?? 0
                )

            });

        });


        // ======================================
        // ORDEN EXACTO DEL GOOGLE SHEET
        // ======================================
        //
        // El backend guarda "orden" según la
        // posición de la fila en Google Sheets.
        //
        // Por ejemplo:
        //
        // 1  ZUMBATÓN
        // 2  ZUMBATÓN
        // 3  ZUMBATÓN
        // 4  CROSSFIT
        // 5  FUNCIONAL FITNESS
        //
        // etc.
        //
        // ======================================

        classes.sort((a, b) => {

            return a.orden - b.orden;

        });


        allClasses = classes;


        renderSchedules(allClasses);


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
// IMPORTANTE:
//
// NO ordenamos los horarios por hora.
//
// Se mantienen en el orden en el que aparecen
// por primera vez en Google Sheets.
//
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


        if (!schedules.includes(normalizedTime)) {

            schedules.push(
                normalizedTime
            );

        }

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


    const schedules =
        getSchedules(classes);


    // ======================================
    // CLASES SIN HORARIO
    // ======================================

    const classesWithoutTime =
        classes.filter((classItem) => {

            return !classItem.time;

        });


    // ======================================
    // CABECERA
    // ======================================

    const heading =
        document.createElement("div");

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
        document.createElement("div");

    buttonsContainer.className =
        "schedule-buttons";


    schedules.forEach((schedule) => {

        const scheduleItem =
            document.createElement("div");

        scheduleItem.className =
            "schedule-item";


        // ==================================
        // BOTÓN
        // ==================================

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "schedule-button";


        button.innerHTML = `
            <span>${schedule}</span>
            <small>
                Ver actividades de este horario
            </small>
        `;


        // ==================================
        // CONTENIDO
        // ==================================

        const content =
            document.createElement("div");

        content.className =
            "schedule-item-content";


        // ==================================
        // CLASES DE ESTE HORARIO
        // ==================================
        //
        // NO hacemos ningún sort aquí.
        //
        // "classes" ya está ordenado según
        // el orden de Google Sheets.
        //
        // Por tanto, filter() conserva ese orden.
        //
        // ==================================

        const scheduleClasses =
            classes.filter((classItem) => {

                return (
                    normalizeTime(
                        classItem.time
                    ) === schedule
                );

            });


        renderClassesIntoContainer(
            scheduleClasses,
            content
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


                // ------------------------------
                // Cerrar otros horarios
                // ------------------------------

                document
                    .querySelectorAll(
                        ".schedule-item-content.open"
                    )
                    .forEach((element) => {

                        if (element !== content) {

                            element.classList.remove(
                                "open"
                            );

                        }

                    });


                document
                    .querySelectorAll(
                        ".schedule-button.selected"
                    )
                    .forEach((element) => {

                        if (element !== button) {

                            element.classList.remove(
                                "selected"
                            );

                        }

                    });


                // ------------------------------
                // Abrir / cerrar actual
                // ------------------------------

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

    });


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
            document.createElement("div");

        noScheduleWrapper.className =
            "no-schedule-section";


        const noScheduleTitle =
            document.createElement("h3");

        noScheduleTitle.textContent =
            "Información y actividades";


        noScheduleWrapper.appendChild(
            noScheduleTitle
        );


        const noScheduleGrid =
            document.createElement("div");

        noScheduleGrid.className =
            "class-grid-inner";


        // ----------------------------------
        // IMPORTANTE:
        // ----------------------------------
        //
        // No ordenamos.
        //
        // Conservamos el orden del Sheet.
        //
        // ----------------------------------

        classesWithoutTime.forEach(
            (classItem) => {

                noScheduleGrid.appendChild(
                    createClassCard(classItem)
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
        document.createElement("div");

    grid.className =
        "class-grid-inner";


    // ======================================
    // IMPORTANTE
    // ======================================
    //
    // No se agrupa por TIPO.
    //
    // No se ordena por TIPO.
    //
    // Se mantiene exactamente el orden
    // recibido desde Firestore.
    //
    // ======================================

    classes.forEach((classItem) => {

        grid.appendChild(
            createClassCard(classItem)
        );

    });


    container.appendChild(
        grid
    );

}


// ==========================================
// CREAR TARJETA DE CLASE
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

            image.style.display =
                "none";

        };


        card.appendChild(
            image
        );

    }


    // ======================================
    // CUERPO
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


        body.appendChild(
            type
        );

    }


    // ======================================
    // TÍTULO
    // ======================================

    const title =
        document.createElement("h4");


    title.textContent =
        classItem.title ||
        "Actividad";


    body.appendChild(
        title
    );


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


        body.appendChild(
            trainer
        );

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
            formatDate(
                classItem.date
            );


        body.appendChild(
            date
        );

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


        body.appendChild(
            description
        );

    }


    // ======================================
    // INFORMACIÓN DE PLAZAS
    // ======================================

    const capacity =
        document.createElement("div");


    capacity.className =
        "class-capacity";


    const numericCapacity =
        Number(
            classItem.capacity
        );


    const hasLimitedCapacity =
        Number.isFinite(
            numericCapacity
        ) &&
        numericCapacity > 0;


    if (hasLimitedCapacity) {

        const bookedCount =
            Number(
                classItem.bookedCount || 0
            );


        const remaining =
            Math.max(
                numericCapacity -
                bookedCount,
                0
            );


        if (remaining <= 0) {

            capacity.textContent =
                "Clase completa";


            capacity.classList.add(
                "full"
            );

        } else {

            capacity.textContent =
                `${remaining} ${
                    remaining === 1
                        ? "plaza disponible"
                        : "plazas disponibles"
                }`;

        }

    } else {

        // Capacidad vacía o texto como
        // "PARA LOS ALLÍ PRESENTES"
        //
        // = plazas no limitadas

        capacity.textContent =
            "Plazas disponibles";

    }


    body.appendChild(
        capacity
    );


    // ======================================
    // BOTÓN
    // ======================================

    const actions =
        document.createElement("div");


    actions.className =
        "card-actions";


    const button =
        document.createElement("button");


    button.type =
        "button";


    button.className =
        "reserve-class-button";


    button.textContent =
        "Reservar";


    // ======================================
    // COMPROBAR SI ESTÁ COMPLETA
    // ======================================

    const bookedCount =
        Number(
            classItem.bookedCount || 0
        );


    const isFull =
        hasLimitedCapacity &&
        bookedCount >= numericCapacity;


    if (isFull) {

        button.disabled =
            true;


        button.textContent =
            "Completa";


        button.classList.add(
            "disabled"
        );

    }


    // ======================================
    // RESERVAR
    // ======================================

    button.addEventListener(
        "click",
        () => {

            if (button.disabled) {
                return;
            }


            goToReservation(
                classItem
            );

        }
    );


    actions.appendChild(
        button
    );


    body.appendChild(
        actions
    );


    card.appendChild(
        body
    );


    return card;

}


// ==========================================
// IR A RESERVAR
// ==========================================

function goToReservation(classItem) {

    const params =
        new URLSearchParams();


    params.set(
        "classId",
        classItem.id
    );


    // ======================================
    // DATOS ADICIONALES
    // ======================================

    if (classItem.title) {

        params.set(
            "title",
            classItem.title
        );

    }


    if (classItem.date) {

        params.set(
            "date",
            classItem.date
        );

    }


    if (classItem.time) {

        params.set(
            "time",
            classItem.time
        );

    }


    // ======================================
    // IR A LA PÁGINA DE RESERVA
    // ======================================

    window.location.href =
        `/reservar?${params.toString()}`;

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
