# HappyNotas SSO Flow

## Concepto
HappyNotas y Happy Corner (Tienda) comparten el mismo sistema de usuarios, pero operan bajo subdominios separados (`notas.happycorner.top`, `auth.happycorner.top`, `happycorner.top`).
Para evitar que el estudiante tenga que iniciar sesión múltiples veces, se utiliza un flujo Single Sign-On (SSO) centralizado.

## Flujo de Autenticación
1. **Intento de Acceso**: El estudiante intenta acceder a `notas.happycorner.top/dashboard`.
2. **Validación Local**: El script `app.js` detecta que no hay una sesión activa de Firebase local.
3. **Redirección al Auth Central**:
   - `window.location.href = "https://auth.happycorner.top?client_id=notas&redirect_uri=..."`
   - El parámetro `redirect_uri` contiene la URL original (ej. `notas.happycorner.top/dashboard`).
4. **Inicio de Sesión en `auth.happycorner.top`**:
   - El usuario inicia sesión (Email/Pass o Google).
   - Firebase Auth emite una sesión válida en este subdominio.
5. **Generación del Custom Token**:
   - Una vez autenticado exitosamente, el cliente en `auth` hace una petición `POST` al backend central (`/api/account?action=createSSOToken`).
   - El backend utiliza `firebase-admin` para crear un **Custom Token** firmado, válido por 1 hora (`auth.createCustomToken(uid)`).
   - El backend devuelve este token al cliente.
6. **Retorno al Subdominio Original**:
   - El cliente en `auth` redirige de vuelta a la URL especificada en `redirect_uri`, adjuntando el token:
   - `https://notas.happycorner.top/dashboard?token=eyJhbGci...`
7. **Consumo del Token**:
   - `notas.happycorner.top` detecta el parámetro `token` en la URL.
   - Utiliza `signInWithCustomToken(auth, token)` para establecer la sesión de Firebase en su propio dominio.
   - Inmediatamente limpia la URL usando `history.replaceState()` por motivos de seguridad (para que el token no se filtre ni quede en el historial).
   - El usuario está autenticado y tiene acceso al dashboard.

## Logout
El cierre de sesión debe invalidar el acceso en toda la plataforma.
Al hacer logout en Notas, se redirige silenciosamente a `auth.happycorner.top/logout`, el cual destruye la sesión central y redirige al index.
