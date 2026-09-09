const classGrid = document.getElementById("class-grid");


async function loadClasses() {

    try {

        const response = await fetch("/api/classes");

        if (!response.ok) {
            throw new Error("No se pudieron cargar las clases");
        }

        const classes = await response.json();

        classGrid.innerHTML = "";

        classes.forEach(classItem => {

            const card = document.createElement("article");

            card.className = "class-card";

            const isFull = classItem.places_left === 0;

            card.innerHTML = `
                <img
                    src="${classItem.image_url}"
                    alt="${classItem.title}"
                >

                <div class="card-body">

                    <div class="card-top">

                        <span>
                            ${classItem.duration} MIN
                        </span>

                        <span class="availability ${isFull ? "full" : ""}">
                            ${classItem.places_left} plazas
                        </span>

                    </div>

                    <h3>
                        ${classItem.title}
                    </h3>

                    <p>
                        ${classItem.trainer}
                        ·
                        ${formatDate(classItem.class_date)}
                        ·
                        ${classItem.class_time}
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

        console.error(error);

        classGrid.innerHTML = `
            <p>
                No se han podido cargar las clases.
                Inténtalo de nuevo.
            </p>
        `;
    }
}


function formatDate(dateString) {

    const date = new Date(dateString);

    return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}


function addReservationEvents() {

    const buttons = document.querySelectorAll(".reserve");

    buttons.forEach(button => {

        button.addEventListener("click", async () => {

            const classId = button.dataset.classId;

            await reserveClass(classId);

        });

    });
}


async function reserveClass(classId) {

    try {

        const response = await fetch(`/api/classes/${classId}/book`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            }
        });


        const result = await response.json();


        if (!response.ok) {

            alert(result.message || "No se pudo realizar la reserva");

            return;
        }


        alert("¡Reserva realizada correctamente!");

        loadClasses();

    } catch (error) {

        console.error(error);

        alert("Ha ocurrido un error al realizar la reserva.");

    }
}


loadClasses();