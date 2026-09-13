import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const classGrid = document.getElementById("class-grid");

async function loadClasses() {
    try {
        const snapshot = await getDocs(collection(db, "classes"));

        classGrid.innerHTML = "";

        if (snapshot.empty) {
            classGrid.innerHTML = `
                <p>No hay clases disponibles actualmente.</p>
            `;
            return;
        }

        const classes = [];

        snapshot.forEach(doc => {
            classes.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Ordenar por fecha y hora
        classes.sort((a, b) => {
            const dateA = `${a.date} ${a.time}`;
            const dateB = `${b.date} ${b.time}`;

            return dateA.localeCompare(dateB);
        });

        classes.forEach(classItem => {
            const placesLeft =
                classItem.capacity - classItem.bookedCount;

            const isFull = placesLeft <= 0;

            const card = document.createElement("article");
            card.className = "class-card";

            card.innerHTML = `
                <img
                    src="${classItem.imageUrl}"
                    alt="${classItem.title}"
                >

                <div class="card-body">

                    <div class="card-top">
                        <span>${classItem.duration} MIN</span>

                        <span class="availability ${isFull ? "full" : ""}">
                            ${isFull
                    ? "Clase completa"
                    : `${placesLeft} plazas`}
                        </span>
                    </div>

                    <h3>${classItem.title}</h3>

                    <p>
                        ${classItem.trainer}
                        ·
                        ${formatDate(classItem.date)}
                        ·
                        ${classItem.time}
                    </p>

                    <p class="description">
                        ${classItem.description}
                    </p>

                    <button
                        class="reserve"
                        data-class-id="${classItem.id}"
                        ${isFull ? "disabled" : ""}
                    >
                        ${isFull
                    ? "Clase completa"
                    : 'Reservar plaza <b>→</b>'}
                    </button>

                </div>
            `;

            classGrid.appendChild(card);
        });

        addReservationEvents();

    } catch (error) {
        console.error("Error cargando las clases:", error);

        classGrid.innerHTML = `
            <p>
                No se han podido cargar las clases.
                Inténtalo de nuevo.
            </p>
        `;
    }
}

function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function addReservationEvents() {
    const buttons = document.querySelectorAll(".reserve");

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const classId = button.dataset.classId;

            reserveClass(classId);
        });
    });
}

async function reserveClass(classId) {
    alert("La reserva la conectaremos con Firebase en el siguiente paso.");
}

loadClasses();