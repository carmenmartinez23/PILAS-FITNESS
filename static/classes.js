// ==========================================
// FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs
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

const schedulesSection = document.getElementById("class-schedules");


// ==========================================
// VARIABLES
// ==========================================

let allClasses = [];


// ==========================================
// NORMALIZAR HORARIO
// ==========================================

function normalizeTime(time) {
    if (!time) {
        return "";
    }

    return String(time)
        .trim()
        .replace(/\s+/g, "")
        .replace(/[–—]/g, "-");
}


// ==========================================
// PARSEAR FECHA
// ==========================================

function parseDate(dateValue) {
    if (!dateValue) {
        return null;
    }

    const value = String(dateValue).trim();

    // --------------------------------------
    // DD/MM/YYYY
    // --------------------------------------

    const europeanMatch = value.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

    if (europeanMatch) {
        const day = Number(europeanMatch[1]);
        const month = Number(europeanMatch[2]);
        const year = Number(europeanMatch[3]);

        const date = new Date(year, month - 1, day);

        // Evitamos fechas inválidas que JS corrige automáticamente
        // como 31/02/2026 -> marzo.
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

    const isoMatch = value.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);

        const date = new Date(year, month - 1, day);

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
// FORMATO BONITO DE FECHA
// ==========================================
//
// 04/10/2026
// ↓
// 4 de octubre de 2026
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

        const snapshot = await getDocs(
            collection(db, "classes")
        );


        const classes = [];


        // ======================================
        // RECORRER DOCUMENTOS
        // ======================================

        snapshot.forEach((doc) => {
            const data = doc.data();


            // ----------------------------------
            // OCULTAR CLASES DESACTIVADAS
            // ----------------------------------

            if (data.activa === false) {
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
                const parsedCapacity = Number(data.capacity);

                if (
                    Number.isFinite(parsedCapacity) &&
                    parsedCapacity > 0
                ) {
                    capacity = parsedCapacity;
                }
            }


            // ----------------------------------
            // ORDEN
            // ----------------------------------

            let orden = Number.MAX_SAFE_INTEGER;

            if (
                data.orden !== undefined &&
                data.orden !== null &&
                data.orden !== ""
            ) {
                const parsedOrden = Number(data.orden);

                if (Number.isFinite(parsedOrden)) {
                    orden = parsedOrden;
                }
            }


            // ----------------------------------
            // AÑADIR CLASE
            // ----------------------------------

            classes.push({
                firestoreId: doc.id,

                id: String(
                    data.id ?? doc.id
                ).trim(),

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

                activa: data.activa !== false,

                tipo: String(
                    data.tipo ?? ""
                ).trim(),

                orden: orden,

                bookedCount: Number(
                    data.bookedCount ?? 0
                )
            });
        });


        // ======================================
        // ORDEN DE GOOGLE SHEETS
        // ======================================
        //
        // El backend guarda "orden" según la
        // posición de la fila en Google Sheets.
        //
        // NO ordenamos por hora.
        // NO agrupamos por TIPO.
        // ======================================

        classes.sort((a, b) => {
            return a.orden - b.orden;
        });


        // --------------------------------------
        // GUARDAR EN VARIABLE GLOBAL
        // --------------------------------------

        allClasses = classes;


        // --------------------------------------
        // MOSTRAR
        // --------------------------------------

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
// Los horarios aparecen en el mismo orden
// en el que aparecen por primera vez
// en Google Sheets.
// ==========================================

function getSchedules(classes) {
    const schedules = [];

    classes.forEach((classItem) => {
        if (!classItem.time) {
            return;
        }

        const normalizedTime = normalizeTime(
            classItem.time
        );

        if (!normalizedTime) {
            return;
        }

        if (!schedules.includes(normalizedTime)) {
            schedules.push(normalizedTime);
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


    // --------------------------------------
    // OBTENER HORARIOS
    // --------------------------------------

    const schedules = getSchedules(classes);


    // --------------------------------------
    // ACTIVIDADES SIN HORARIO
    // --------------------------------------

    const classesWithoutTime = classes.filter(
        (classItem) => !classItem.time
    );


    // ======================================
    // CABECERA
    // ======================================

    const heading = document.createElement("div");

    heading.className = "schedule-heading";

    heading.innerHTML = `
        <h3>Horarios</h3>
        <p>
            Selecciona un horario para ver las actividades disponibles.
        </p>
    `;

    schedulesSection.appendChild(heading);


    // ======================================
    // CONTENEDOR DE HORARIOS
    // ======================================

    const buttonsContainer = document.createElement("div");

    buttonsContainer.className = "schedule-buttons";


    // ======================================
    // CREAR CADA HORARIO
    // ======================================

    schedules.forEach((schedule) => {
        const scheduleItem = document.createElement("div");

        scheduleItem.className = "schedule-item";


        // ----------------------------------
        // BOTÓN DEL HORARIO
        // ----------------------------------

        const button = document.createElement("button");

        button.type = "button";

        button.className = "schedule-button";

        button.innerHTML = `
            <span>${schedule}</span>
            <small>
                Ver actividades de este horario
            </small>
        `;


        // ----------------------------------
        // CONTENIDO
        // ----------------------------------

        const content = document.createElement("div");

        content.className = "schedule-item-content";


        // ----------------------------------
        // CLASES DE ESTE HORARIO
        // ----------------------------------
        //
        // filter() mantiene el orden original.
        // Como "classes" ya está ordenado por
        // "orden", aquí conservamos exactamente
        // el orden de Google Sheets.
        // ----------------------------------

        const scheduleClasses = classes.filter(
            (classItem) => {
                return (
                    normalizeTime(classItem.time) === schedule
                );
            }
        );


        renderClassesIntoContainer(
            scheduleClasses,
            content
        );


        // ==================================
        // ABRIR / CERRAR HORARIO
        // ==================================

        button.addEventListener(
            "click",
            () => {
                const isOpen =
                    content.classList.contains("open");


                // ------------------------------
                // CERRAR OTROS
                // ------------------------------

                document
                    .querySelectorAll(
                        ".schedule-item-content.open"
                    )
                    .forEach((element) => {
                        if (element !== content) {
                            element.classList.remove("open");
                        }
                    });


                document
                    .querySelectorAll(
                        ".schedule-button.selected"
                    )
                    .forEach((element) => {
                        if (element !== button) {
                            element.classList.remove("selected");
                        }
                    });


                // ------------------------------
                // ABRIR / CERRAR ACTUAL
                // ------------------------------

                if (isOpen) {
                    content.classList.remove("open");
                    button.classList.remove("selected");
                } else {
                    content.classList.add("open");
                    button.classList.add("selected");
                }
            }
        );


        // --------------------------------------
        // AÑADIR AL DOM
        // --------------------------------------

        scheduleItem.appendChild(button);

        scheduleItem.appendChild(content);

        buttonsContainer.appendChild(scheduleItem);
    });


    schedulesSection.appendChild(
        buttonsContainer
    );


    // ======================================
    // ACTIVIDADES SIN HORARIO
    // ======================================

    if (classesWithoutTime.length > 0) {
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
        // MANTENER ORDEN DEL SHEET
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
// RENDERIZAR CLASES EN CONTENEDOR
// ==========================================

function renderClassesIntoContainer(
    classes,
    container
) {
    container.innerHTML = "";


    // --------------------------------------
    // SIN CLASES
    // --------------------------------------

    if (!classes.length) {
        container.innerHTML = `
            <div class="no-classes">
                No hay actividades disponibles
                en este horario.
            </div>
        `;

        return;
    }


    // --------------------------------------
    // GRID
    // --------------------------------------

    const grid = document.createElement("div");

    grid.className = "class-grid-inner";


    // --------------------------------------
    // CREAR TARJETAS
    // --------------------------------------
    //
    // NO agrupamos por TIPO.
    // NO volvemos a ordenar.
    // --------------------------------------

    classes.forEach((classItem) => {
        grid.appendChild(
            createClassCard(classItem)
        );
    });


    container.appendChild(grid);
}


// ==========================================
// CREAR TARJETA DE CLASE
// ==========================================

function createClassCard(classItem) {
    const card = document.createElement("article");

    card.className = "class-card";


    // ======================================
    // IMAGEN
    // ======================================

    if (classItem.imageUrl) {
        const image = document.createElement("img");

        image.src = classItem.imageUrl;

        image.alt =
            classItem.title || "Actividad";

        image.loading = "lazy";


        image.onerror = () => {
            image.style.display = "none";
        };


        card.appendChild(image);
    }


    // ======================================
    // CUERPO
    // ======================================

    const body = document.createElement("div");

    body.className = "card-body";


    // ======================================
    // TIPO
    // ======================================

    if (classItem.tipo) {
        const type = document.createElement("div");

        type.className = "class-type";

        type.textContent = classItem.tipo;

        body.appendChild(type);
    }


    // ======================================
    // TÍTULO
    // ======================================

    const title = document.createElement("h4");

    title.textContent =
        classItem.title || "Actividad";

    body.appendChild(title);


    // ======================================
    // CENTRO / ENTRENADOR
    // ======================================

    if (classItem.trainer) {
        const trainer = document.createElement("div");

        trainer.className = "class-trainer";

        trainer.textContent = classItem.trainer;

        body.appendChild(trainer);
    }


    // ======================================
    // FECHA
    // ======================================

    if (classItem.date) {
        const date = document.createElement("div");

        date.className = "class-date";

        date.textContent =
            formatDate(classItem.date);

        body.appendChild(date);
    }


    // ======================================
    // DESCRIPCIÓN
    // ======================================

    if (classItem.description) {
        const description = document.createElement("div");

        description.className =
            "class-description";

        description.textContent =
            classItem.description;

        body.appendChild(description);
    }


    // ======================================
    // CAPACIDAD
    // ======================================

    const capacity = document.createElement("div");

    capacity.className = "class-capacity";


    const numericCapacity =
        Number(classItem.capacity);


    const hasLimitedCapacity =
        Number.isFinite(numericCapacity) &&
        numericCapacity > 0;


    if (hasLimitedCapacity) {
        const bookedCount =
            Number(classItem.bookedCount || 0);


        const remaining =
            Math.max(
                numericCapacity - bookedCount,
                0
            );


        if (remaining <= 0) {
            capacity.textContent =
                "Clase completa";

            capacity.classList.add("full");
        } else {
            capacity.textContent =
                `${remaining} ${
                    remaining === 1
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
    // BOTÓN / ACCIONES
    // ======================================

    const actions = document.createElement("div");

    actions.className = "card-actions";


    const button = document.createElement("button");

    button.type = "button";

    button.className =
        "reserve-class-button";

    button.textContent = "Reservar";


    // ======================================
    // COMPROBAR SI ESTÁ COMPLETA
    // ======================================

    const bookedCount =
        Number(classItem.bookedCount || 0);


    const isFull =
        hasLimitedCapacity &&
        bookedCount >= numericCapacity;


    if (isFull) {
        button.disabled = true;

        button.textContent = "Completa";

        button.classList.add("disabled");
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

            goToReservation(classItem);
        }
    );


    actions.appendChild(button);

    body.appendChild(actions);

    card.appendChild(body);


    return card;
}


// ==========================================
// IR A LA PÁGINA DE RESERVA
// ==========================================

function goToReservation(classItem) {
    try {
        const params = new URLSearchParams();


        // ----------------------------------
        // ID DE LA CLASE
        // ----------------------------------

        params.set(
            "classId",
            String(classItem.id)
        );


        // ----------------------------------
        // DATOS ADICIONALES
        // ----------------------------------

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


        // ----------------------------------
        // REDIRIGIR
        // ----------------------------------

        const url =
            `/reservar?${params.toString()}`;

        console.log(
            "Redirigiendo a:",
            url
        );

        window.location.href = url;

    } catch (error) {
        console.error(
            "Error al ir a la reserva:",
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
