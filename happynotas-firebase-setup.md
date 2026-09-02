# HappyNotas Firebase Setup

## Inicialización y Configuración
HappyNotas utiliza el mismo proyecto de Firebase que la tienda principal (`happycorner-c17d3`).
Al inicializar la app en el cliente (`notas-corner/app.js`), se realiza un `fetch` dinámico a `/api/getConfig` (que utiliza CORS o es proxyado internamente) para obtener la configuración pública de Firebase sin exponerla directamente en el código fuente HTML.

## Estructura de Datos y Colecciones
El proyecto de Firebase contiene las siguientes colecciones clave para Notas:
- `notes`: Documentos individuales que representan una calificación (Subject, Grade, Term).
- `sharedLinks`: Registros para compartir enlaces públicos.
- `publicNotes`: Estructura para mostrar datos limitados sin autenticación.
*(Las colecciones de usuarios, roles, órdenes y productos pertenecen al módulo de Tienda/Auth).*

## Firestore Security Rules
Debido a que Firebase deniega todo por defecto en entornos de producción cerrados, las Security Rules deben explícitamente conceder acceso.

Las reglas críticas para HappyNotas se aplican en `/firestore.rules`:
```javascript
    match /notes/{noteId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
```
Esto asegura que un estudiante **solo** pueda acceder y modificar sus propios registros basándose en su `uid`.

Los enlaces públicos se gestionan así:
```javascript
    match /sharedLinks/{linkId} {
      allow read: if true;
      allow create, delete: if request.auth != null && request.auth.uid == request.resource.data.ownerId;
    }
```
Esto permite a cualquier persona acceder al enlace público (para validar si existe), pero solo el dueño puede revocarlo o crearlo.
