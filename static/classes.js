import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
getFirestore,
collection,
getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import {
getAuth,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
getFunctions,
httpsCallable
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);

// IMPORTANTE:
// La Cloud Function se desplegó en us-central1.
const functions = getFunctions(app, "us-central1");

const reserveClassFunction = httpsCallable(
functions,
"reserveClass"
);

const classGrid = document.getElementById("class-grid");

async function loadClasses() {

```
try {

    const snapshot =
        await getDocs(collection(db, "classes"));

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


    classes.sort((a, b) => {

        const dateA =
            `${a.date} ${a.time}`;

        const dateB =
            `${b.date} ${b.time}`;

        return dateA.localeCompare(dateB);

    });


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
                src="${classItem.imageUrl}"
                alt="${classItem.title}"
            >

            <div class="card-body">

                <div class="card-top">

                    <span>
                        ${classItem.duration} MIN
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
                    ${classItem.title}
                </h3>


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
                    ${
                        isFull
                            ? "Clase completa"
                            : 'Reservar plaza <b>→</b>'
                    }
                </button>

            </div>

        `;


        classGrid.appendChild(card);

    });


    addReservationEvents();


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
```

}

function formatDate(dateString) {

```
const date =
    new Date(`${dateString}T00:00:00`);


return date.toLocaleDateString(
    "es-ES",
    {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }
);
```

}

function addReservationEvents() {

```
const buttons =
    document.querySelectorAll(".reserve");


buttons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const classId =
                button.dataset.classId;

            reserveClass(classId);

        }
    );

});
```

}

async function reserveClass(classId) {

```
// ==========================================
// COMPROBAR USUARIO
// ==========================================

const user =
    auth.currentUser;


if (!user) {

    alert(
        "Debes iniciar sesión para reservar una clase."
    );

    window.location.href =
        "/login?next=" +
        encodeURIComponent(
            window.location.pathname +
            window.location.hash
        );

    return;
}


const button =
    document.querySelector(
        `.reserve[data-class-id="${classId}"]`
    );


try {

    // ======================================
    // DESACTIVAR BOTÓN
    // ======================================

    if (button) {

        button.disabled = true;

        button.innerHTML =
            "Reservando…";

    }


    // ======================================
    // LLAMAR A FIREBASE
    // ======================================

    const result =
        await reserveClassFunction({
            classId: classId
        });


    console.log(
        "Reserva realizada:",
        result.data
    );


    // ======================================
    // MOSTRAR ÉXITO
    // ======================================

    alert(
        "¡Reserva realizada correctamente!"
    );


    // Recargamos las clases para mostrar
    // las plazas actualizadas.

    await loadClasses();


} catch (error) {

    console.error(
        "Error realizando la reserva:",
        error
    );


    let message =
        "No se ha podido realizar la reserva.";


    switch (error.code) {

        case "functions/unauthenticated":

            message =
                "Debes iniciar sesión para reservar.";

            break;


        case "functions/already-exists":

            message =
                "Ya tienes reservada esta clase.";

            break;


        case "functions/resource-exhausted":

            message =
                "Lo sentimos, la clase está completa.";

            break;


        case "functions/not-found":

            message =
                "La clase ya no existe.";

            break;


        case "functions/invalid-argument":

            message =
                "La clase seleccionada no es válida.";

            break;

    }


    alert(message);


    // Volvemos a cargar para recuperar
    // el estado correcto de las plazas.

    await loadClasses();

}
```

}

// Esperamos a que Firebase Auth determine
// el estado del usuario antes de permitir
// reservas.

onAuthStateChanged(auth, () => {

```
loadClasses();
```

});
