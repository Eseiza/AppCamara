# Conectar la Cámara de Fermentado a Firebase

Con esto los datos (movimientos, lecturas de temperatura/humedad) quedan
sincronizados en tiempo real entre todos los dispositivos que abran la app,
igual que en tus otras apps de Romero Panificados.

Si no hacés nada de esto, la app sigue funcionando igual que ahora (guardado
local en cada dispositivo, sin sincronizar).

## 1. Crear el proyecto (o usar uno existente)

Si ya tenés un proyecto de Firebase para otra app de Romero Panificados,
podés usar el mismo y saltar a la sección 3 — solo agregás una app web nueva
dentro de ese proyecto.

1. Entrá a https://console.firebase.google.com
2. "Agregar proyecto" → nombre (ej: `romero-panificados`) → seguí los pasos.

## 2. Habilitar Firestore

1. En el menú lateral: **Compilación → Firestore Database**
2. "Crear base de datos"
3. Elegí la ubicación (ej: `southamerica-east1`, la más cercana a Argentina)
4. Modo: **producción** (las reglas del paso 4 lo dejan seguro igual)

## 3. Agregar una app web y copiar las credenciales

1. En **Configuración del proyecto** (ícono ⚙ arriba a la izquierda) → pestaña
   "Tus apps" → ícono `</>` (Web)
2. Ponele un apodo (ej: "Cámara de Fermentado") → Registrar app
3. Te va a mostrar un bloque `firebaseConfig = {...}` — copiá esos valores
4. Pegalos en el archivo **`firebase-config.js`** de esta carpeta, reemplazando
   los que dicen `TU_API_KEY`, `tu-proyecto`, etc.

## 4. Habilitar autenticación anónima (recomendado)

Esto evita tener que armar una pantalla de login, pero igual protege los
datos de que cualquiera en internet los lea o edite sin pasar por la app.

1. **Compilación → Authentication** → "Comenzar"
2. Pestaña "Sign-in method" → "Anonymous" → Habilitar → Guardar

## 5. Reglas de seguridad de Firestore

En **Firestore Database → Reglas**, reemplazá el contenido por esto y publicá:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Esto permite leer/escribir solo a quien haya entrado (aunque sea de forma
anónima) desde la propia app — bloquea el acceso directo de terceros.

## 6. Probar

1. Abrí `index.html` (o subilo a Render como las otras apps)
2. Arriba a la derecha, debajo del turno, debería decir
   **"● Conectado a Firebase — sincronizado en tiempo real"**
3. Abrí la misma página en otro dispositivo/pestaña y cargá un producto en
   la cámara: tiene que aparecer en el otro al instante.

Si dice "No se pudo conectar", revisá que `firebase-config.js` tenga las
credenciales correctas y que las reglas del paso 5 estén publicadas.

## Estructura de datos en Firestore

- **`movimientos`** (colección): un documento por cada vez que se carga un
  producto en un carro — `id`, `p` (pasillo), `c` (carro), `prod`, `in`
  (timestamp de ingreso), `out` (timestamp de egreso o `null`).
- **`lecturas`** (colección): un documento por cada lectura de temperatura y
  humedad — `t`, `setTemp`, `setHum`, `tempReal`, `humReal`, `obs`.
- **`config/temp`** (documento): el set point actual de temperatura y
  humedad (`setTemp`, `setHum`).

El **perfil (rol)** seleccionado en el `<select>` no se sincroniza — es una
preferencia de cada dispositivo, se guarda solo en su localStorage.
