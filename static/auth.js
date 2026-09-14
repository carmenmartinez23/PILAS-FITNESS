import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


const ERROR_MESSAGES = {
    "auth/email-already-in-use": "Ya existe una cuenta con este correo.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/user-not-found": "No existe ninguna cuenta con este correo.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/popup-closed-by-user": "Has cerrado la ventana antes de terminar.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
};


function showError(message) {

    const box = document.getElementById("auth-error");

    if (box) {
        box.textContent = message;
        box.hidden = !message;
    }
}


function setLoading(button, loading) {

    if (!button) return;

    button.disabled = loading;

    button.dataset.originalText ??= button.textContent;

    button.textContent =
        loading
            ? "Un momento…"
            : button.dataset.originalText;
}


async function completeLogin(userCredential) {

    const idToken =
        await userCredential.user.getIdToken();

    const response =
        await fetch("/sesion", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": window.CSRF_TOKEN,
            },

            body: JSON.stringify({
                idToken
            }),
        });


    if (!response.ok) {
        throw new Error("session-failed");
    }


    const params =
        new URLSearchParams(
            window.location.search
        );


    window.location.href =
        params.get("next") || "/";
}


const form =
    document.getElementById("auth-form");


if (form) {

    const mode =
        form.dataset.mode;


    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            showError("");


            const submitButton =
                form.querySelector("button.submit");


            setLoading(
                submitButton,
                true
            );


            const email =
                form.email.value.trim();


            const password =
                form.password.value;


            try {

                if (mode === "register") {

                    const credential =
                        await createUserWithEmailAndPassword(
                            auth,
                            email,
                            password
                        );


                    await updateProfile(
                        credential.user,
                        {
                            displayName:
                                form.name.value.trim()
                        }
                    );


                    await completeLogin(
                        credential
                    );

                } else {

                    const credential =
                        await signInWithEmailAndPassword(
                            auth,
                            email,
                            password
                        );


                    await completeLogin(
                        credential
                    );
                }

            } catch (error) {

                console.error(
                    "Error de autenticación:",
                    error
                );


                showError(
                    ERROR_MESSAGES[error.code] ||
                    "Algo salió mal. Inténtalo de nuevo."
                );

            } finally {

                setLoading(
                    submitButton,
                    false
                );
            }
        }
    );
}


/*
 * RECUPERAR CONTRASEÑA
 */

const forgotPassword =
    document.getElementById(
        "forgot-password"
    );


if (forgotPassword) {

    forgotPassword.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();

            showError("");


            const emailInput =
                document.querySelector(
                    '#auth-form input[name="email"]'
                );


            if (!emailInput) return;


            const email =
                emailInput.value.trim();


            if (!email) {

                showError(
                    "Introduce tu correo electrónico para recuperar la contraseña."
                );


                emailInput.focus();

                return;
            }


            try {

                forgotPassword.textContent =
                    "Enviando…";


                forgotPassword.style.pointerEvents =
                    "none";


                const response =
                    await fetch(
                        "/recuperar-contrasena",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",

                                "X-CSRF-Token":
                                    window.CSRF_TOKEN,
                            },

                            body: JSON.stringify({
                                email
                            }),
                        }
                    );


                const responseText =
                    await response.text();
                
                    let data = {};
                    
                    try {
                        data = JSON.parse(responseText);
                    } catch (error) {
                        console.error(
                            "Respuesta no JSON del servidor:",
                            responseText
                        );
                    
                        throw new Error(
                            "El servidor ha devuelto un error. Revisa los logs de Render."
                        );
                    }


                if (!response.ok) {

                    throw new Error(
                        data.message ||
                        "No se ha podido enviar el correo."
                    );
                }


                showError(
                    "Si existe una cuenta con ese correo, recibirás un mensaje para restablecer tu contraseña. Revisa también la carpeta de spam."
                );

            } catch (error) {

                console.error(
                    "Error recuperando contraseña:",
                    error
                );


                showError(
                    error.message ||
                    "No se ha podido enviar el correo de recuperación."
                );

            } finally {

                forgotPassword.textContent =
                    "¿Has olvidado tu contraseña?";

                forgotPassword.style.pointerEvents =
                    "";
            }
        }
    );
}


/*
 * LOGIN CON GOOGLE
 */

const googleButton =
    document.getElementById(
        "google-login"
    );


if (googleButton) {

    googleButton.addEventListener(
        "click",
        async () => {

            showError("");


            try {

                const credential =
                    await signInWithPopup(
                        auth,
                        new GoogleAuthProvider()
                    );


                await completeLogin(
                    credential
                );

            } catch (error) {

                console.error(
                    "Error con Google:",
                    error
                );


                showError(
                    ERROR_MESSAGES[error.code] ||
                    "No se pudo iniciar sesión con Google."
                );
            }
        }
    );
}
