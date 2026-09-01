import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    provider 
} from './modules/auth.js';
import { UIManager } from './modules/ui-manager.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from './modules/auth.js';

export function initAuth() {
    let isLoginMode = true;
    
    const modalTitle = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchLink = document.getElementById('auth-switch-link');
    const errorMsg = document.getElementById('auth-error');
    
    window.notasAppAuth = {
        openAuthModal(mode) {
            isLoginMode = mode === 'login';
            
            modalTitle.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
            submitBtn.textContent = 'Continuar';
            switchLink.textContent = isLoginMode ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Iniciar sesión';
            errorMsg.style.display = 'none';
            document.getElementById('auth-form').reset();
            
            UIManager.openModal('auth-modal');
        },
        
        closeAuthModal() {
            UIManager.closeModal('auth-modal');
        },
        
        async handleAuthSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            
            UIManager.showSpinner('auth-submit-btn');
            errorMsg.style.display = 'none';
            
            try {
                if (isLoginMode) {
                    await signInWithEmailAndPassword(auth, email, password);
                } else {
                    const cred = await createUserWithEmailAndPassword(auth, email, password);
                    // Crear perfil en Firestore
                    await setDoc(doc(db, 'users', cred.user.uid), {
                        uid: cred.user.uid,
                        email: cred.user.email,
                        createdAt: Date.now(),
                        preferences: {
                            theme: 'auto',
                            allowSharing: true
                        }
                    });
                }
                // Redirección se maneja en app.js onAuthStateChanged
            } catch (error) {
                console.error("Auth Error", error);
                errorMsg.textContent = this.getReadableError(error.code);
                errorMsg.style.display = 'block';
                UIManager.hideSpinner('auth-submit-btn');
            }
        },
        
        async handleGoogleLogin() {
            try {
                UIManager.openModal('auth-modal'); // Muestra overlay si no estaba
                const cred = await signInWithPopup(auth, provider);
                
                // Si es nuevo, intentar crear perfil
                setDoc(doc(db, 'users', cred.user.uid), {
                    uid: cred.user.uid,
                    email: cred.user.email,
                    displayName: cred.user.displayName,
                    createdAt: Date.now(),
                    preferences: {
                        theme: 'auto',
                        allowSharing: true
                    }
                }, { merge: true }); // Merge por si ya existe
            } catch (error) {
                console.error("Google Auth Error", error);
                errorMsg.textContent = this.getReadableError(error.code);
                errorMsg.style.display = 'block';
            }
        },
        
        getReadableError(code) {
            switch (code) {
                case 'auth/invalid-credential':
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    return 'Correo o contraseña incorrectos';
                case 'auth/email-already-in-use':
                    return 'Este correo ya está registrado';
                case 'auth/weak-password':
                    return 'La contraseña debe tener al menos 6 caracteres';
                default:
                    return 'Ocurrió un error. Intenta nuevamente.';
            }
        }
    };
    
    switchLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.notasAppAuth.openAuthModal(isLoginMode ? 'register' : 'login');
    });
}
