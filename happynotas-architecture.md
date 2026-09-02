# HappyNotas Architecture

## Descripción General
HappyNotas es una aplicación de gestión de calificaciones académicas (no una app de notas generales). Permite a los estudiantes universitarios:
1. Ver y llevar un registro de sus calificaciones por asignatura.
2. Calcular promedios generales y por periodo.
3. Hacer seguimiento continuo a su rendimiento académico.
4. Compartir acceso de sólo lectura a sus transcripciones académicas mediante un enlace público.

## Flujos de Usuario

### 1. Estudiante Viendo Calificaciones
- **Ingreso**: El usuario ingresa a `notas.happycorner.top`.
- **Autenticación**: Si no tiene sesión, es redirigido a `auth.happycorner.top` (SSO), que genera un Custom Token y lo devuelve a Notas.
- **Dashboard**: Una vez autenticado, el dashboard consulta la colección `notes` en Firestore donde `userId == request.auth.uid`.
- **Visualización**: Se renderizan las calificaciones, agrupadas por semestres o asignaturas.

### 2. Compartir Transcripción
- **Generación de Link**: Desde el dashboard, el estudiante selecciona "Compartir notas".
- **Backend**: Se crea un documento en la colección `sharedLinks` asociado al UID del creador.
- **Visualización Pública**: Cualquier persona con el enlace (ej: `/shared/:uuid`) puede visualizar las notas a través de la colección `publicNotes` (o directamente con permisos condicionados), sin necesidad de autenticarse.

## Estructura de Datos (Firestore)

### Colección: `notes`
Almacena las calificaciones reales de los estudiantes.
- `id`: String (Generado por Firestore)
- `userId`: String (UID del estudiante)
- `subject`: String (Nombre de la asignatura)
- `grade`: Number (Calificación obtenida)
- `term`: String (Semestre/Periodo)
- `createdAt`: Timestamp

### Colección: `sharedLinks`
Almacena los identificadores únicos para acceso público.
- `linkId`: String (UUID público)
- `ownerId`: String (UID del estudiante)
- `active`: Boolean
- `createdAt`: Timestamp

### Colección: `publicNotes`
Vista segura o índice de notas públicas. (Alternativamente, `notes` puede exponerse si la regla de seguridad evalúa el enlace).
- `noteId`: String
- `data`: Objeto con las calificaciones anonimizadas o limitadas.

## Security Model
La seguridad se maneja estrictamente mediante **Firestore Security Rules**:
- Las notas (`notes`) solo pueden ser leídas o modificadas si `request.auth.uid == resource.data.userId`.
- Nadie más (ni siquiera otros usuarios autenticados) puede leer las calificaciones de un estudiante.
- Los enlaces compartidos (`sharedLinks`) son de creación exclusiva del dueño (`ownerId`), pero de lectura pública (`allow read: if true;`).
- Cualquier intento de lectura pública directa a `notes` falla por defecto, requiriendo el token adecuado provisto por la autenticación SSO o el enlace de compartición.
