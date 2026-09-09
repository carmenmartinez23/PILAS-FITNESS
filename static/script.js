import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "pilas-fitness.firebaseapp.com",
    projectId: "pilas-fitness",
    storageBucket: "pilas-fitness.firebasestorage.app",
    messagingSenderId: "612445381929",
    appId: "1:612445381929:web:0e36a0e90935d340474338",
    measurementId: "G-WMB61LHBK1"
};
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const firebaseConfig = {
  apiKey: "...",
  authDomain: "pilas-fitness.firebaseapp.com",
  projectId: "pilas-fitness"
};



const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
document.getElementById("google-login").addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    console.log(result.user.email);
});