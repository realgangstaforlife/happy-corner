# 🤖 Guía para Antigravity - Nueva API

Cada que hagas una nueva api, sigue lo siguiente.

## Template para nueva API

```javascript
// src/handlers/[nombre].js
export async function handle[NombreAPI](request, env) {
  // Tu código aquí
}
```

## Checklist antes de enviar

- [ ] Código en JavaScript puro (sin imports de Node)
- [ ] Maneja errores con try/catch
- [ ] Valida inputs
- [ ] Devuelve JSON
- [ ] Tiene logging

## Cómo enviar a Evan

1. Escribe el `.js` completo
2. Envía mensaje: "Nueva API lista para copiar/pegar"
3. Pega el código acá
4. Evan lo copia en workers repo
5. Evan hace `wrangler deploy`

## Variables de entorno disponibles

- `env.FIREBASE_API_KEY`
- `env.FIREBASE_PROJECT_ID`
- `env.RESEND_API_KEY`
- etc

## Ejemplo mínimo

```javascript
export async function handleMiAPI(request, env) {
  try {
    const data = await request.json();
    // Lógica
    return new Response(JSON.stringify({ success: true }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
```