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
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/popup-closed-by-user": "Has cerrado la ventana antes de terminar.",
};

function showError(message) {
    const box = document.getElementById("auth-error");
    if (box) {
        box.textContent = message;
        box.hidden = false;
    }
}

function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.dataset.originalText ??= button.textContent;
    button.textContent = loading ? "Un momento…" : button.dataset.originalText;
}

async function completeLogin(userCredential) {
    const idToken = await userCredential.user.getIdToken();
    const response = await fetch("/sesion", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": window.CSRF_TOKEN,
        },
        body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
        throw new Error("session-failed");
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || "/";
}

const form = document.getElementById("auth-form");
if (form) {
    const mode = form.dataset.mode;
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showError("");
        document.getElementById("auth-error").hidden = true;
        const submitButton = form.querySelector("button.submit");
        setLoading(submitButton, true);
        const email = form.email.value.trim();
        const password = form.password.value;
        try {
            if (mode === "register") {
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(credential.user, { displayName: form.name.value.trim() });
                await completeLogin(credential);
            } else {
                const credential = await signInWithEmailAndPassword(auth, email, password);
                await completeLogin(credential);
            }
        } catch (error) {
            showError(ERROR_MESSAGES[error.code] || "Algo salió mal. Inténtalo de nuevo.");
        } finally {
            setLoading(submitButton, false);
        }
    });
}

const googleButton = document.getElementById("google-login");
if (googleButton) {
    googleButton.addEventListener("click", async () => {
        showError("");
        document.getElementById("auth-error").hidden = true;
        try {
            const credential = await signInWithPopup(auth, new GoogleAuthProvider());
            await completeLogin(credential);
        } catch (error) {
            showError(ERROR_MESSAGES[error.code] || "No se pudo iniciar sesión con Google.");
        }
    });
}