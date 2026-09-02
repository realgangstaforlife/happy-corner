import { 
    initPromise, 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    onAuthStateChanged, 
    provider,
    signOut
} from './modules/auth.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let isLogin = true;
let firebaseOk = false;
let redirectUri = '';
let clientId = '';

// Get URL parameters
const params = new URLSearchParams(window.location.search);
redirectUri = params.get('redirect_uri') || 'https://happycorner.top';
clientId = params.get('client_id') || 'main';
const isLogout = window.location.pathname.includes('logout') || params.get('logout') === '1';

initPromise
    .then(() => {
        firebaseOk = true;
        if (isLogout) {
            handleLogout();
        } else {
            onAuthStateChanged(auth, async user => {
                if (user) {
                    await handleSSORedirect(user);
                }
            });
        }
    })
    .catch((e) => {
        setErr('Error de conexión con Firebase.');
        console.error(e);
    });

async function handleLogout() {
    try {
        await signOut(auth);
        document.getElementById('modal-title').textContent = "Sesión cerrada";
        document.getElementById('subtitle').textContent = "Has cerrado sesión correctamente.";
        document.getElementById('auth-form').style.display = 'none';
        document.querySelector('.or-row').style.display = 'none';
        document.querySelector('.btn-google').style.display = 'none';
        document.querySelector('.switch-txt').innerHTML = `<a href="/">Volver a Iniciar Sesión</a>`;
        
        // Wait 2 seconds and redirect back to where they came from (or main page)
        setTimeout(() => {
            window.location.href = redirectUri;
        }, 2000);
    } catch (err) {
        console.error(err);
    }
}

async function handleSSORedirect(user) {
    setLoading(true, "Redirigiendo...");
    try {
        // Obtenemos el Custom Token desde el backend consolidado
        const res = await fetch('/api/account?action=createSSOToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid: user.uid, email: user.email })
        });
        
        const data = await res.json();
        
            if (data.token) {
                if (redirectUri && redirectUri.startsWith('http')) {
                    const url = new URL(redirectUri);
                    url.searchParams.set('token', data.token);
                    window.location.href = url.toString();
                } else {
            window.location.href = `https://notas.happycorner.top/notas-corner/dashboard?token=${data.token}`;
                }
            } else {
                setErr(data.error || 'No se pudo generar el token de acceso.');
                setLoading(false);
        }
    } catch (err) {
        console.error(err);
        setErr('Error de conexión al crear token SSO.');
        setLoading(false);
    }
}

function setErr(msg) {
    var el = document.getElementById('auth-err');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function setLoading(on, text = '') {
    var btn = document.getElementById('btn-submit');
    if(btn) {
        btn.disabled = on;
        btn.innerHTML = on
            ? '<i class="fa-solid fa-spinner fa-spin"></i> ' + (text || 'Cargando...')
            : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta');
    }
}

function errMsg(code) {
    var m = {
        'auth/invalid-credential'  : 'Correo o contraseña incorrectos.',
        'auth/user-not-found'      : 'No existe una cuenta con ese correo.',
        'auth/wrong-password'      : 'Contraseña incorrecta.',
        'auth/email-already-in-use': 'Este correo ya está registrado.',
        'auth/weak-password'       : 'La contraseña debe tener al menos 6 caracteres.',
        'auth/popup-closed-by-user': 'Cerraste la ventana de Google. Intenta de nuevo.',
        'auth/network-request-failed': 'Sin conexión. Revisa tu red.',
    };
    return m[code] || 'Error inesperado. Intenta de nuevo.';
}

window.toggleMode = function() {
    isLogin = !isLogin;
    document.getElementById('modal-title').textContent = isLogin ? 'Iniciar Sesión' : 'Crear Cuenta';
    document.getElementById('btn-submit').textContent  = isLogin ? 'Iniciar Sesión' : 'Crear Cuenta';
    document.getElementById('switch-txt').textContent  = isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
    document.getElementById('switch-link').textContent = isLogin ? 'Crear una' : 'Iniciar sesión';
    document.getElementById('auth-form').reset();
    setErr('');
    setTimeout(() => document.getElementById('f-email').focus(), 120);
};

window.submitForm = async function(e) {
    e.preventDefault();
    if (!firebaseOk) {
        setErr('No hay conexión con el servidor.');
        return;
    }
    var email = document.getElementById('f-email').value.trim();
    var pass  = document.getElementById('f-pass').value;
    setErr('');
    setLoading(true);
    
    try {
        let cred;
        if (isLogin) {
            cred = await signInWithEmailAndPassword(auth, email, pass);
        } else {
            cred = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, 'users', cred.user.uid), {
                uid: cred.user.uid, email: cred.user.email,
                createdAt: Date.now(),
                preferences: { theme: 'dark' }
            }, { merge: true });
        }
        // handleSSORedirect will be triggered by onAuthStateChanged
    } catch (err) {
        setLoading(false);
        setErr(errMsg(err.code));
    }
};

window.googleLogin = async function() {
    if (!firebaseOk) {
        setErr('No hay conexión con el servidor.');
        return;
    }
    try {
        var cred = await signInWithPopup(auth, provider);
        await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid, email: cred.user.email,
            displayName: cred.user.displayName, createdAt: Date.now(),
            preferences: { theme: 'dark' }
        }, { merge: true });
        // handleSSORedirect will be triggered by onAuthStateChanged
    } catch (err) {
        setErr(errMsg(err.code));
    }
};
