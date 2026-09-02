# HappyNotas Routing

## Funcionamiento en Vercel
Dado que el proyecto utiliza un único repositorio de GitHub (Monorepo-style) desplegado en un solo proyecto de Vercel, todo el enrutamiento se gestiona a través del archivo `/vercel.json` en la RAÍZ del repositorio.

El enrutador de Vercel (Edge Router) procesa las reglas `rewrites` **de arriba hacia abajo en orden secuencial**. 

### Reglas basadas en Subdominios
Para servir contenido diferente según el subdominio, usamos la propiedad `has`:
```json
{ 
  "source": "/:path*", 
  "has": [{ "type": "host", "value": "notas.happycorner.top" }], 
  "destination": "/notas-corner/:path*" 
}
```
Esto intercepta silenciosamente el tráfico de `notas.happycorner.top` y sirve el contenido que físicamente está en la carpeta `/notas-corner/`, haciendo que las URLs se vean limpias en el navegador (ej. `/dashboard` en lugar de `/notas-corner/dashboard`).

## Orden Estricto
1. **Subdominios Específicos PRIMERO**: `notas.happycorner.top` y `auth.happycorner.top` deben tener sus reglas de reescritura al inicio del bloque `rewrites`.
2. **APIs y Serverless Functions**: En el medio, reglas que reescriben endpoints.
3. **Dominio Principal (Catch-all) ÚLTIMO**: Las reglas sin condicional `has` (que manejan `happycorner.top`) deben ir al final. Si se ponen al principio, interceptarán las peticiones de los subdominios.

## Troubleshooting Común
- **Página Incorrecta en Subdominio**: Si entras a `notas.happycorner.top` y ves la tienda, significa que la regla `has` falló, la regex está mal formulada (causando un error 500 silencioso en el enrutador), o el dominio principal está atrapando la ruta antes.
- **`vercel.json` Anidados**: Vercel **ignora** cualquier `vercel.json` que no esté en la raíz. Borrar archivos como `notas-corner/vercel.json` previene confusión para los desarrolladores.
- **Rutas Limpias en el Código JS**: Al usar `window.location.href`, usa rutas absolutas de raíz (`/dashboard`) y no la ruta física (`/notas-corner/dashboard`), ya que Vercel mapea la raíz lógicamente al directorio interno.
