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


        // Ordenar por fecha y hora
        classes.sort((a, b) => {

            const dateA =
                `${a.date} ${a.time}`;

            const dateB =
                `${b.date} ${b.time}`;

            return dateA.localeCompare(dateB);

        });


        // No hay clases
        if (classes.length === 0) {

            classGrid.innerHTML = `
                <p>
                    No hay clases disponibles actualmente.
                </p>
            `;

            return;
        }


        // Crear tarjetas
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


            classGrid.appendChild(card);

        });


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
   INICIAR
========================================================= */

loadClasses();
