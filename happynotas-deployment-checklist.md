# HappyNotas Deployment Checklist

## Verificaciones Pre-Producción
Antes de hacer commit y push a la rama `main` (lo que dispara el auto-deploy en Vercel), asegúrate de revisar:

1. **Límites de Vercel Hobby Tier**:
   - Vercel Hobby solo permite **12 Serverless Functions**.
   - No agregues archivos `.js` de alto nivel directamente dentro de la carpeta `/api/` si no los estás usando. Utiliza directorios ignorados como `/api/_lib/` para dependencias.
   - Si creas un nuevo endpoint, intenta fusionarlo con `/api/account.js` utilizando la técnica de query `?action=xyz`.

2. **Vercel Routing (`vercel.json`)**:
   - Revisa que las sintaxis Regex (cuando se usan `path-to-regexp`) sean correctas. Preferible usar comodines simples como `/:path*`.
   - Revisa que los headers no introduzcan características bloqueadas en navegadores modernos (ej. policies obsoletas o no estandarizadas).
   - Revisa que el orden de los bloqueos (`has` -> específicos) prevalezcan por encima de los catch-alls.

3. **Seguridad (Firebase Rules)**:
   - Si agregaste una colección nueva, ¿tiene `rules` correspondientes? Si no las tiene, la aplicación fallará silenciosamente en el cliente con un error de `insufficient permissions`.
   - Ejecuta localmente `firebase deploy --only firestore:rules` para sincronizarlas antes de que el frontend pase a producción.

## Proceso de Deploy
1. **GitHub Push**:
   - Cualquier push a la rama principal gatillará la Github Action de Vercel.
2. **Revisión de Estado**:
   - Ve al dashboard de Vercel. Si el estado es `Failed` instantáneo (sin logs de build), el problema es de sintaxis en `vercel.json`.
   - Si el estado falla en *Build*, haz click en el Log de Vercel y verifica si el error menciona `"12 serverless functions max"`.

## Troubleshooting Común
- **CORS Errors al hacer login o obtener config**:
  - Asegúrate de que las rutas que responden al frontend tengan los headers de CORS correspondientes, o utiliza la misma red de Edge Functions (Proxies en `vercel.json`) para evitar peticiones cruzadas.
- **Tipografía "Sketchy" o Rota**:
  - Revisa que los Font-Weights necesarios estén importados desde Google Fonts en el encabezado global, y que el CSS haga fallback adecuado.
- **Vercel Cache**:
  - A veces Vercel hace cache agresivo de archivos en el Edge. Revisa los headers `x-vercel-cache` de la respuesta de red. Si es un `HIT` desactualizado, fuerza un re-deploy (sin cache) desde el panel de control de Vercel.
